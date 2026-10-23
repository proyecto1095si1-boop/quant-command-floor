"use strict";

const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  fsp = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  zlib = require("node:zlib"),
  { pipeline } = require("node:stream/promises"),
  { execFileSync } = require("node:child_process"),
  { JsonlStore } = require("../server/data/jsonl-store.js");

function row(payload) {
  return JSON.stringify({
    checksum: crypto
      .createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex"),
    payload,
  });
}

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "qcf-jsonl-stream-")),
    store = new JsonlStore(root),
    event = (id, extra = {}) => ({
      id,
      receivedAt: new Date(1700000000000 + id).toISOString(),
      ...extra,
    });
  try {
    await fsp.mkdir(path.join(root, "ordered"));
    await fsp.writeFile(
      path.join(root, "ordered", "2023-11-14.jsonl.gz"),
      zlib.gzipSync(row(event(1)) + "\n\n" + row(event(2)) + "\n"),
    );
    await fsp.writeFile(
      path.join(root, "ordered", "2023-11-15.jsonl"),
      row(event(3, { text: "ñ🪙".repeat(20000) })) + "\r\n" + row(event(4)),
    );
    assert.deepEqual(
      (await store.replay("ordered")).map((x) => x.id),
      [1, 2, 3, 4],
    );
    assert.equal(
      (await store.replay("ordered"))[2].text,
      "ñ🪙".repeat(20000),
      "UTF-8 survives chunk boundaries",
    );
    assert.deepEqual(
      (await store.tail("ordered", 2)).map((x) => x.id),
      [3, 4],
    );
    assert.deepEqual(
      (await store.tail("ordered", 10)).map((x) => x.id),
      [1, 2, 3, 4],
    );
    assert.deepEqual(
      (await store.tail("ordered", 0)).map((x) => x.id),
      [4],
    );
    assert.deepEqual(
      (
        await store.replay("ordered", {
          from: 1700000000002,
          to: 1700000000003,
        })
      ).map((x) => x.id),
      [2, 3],
    );
    assert.deepEqual(
      (await store.replay("ordered", { limit: 1 })).map((x) => x.id),
      [1],
    );
    assert.deepEqual(await store.tail("missing"), []);
    assert.deepEqual(await store.verify("ordered"), { valid: true, events: 4 });

    await fsp.mkdir(path.join(root, "bad"));
    await fsp.writeFile(
      path.join(root, "bad", "2023-11-14.jsonl"),
      row(event(1)).replace('"id":1', '"id":9') + "\n" + row(event(2)),
    );
    await assert.rejects(
      store.tail("bad", 1),
      /checksum-mismatch/,
      "tail must validate older records too",
    );
    await assert.rejects(
      store.replay("bad", { from: 1700000000002 }),
      /checksum-mismatch/,
    );
    assert.equal((await store.verify("bad")).valid, false);
    await fsp.mkdir(path.join(root, "broken"));
    await fsp.writeFile(
      path.join(root, "broken", "2023-11-14.jsonl.gz"),
      "not gzip",
    );
    await assert.rejects(store.replay("broken"), /header|compression/i);
    await fsp.mkdir(path.join(root, "truncated"));
    const compressed = zlib.gzipSync(row(event(1)) + "\n");
    await fsp.writeFile(
      path.join(root, "truncated", "2023-11-14.jsonl.gz"),
      compressed.subarray(0, compressed.length - 6),
    );
    assert.equal((await store.verify("truncated")).valid, false);
    await fsp.mkdir(path.join(root, "partial"));
    await fsp.writeFile(
      path.join(root, "partial", "2023-11-14.jsonl"),
      row(event(1)) + '\n{"checksum":',
    );
    assert.deepEqual(
      (await store.replay("partial", { limit: 1 })).map((x) => x.id),
      [1],
    );
    assert.equal((await store.verify("partial")).valid, false);

    // A small child heap makes accidental whole-file accumulation reproducible in CI.
    await fsp.mkdir(path.join(root, "large"));
    await fsp.mkdir(path.join(root, "large-gzip"));
    const file = path.join(root, "large", "2023-11-14.jsonl"),
      handle = await fsp.open(file, "w"),
      text = "ñ".repeat(4096);
    try {
      for (let i = 0; i < 4000; i++)
        await handle.write(row(event(i, { text })) + "\n");
    } finally {
      await handle.close();
    }
    await pipeline(
      fs.createReadStream(file),
      zlib.createGzip(),
      fs.createWriteStream(
        path.join(root, "large-gzip", "2023-11-14.jsonl.gz"),
      ),
    );
    const script = `
      const assert = require('node:assert/strict');
      const {JsonlStore} = require(${JSON.stringify(path.resolve(__dirname, "../server/data/jsonl-store.js"))});
      (async () => {
        const store = new JsonlStore(process.argv[1]);
        for (const name of ['large', 'large-gzip']) {
          assert.deepEqual((await store.tail(name, 3)).map(x => x.id), [3997,3998,3999]);
          assert.deepEqual(await store.verify(name), {valid:true,events:4000});
          assert.equal((await store.replay(name, {limit:1}))[0].id, 0);
        }
        console.log('bounded heap: plain + gzip OK');
      })().catch(e => { console.error(e); process.exitCode = 1; });
    `;
    const output = execFileSync(
      process.execPath,
      ["--max-old-space-size=48", "-e", script, root],
      { encoding: "utf8", timeout: 60000 },
    );
    assert.match(output, /bounded heap: plain \+ gzip OK/);
    console.log(output.trim());
    console.log("JSONL streaming recovery tests: ok");
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

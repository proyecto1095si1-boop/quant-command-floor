"use strict";

const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  fsp = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  zlib = require("node:zlib"),
  { Readable } = require("node:stream"),
  { pipeline } = require("node:stream/promises"),
  { execFileSync } = require("node:child_process"),
  { JsonlStore } = require("../server/data/jsonl-store.js");

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "qcf-compact-")),
    store = new JsonlStore(root, {
      clock: () => new Date("2026-01-01T00:00:00Z"),
    }),
    before = new Date("2026-01-02T00:00:00Z");
  async function fixture(name) {
    await store.append(name, {
      receivedAt: "2026-01-01T00:00:00Z",
      text: "ñ🪙 test",
    });
    return store.file(name);
  }
  async function checkOriginal(file, bytes) {
    assert.deepEqual(await fsp.readFile(file), bytes);
    assert.deepEqual(
      await fsp.readdir(path.dirname(file)),
      [path.basename(file)],
      "failed compaction must not leave a discoverable duplicate or a temporary file",
    );
  }
  try {
    const file = await fixture("preserved"),
      bytes = await fsp.readFile(file);
    // A failure during final publication must leave the source intact.
    const originalLink = fsp.link;
    fsp.link = async () => {
      throw new Error("injected-link-failure");
    };
    try {
      await assert.rejects(store.compact({ before }), /injected-link-failure/);
    } finally {
      fsp.link = originalLink;
    }
    await checkOriginal(file, bytes);

    const originalUnlink = fsp.unlink;
    fsp.unlink = async (name) => {
      if (name === file) throw new Error("injected-source-unlink-failure");
      return originalUnlink(name);
    };
    try {
      await assert.rejects(
        store.compact({ before }),
        /injected-source-unlink-failure/,
      );
    } finally {
      fsp.unlink = originalUnlink;
    }
    await checkOriginal(file, bytes);

    // Tampering with the packed bytes must be caught before publication.
    const originalCreateReadStream = fs.createReadStream;
    fs.createReadStream = (name, options) =>
      String(name).endsWith(".tmp")
        ? Readable.from([zlib.gzipSync("different bytes")])
        : originalCreateReadStream(name, options);
    try {
      await assert.rejects(
        store.compact({ before }),
        /compaction-content-mismatch/,
      );
    } finally {
      fs.createReadStream = originalCreateReadStream;
    }
    await checkOriginal(file, bytes);

    const originalStat = fsp.stat;
    let sourceReads = 0;
    fsp.stat = async (name, options) => {
      const stat = await originalStat(name, options);
      if (name === file && ++sourceReads === 2)
        return { ...stat, size: stat.size + 1n };
      return stat;
    };
    try {
      await assert.rejects(
        store.compact({ before }),
        /compaction-source-changed/,
      );
    } finally {
      fsp.stat = originalStat;
    }
    await checkOriginal(file, bytes);

    // Never overwrite an existing compressed destination.
    await fsp.writeFile(file + ".gz", "existing destination");
    await assert.rejects(store.compact({ before }), { code: "EEXIST" });
    assert.deepEqual(await fsp.readFile(file), bytes);
    assert.equal(
      await fsp.readFile(file + ".gz", "utf8"),
      "existing destination",
    );
    await fsp.unlink(file + ".gz");

    const result = await store.compact({ before });
    assert.equal(result.compressed, 1);
    assert.deepEqual(zlib.gunzipSync(await fsp.readFile(file + ".gz")), bytes);
    assert.equal(
      result.bytesSaved,
      bytes.length - (await fsp.stat(file + ".gz")).size,
    );
    assert.equal((await fsp.stat(file + ".gz")).mode & 0o777, 0o600);
    assert.deepEqual(await store.verify("preserved"), {
      valid: true,
      events: 1,
    });
    assert.equal((await store.compact({ before })).compressed, 0);
    await fixture("recent");
    assert.equal(
      (await store.compact({ before: new Date("2025-12-31") })).compressed,
      0,
    );

    // Use synthetic data only; the original historical storage is never opened.
    const largeRoot = path.join(root, "large"),
      largeDir = path.join(largeRoot, "load"),
      largeFile = path.join(largeDir, "2026-01-01.jsonl");
    await fsp.mkdir(largeDir, { recursive: true });
    const payload = {
        receivedAt: "2026-01-01T00:00:00Z",
        text: "x".repeat(8000),
      },
      checksum = crypto
        .createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex"),
      block = Buffer.from(JSON.stringify({ checksum, payload }) + "\n"),
      count = 32768;
    await pipeline(
      Readable.from(
        (async function* () {
          for (let i = 0; i < count; i++) yield block;
        })(),
      ),
      fs.createWriteStream(largeFile),
    );
    const script = `
      const assert = require('node:assert/strict');
      const {JsonlStore} = require(${JSON.stringify(path.resolve(__dirname, "../server/data/jsonl-store.js"))});
      (async () => {
        const store = new JsonlStore(process.argv[1]);
        const result = await store.compact({before:new Date('2026-01-02')});
        assert.equal(result.compressed, 1);
        assert.deepEqual(await store.verify('load'), {valid:true,events:${count}});
        const rssMiB = process.resourceUsage().maxRSS / 1024;
        assert.ok(rssMiB < 180, 'compaction accumulated file in memory: ' + rssMiB);
        console.log(JSON.stringify({compressed:result.compressed,events:${count},maxRssMiB:rssMiB}));
      })().catch(error => { console.error(error); process.exitCode=1; });
    `;
    const output = execFileSync(
      process.execPath,
      ["--max-old-space-size=48", "-e", script, largeRoot],
      { encoding: "utf8", timeout: 60000 },
    );
    console.log(`synthetic bytes: ${block.length * count}`);
    console.log(output.trim());
    console.log("JSONL streaming compaction tests: ok");
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

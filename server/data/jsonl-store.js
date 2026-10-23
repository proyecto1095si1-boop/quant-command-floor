"use strict";
const fs = require("node:fs"),
  fsp = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  zlib = require("node:zlib"),
  { promisify } = require("node:util");
const gzip = promisify(zlib.gzip);
const safe = (x) => String(x).replace(/[^A-Za-z0-9_.-]/g, "_");
async function* lines(file) {
  const source = fs.createReadStream(file),
    input = file.endsWith(".gz") ? zlib.createGunzip() : source;
  if (input !== source) {
    source.on("error", (error) => input.destroy(error));
    source.pipe(input);
  }
  input.setEncoding("utf8");
  let pending = "";
  try {
    for await (const chunk of input) {
      pending += chunk;
      let start = 0,
        end;
      while ((end = pending.indexOf("\n", start)) !== -1) {
        if (end > start) yield pending.slice(start, end);
        start = end + 1;
      }
      pending = pending.slice(start);
    }
    if (pending) yield pending;
  } finally {
    input.destroy();
    source.destroy();
  }
}
class JsonlStore {
  constructor(root, { clock = () => new Date() } = {}) {
    this.root = path.resolve(root);
    this.clock = clock;
    this.queues = new Map();
  }
  file(stream, at = this.clock()) {
    return path.join(
      this.root,
      safe(stream),
      at.toISOString().slice(0, 10) + ".jsonl",
    );
  }
  append(stream, event) {
    const file = this.file(stream),
      previous = this.queues.get(file) || Promise.resolve(),
      next = previous.then(async () => {
        await fsp.mkdir(path.dirname(file), { recursive: true });
        const payload = JSON.stringify(event),
          checksum = crypto.createHash("sha256").update(payload).digest("hex");
        await fsp.appendFile(
          file,
          JSON.stringify({ checksum, payload: event }) + "\n",
          { mode: 0o600 },
        );
        return { file, checksum };
      });
    this.queues.set(
      file,
      next.catch(() => {}),
    );
    return next;
  }
  async *events(stream, { from = 0, to = Infinity, timeField = null } = {}) {
    const dir = path.join(this.root, safe(stream));
    if (!fs.existsSync(dir)) return [];
    const files = (await fsp.readdir(dir))
      .filter((x) => x.endsWith(".jsonl") || x.endsWith(".jsonl.gz"))
      .sort();
    for (const name of files) {
      for await (const line of lines(path.join(dir, name))) {
        const row = JSON.parse(line),
          payload = JSON.stringify(row.payload),
          checksum = crypto.createHash("sha256").update(payload).digest("hex");
        if (checksum !== row.checksum)
          throw new Error(`checksum-mismatch:${name}`);
        const at = Date.parse(
          (timeField && row.payload[timeField]) ||
            row.payload.exchangeAt ||
            row.payload.receivedAt ||
            0,
        );
        if (at >= from && at <= to) yield row.payload;
      }
    }
  }
  async replay(stream, { limit = 10000, ...range } = {}) {
    const out = [];
    for await (const event of this.events(stream, range)) {
      out.push(event);
      if (out.length >= limit) break;
    }
    return out;
  }
  async tail(stream, limit = 1000) {
    const capacity = Math.trunc(Math.max(1, limit));
    // Preserve the former slice semantics for explicitly unbounded limits.
    if (!Number.isFinite(capacity))
      return this.replay(stream, { limit: Number.MAX_SAFE_INTEGER });
    const ring = [];
    let next = 0;
    for await (const event of this.events(stream)) {
      ring[next] = event;
      next = (next + 1) % capacity;
    }
    return ring.length < capacity
      ? ring
      : [...ring.slice(next), ...ring.slice(0, next)];
  }
  async inventory() {
    if (!fs.existsSync(this.root)) return { streams: [], files: 0, bytes: 0 };
    const streams = [];
    let files = 0,
      bytes = 0;
    for (const stream of await fsp.readdir(this.root)) {
      const dir = path.join(this.root, stream),
        stat = await fsp.stat(dir);
      if (!stat.isDirectory()) continue;
      const names = (await fsp.readdir(dir)).filter(
        (x) => x.endsWith(".jsonl") || x.endsWith(".jsonl.gz"),
      );
      let streamBytes = 0;
      for (const name of names)
        streamBytes += (await fsp.stat(path.join(dir, name))).size;
      streams.push({ stream, files: names.length, bytes: streamBytes });
      files += names.length;
      bytes += streamBytes;
    }
    return { streams, files, bytes };
  }
  async verify(stream) {
    try {
      let events = 0;
      for await (const _event of this.events(stream)) events++;
      return { valid: true, events };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
  async compact({ before = new Date(Date.now() - 86400000) } = {}) {
    if (!fs.existsSync(this.root)) return { compressed: 0, bytesSaved: 0 };
    let compressed = 0,
      bytesSaved = 0;
    for (const stream of await fsp.readdir(this.root)) {
      const dir = path.join(this.root, stream);
      if (!(await fsp.stat(dir)).isDirectory()) continue;
      for (const name of await fsp.readdir(dir)) {
        if (!name.endsWith(".jsonl")) continue;
        const date = new Date(name.slice(0, 10) + "T00:00:00Z");
        if (!(date < before)) continue;
        const file = path.join(dir, name),
          raw = await fsp.readFile(file),
          packed = await gzip(raw, { level: 9 }),
          target = file + ".gz";
        await fsp.writeFile(target, packed, { mode: 0o600, flag: "wx" });
        await fsp.unlink(file);
        compressed++;
        bytesSaved += raw.length - packed.length;
      }
    }
    return { compressed, bytesSaved };
  }
  async enforceRetention({ days = 30, now = this.clock() } = {}) {
    const cutoff = now.getTime() - Math.max(1, days) * 86400000,
      removed = [];
    if (!fs.existsSync(this.root)) return { removed };
    for (const stream of await fsp.readdir(this.root)) {
      const dir = path.join(this.root, stream);
      if (!(await fsp.stat(dir)).isDirectory()) continue;
      for (const name of await fsp.readdir(dir)) {
        if (!name.endsWith(".jsonl") && !name.endsWith(".jsonl.gz")) continue;
        const date = Date.parse(name.slice(0, 10) + "T00:00:00Z");
        if (date + 86400000 <= cutoff) {
          await fsp.unlink(path.join(dir, name));
          removed.push(`${stream}/${name}`);
        }
      }
    }
    return { removed };
  }
  async flush() {
    await Promise.all([...this.queues.values()]);
  }
}
module.exports = { JsonlStore };

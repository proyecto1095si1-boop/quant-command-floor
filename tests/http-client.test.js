const assert = require("node:assert/strict"),
  { EventEmitter } = require("node:events"),
  http = require("node:http"),
  https = require("node:https"),
  tls = require("node:tls"),
  {
    environmentFetch,
    direct,
    throughProxy,
  } = require("../server/data/http-client.js");

function responseStream(statusCode, chunks) {
  const stream = new EventEmitter();
  stream.statusCode = statusCode;
  queueMicrotask(() => {
    chunks.forEach((chunk) => stream.emit("data", Buffer.from(chunk)));
    stream.emit("end");
  });
  return stream;
}

(async () => {
  const originalGet = https.get,
    originalRequest = https.request,
    originalHttpRequest = http.request,
    originalTlsConnect = tls.connect,
    originalFetch = global.fetch;
  try {
    let directOptions;
    https.get = (url, options, callback) => {
      directOptions = { url, options };
      const request = new EventEmitter();
      queueMicrotask(() => callback(responseStream(201, ['{"ok":', "true}"])));
      return request;
    };
    const directResponse = await direct("https://feed.test/ticker", {
      headers: { accept: "application/json" },
    });
    assert.equal(directResponse.ok, true);
    assert.equal(directResponse.status, 201);
    assert.deepEqual(await directResponse.json(), { ok: true });
    assert.equal(directOptions.url, "https://feed.test/ticker");
    assert.equal(directOptions.options.headers.accept, "application/json");

    https.get = () => {
      const request = new EventEmitter();
      queueMicrotask(() => request.emit("error", new Error("socket-down")));
      return request;
    };
    await assert.rejects(direct("https://feed.test"), /socket-down/);

    await assert.rejects(
      throughProxy("http://insecure.test", "http://proxy.test"),
      /https-required/,
    );

    let destroyed = false;
    http.request = () => {
      const request = new EventEmitter();
      request.end = () =>
        queueMicrotask(() =>
          request.emit(
            "connect",
            { statusCode: 407 },
            {
              destroy: () => {
                destroyed = true;
              },
            },
          ),
        );
      return request;
    };
    await assert.rejects(
      throughProxy("https://feed.test", "http://proxy.test"),
      /proxy-connect-407/,
    );
    assert.equal(destroyed, true);

    let connectOptions, requestOptions;
    const secureSocket = new EventEmitter();
    tls.connect = (options) => {
      connectOptions = options;
      return secureSocket;
    };
    http.request = (options) => {
      assert.equal(options.method, "CONNECT");
      assert.equal(options.path, "feed.test:443");
      const request = new EventEmitter();
      request.end = () =>
        queueMicrotask(() =>
          request.emit("connect", { statusCode: 200 }, new EventEmitter()),
        );
      return request;
    };
    https.request = (options, callback) => {
      requestOptions = options;
      const request = new EventEmitter();
      request.end = () =>
        queueMicrotask(() => callback(responseStream(503, ["{}"])));
      return request;
    };
    const proxied = await throughProxy(
      "https://feed.test:443/book?depth=2",
      "http://proxy.test:8080",
      { headers: { authorization: "paper" } },
    );
    assert.equal(proxied.ok, false);
    assert.equal(proxied.status, 503);
    assert.deepEqual(await proxied.json(), {});
    assert.equal(connectOptions.servername, "feed.test");
    assert.equal(connectOptions.rejectUnauthorized, true);
    assert.equal(requestOptions.path, "/book?depth=2");
    assert.equal(requestOptions.headers.authorization, "paper");
    assert.equal(requestOptions.createConnection(), secureSocket);

    global.fetch = async (url, options) => ({ url, options });
    assert.deepEqual(await environmentFetch("https://feed.test", { a: 1 }), {
      url: "https://feed.test",
      options: { a: 1 },
    });
  } finally {
    https.get = originalGet;
    https.request = originalRequest;
    http.request = originalHttpRequest;
    tls.connect = originalTlsConnect;
    global.fetch = originalFetch;
  }
  console.log("http client tests: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

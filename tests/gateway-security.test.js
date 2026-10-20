"use strict";

const assert = require("node:assert/strict"),
  net = require("node:net"),
  { createGateway } = require("../server/gateway.js"),
  { SecurityManager } = require("../server/security/manager.js");

function upgrade(port, { origin, token, path = "/v1/stream" } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1"),
      headers = [
        `GET ${path} HTTP/1.1`,
        "Host: 127.0.0.1",
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version: 13",
      ];
    if (origin) headers.push(`Origin: ${origin}`);
    if (token) headers.push(`Authorization: Bearer ${token}`);
    socket.once("error", reject);
    socket.once("data", (chunk) => {
      resolve({ socket, response: chunk.toString("utf8") });
    });
    socket.write(headers.join("\r\n") + "\r\n\r\n");
  });
}

(async () => {
  const secret = "x".repeat(32),
    security = new SecurityManager({ environment: "production", secret }),
    token = security.issue({ sub: "stream-reader", role: "viewer" }),
    gateway = createGateway({
      allowedOrigin: "https://floor.example",
      security,
    }),
    address = await gateway.listen(0);
  gateway.setDataService({
    storage: async () => {
      throw new Error("storage-offline");
    },
  });
  try {
    const failedRequest = await fetch(
      `http://127.0.0.1:${address.port}/v1/data/storage`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          origin: "https://floor.example",
        },
      },
    );
    assert.equal(failedRequest.status, 500);
    assert.equal((await failedRequest.json()).error, "internal-server-error");

    const anonymous = await upgrade(address.port);
    assert.match(anonymous.response, /^HTTP\/1\.1 401 Unauthorized/);
    anonymous.socket.destroy();

    const wrongOrigin = await upgrade(address.port, {
      origin: "https://evil.example",
      token,
    });
    assert.match(wrongOrigin.response, /^HTTP\/1\.1 403 Forbidden/);
    wrongOrigin.socket.destroy();

    const missing = await upgrade(address.port, {
      path: "/v1/missing",
      token,
    });
    assert.match(missing.response, /^HTTP\/1\.1 404 Not Found/);
    missing.socket.destroy();

    const authorized = await upgrade(address.port, {
      origin: "https://floor.example",
      token,
    });
    assert.match(authorized.response, /^HTTP\/1\.1 101 Switching Protocols/);
    authorized.socket.destroy();
  } finally {
    await gateway.close();
  }
  console.log("gateway security tests: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

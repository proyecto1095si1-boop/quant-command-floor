"use strict";
const http = require("node:http"),
  https = require("node:https"),
  tls = require("node:tls");
function response(status, raw) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(raw),
  };
}
function direct(url, { headers = {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, signal }, (res) => {
      const chunks = [];
      res.on("data", (x) => chunks.push(x));
      res.on("end", () =>
        resolve(
          response(res.statusCode, Buffer.concat(chunks).toString("utf8")),
        ),
      );
    });
    req.on("error", reject);
  });
}
function throughProxy(url, proxy, { headers = {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url),
      p = new URL(proxy);
    if (target.protocol !== "https:")
      return reject(new Error("https-required"));
    const connect = http.request({
      host: p.hostname,
      port: p.port || 80,
      method: "CONNECT",
      path: `${target.hostname}:${target.port || 443}`,
      headers: { host: `${target.hostname}:${target.port || 443}` },
      signal,
    });
    connect.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        return reject(new Error(`proxy-connect-${res.statusCode}`));
      }
      const secure = tls.connect({
        socket,
        servername: target.hostname,
        rejectUnauthorized: true,
      });
      secure.once("error", reject);
      const req = https.request(
        {
          host: target.hostname,
          port: target.port || 443,
          path: target.pathname + target.search,
          method: "GET",
          headers: { ...headers, host: target.hostname },
          createConnection: () => secure,
          agent: false,
          signal,
        },
        (resp) => {
          const chunks = [];
          resp.on("data", (x) => chunks.push(x));
          resp.on("end", () =>
            resolve(
              response(resp.statusCode, Buffer.concat(chunks).toString("utf8")),
            ),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
    connect.on("error", reject);
    connect.end();
  });
}
function environmentFetch(url, options = {}) {
  return fetch(url, options);
}
module.exports = { environmentFetch, direct, throughProxy };

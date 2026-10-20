const assert = require("node:assert/strict"),
  { direct, throughProxy } = require("../server/data/http-client.js");
(() => {
  assert.equal(typeof direct, "function");
  assert.equal(typeof throughProxy, "function");
  assert.throws(() => new URL("not-a-url"));
  console.log("http client tests: ok");
})();

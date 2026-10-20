const assert = require("node:assert/strict");
const { EventBus, StateMachine, Runtime } = require("../dist/runtime.js");
(async () => {
  const bus = new EventBus(3);
  bus.emit("a", { n: 1 });
  bus.emit("a", { n: 2 });
  assert.equal(bus.history("a").length, 2);
  const state = new StateMachine("running");
  assert.equal(state.transition("paused"), "paused");
  assert.throws(() => state.transition("paused"));
  const rt = new Runtime({ bus });
  rt.register({ id: "intel", type: "math" });
  rt.register({ id: "risk", type: "hybrid" });
  const result = await rt.execute("intel", { price: 100 });
  assert.equal(result.status, "ok");
  assert.ok(result.confidence > 0 && result.confidence <= 1);
  const dag = await rt.executeDAG(
    [{ id: "intel" }, { id: "risk", dependsOn: ["intel"] }],
    { price: 100 },
  );
  assert.equal(dag.risk.status, "ok");
  assert.ok(bus.history().length <= 3);
  console.log("runtime tests: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

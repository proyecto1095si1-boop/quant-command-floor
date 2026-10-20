(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.QCFResearch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0),
    stdev = (a) => {
      const m = mean(a);
      return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
    };
  class StrategyCatalog {
    constructor() {
      this.items = new Map();
    }
    register(s) {
      if (!s.id || typeof s.signal !== "function")
        throw new Error("strategy id and signal required");
      const v = { version: "1.0.0", status: "candidate", ...s };
      this.items.set(v.id, v);
      return v;
    }
    get(id) {
      return this.items.get(id);
    }
    promote(id) {
      const s = this.get(id);
      if (!s) throw new Error("unknown strategy");
      s.status = "approved";
      return s;
    }
  }
  function backtest(candles, strategy, opts = {}) {
    const fee = opts.fee ?? 0.0006,
      slippage = opts.slippage ?? 0.0004,
      capital = opts.capital || 10000;
    let cash = capital,
      qty = 0,
      peak = capital,
      maxDD = 0,
      trades = 0;
    const equity = [],
      returns = [];
    candles.forEach((c, i) => {
      const sig = Math.sign(strategy.signal(candles, i) || 0),
        px = +c.close;
      if (sig > 0 && !qty) {
        const fill = px * (1 + slippage);
        qty = (cash * (1 - fee)) / fill;
        cash = 0;
        trades++;
      } else if (sig < 0 && qty) {
        const fill = px * (1 - slippage);
        cash = qty * fill * (1 - fee);
        qty = 0;
        trades++;
      }
      const eq = cash + qty * px;
      peak = Math.max(peak, eq);
      maxDD = Math.max(maxDD, 1 - eq / peak);
      if (equity.length) returns.push(eq / equity[equity.length - 1] - 1);
      equity.push(eq);
    });
    const final = equity.at(-1) || capital,
      risk = stdev(returns),
      sharpe = risk ? (mean(returns) / risk) * Math.sqrt(365) : 0;
    return {
      initial: capital,
      final,
      totalReturn: final / capital - 1,
      maxDrawdown: maxDD,
      sharpe,
      trades,
      equity,
    };
  }
  function walkForward(candles, strategy, opts = {}) {
    const train = opts.train || 60,
      test = opts.test || 20,
      windows = [];
    for (let start = 0; start + train + test <= candles.length; start += test) {
      const slice = candles.slice(start + train, start + train + test),
        r = backtest(slice, strategy, opts);
      windows.push({
        start,
        testReturn: r.totalReturn,
        sharpe: r.sharpe,
        maxDrawdown: r.maxDrawdown,
      });
    }
    return {
      windows,
      pass:
        windows.length > 1 &&
        windows.filter((x) => x.testReturn > 0).length / windows.length >= 0.5,
      medianReturn: windows.length
        ? [...windows].sort((a, b) => a.testReturn - b.testReturn)[
            Math.floor(windows.length / 2)
          ].testReturn
        : 0,
    };
  }
  function monteCarlo(returns, runs = 300, seed = 42) {
    let s = seed >>> 0,
      rand = () =>
        (s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296,
      finals = [];
    for (let r = 0; r < runs; r++) {
      let e = 1;
      for (let i = 0; i < returns.length; i++)
        e *= 1 + returns[Math.floor(rand() * returns.length)];
      finals.push(e - 1);
    }
    finals.sort((a, b) => a - b);
    return {
      p05: finals[Math.floor(runs * 0.05)] || 0,
      median: finals[Math.floor(runs * 0.5)] || 0,
      p95: finals[Math.floor(runs * 0.95)] || 0,
      runs,
    };
  }
  return { StrategyCatalog, backtest, walkForward, monteCarlo };
});

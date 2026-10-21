"use strict";
require("./env.js").loadEnv();
const { createGateway } = require("./gateway.js");
const { MarketDataService } = require("./data/service.js");
const { TradingPipeline } = require("./pipeline/orchestrator.js");
const { DashboardService } = require("./dashboard/service.js");
const { ResearchLab } = require("./research/lab.js");
const { PortfolioService } = require("./portfolio/service.js");
const { ExecutionService } = require("./execution/service.js");
const { SreService } = require("./sre/service.js");
const { RegimeService } = require("./regime/service.js");
const { ModelGovernanceService } = require("./governance/service.js");
const { ExperimentService } = require("./governance/experiments.js");
const { OutcomeOracle } = require("./governance/outcome-oracle.js");
const { AiEvaluationService } = require("./governance/ai-evaluation.js");
const { CalibrationGovernanceService } = require("./governance/calibration.js");
const { parseTrustedReviewers } = require("./governance/provenance.js");
const sreWindowDays = Number(process.env.SRE_WINDOW_DAYS || 30),
  dataRetentionDays = Number(process.env.DATA_RETENTION_DAYS || 30),
  sreBucketMs = Number(process.env.SRE_BUCKET_MS || 60000),
  sreSampleMs = Number(process.env.SRE_SAMPLE_MS || 60000);
if (
  !Number.isFinite(sreWindowDays) ||
  sreWindowDays <= 0 ||
  !Number.isFinite(dataRetentionDays) ||
  dataRetentionDays < sreWindowDays ||
  !Number.isInteger(sreBucketMs) ||
  sreBucketMs < 1000 ||
  !Number.isInteger(sreSampleMs) ||
  sreSampleMs < 1000 ||
  sreSampleMs > sreBucketMs
)
  throw new Error("invalid-sre-retention-or-sampling-policy");
const gateway = createGateway(),
  products = (process.env.MARKET_PRODUCTS || "BTC-USD,ETH-USD")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
  data = new MarketDataService({
    products,
    pollMs: Number(process.env.MARKET_POLL_MS || 5000),
    publish: gateway.publish,
  });
if (process.env.MARKET_WS_ENABLED === "true") data.enableStream();
const regime = new RegimeService({
    record: (stream, event) => data.record(stream, event),
  }),
  pipeline = new TradingPipeline({
    dataService: data,
    regime,
    publish: gateway.publish,
  }),
  dashboard = new DashboardService({ pipeline, dataService: data }),
  research = new ResearchLab({
    record: (stream, event) => data.record(stream, event),
  }),
  portfolio = new PortfolioService({
    pipeline,
    dataService: data,
    record: (stream, event) => data.record(stream, event),
  }),
  execution = new ExecutionService({
    pipeline,
    portfolio,
    record: (stream, event) => data.record(stream, event),
    publish: gateway.publish,
  }),
  governance = new ModelGovernanceService({
    record: (stream, event) => data.record(stream, event),
  }),
  outcomeOracle = new OutcomeOracle({
    provider: data,
    policy: {
      maxStalenessMs: Number(process.env.OUTCOME_MAX_STALENESS_MS || 30000),
      maxOutcomeLagMs: Number(process.env.OUTCOME_MAX_LAG_MS || 30000),
      finalityDelayMs: Number(process.env.OUTCOME_FINALITY_DELAY_MS || 30000),
      maxClockSkewMs: Number(process.env.OUTCOME_MAX_CLOCK_SKEW_MS || 2000),
      maxDivergenceBps: Number(process.env.OUTCOME_MAX_DIVERGENCE_BPS || 25),
    },
  }),
  experiments = new ExperimentService({
    governance,
    outcomeOracle,
    record: (stream, event) => data.record(stream, event),
  }),
  aiEvaluation = new AiEvaluationService({
    governance,
    record: (stream, event) => data.record(stream, event),
    trustedReviewers: parseTrustedReviewers(
      process.env.AI_EVALUATION_TRUSTED_REVIEWERS,
    ),
  }),
  calibrationGovernance = new CalibrationGovernanceService({
    governance,
    experiments,
    record: (stream, event) => data.record(stream, event),
    trustedReviewers: parseTrustedReviewers(
      process.env.CALIBRATION_TRUSTED_REVIEWERS,
    ),
  }),
  sre = new SreService({
    gatewayMetrics: gateway.metrics,
    pipeline,
    dataService: data,
    research,
    portfolio,
    execution,
    record: (stream, event) => data.record(stream, event),
    slos: {
      availability: Number(process.env.SRE_AVAILABILITY_TARGET || 0.999),
      latencyTarget: Number(process.env.SRE_LATENCY_TARGET || 0.95),
      p95LatencyMs: Number(process.env.SRE_LATENCY_MS || 500),
      freshnessTarget: Number(process.env.SRE_FRESHNESS_TARGET || 0.99),
      dataFreshnessMs: Number(process.env.SRE_FRESHNESS_MS || 15000),
      auditIntegrity: 1,
    },
    sloWindowMs: sreWindowDays * 86400000,
    telemetryBucketMs: sreBucketMs,
    requireTelemetryRecovery: true,
    alertPolicies: [
      {
        name: "fast",
        longMs: Number(process.env.SRE_FAST_LONG_MIN || 60) * 60000,
        shortMs: Number(process.env.SRE_FAST_SHORT_MIN || 5) * 60000,
        burn: Number(process.env.SRE_FAST_BURN || 14.4),
      },
      {
        name: "slow",
        longMs: Number(process.env.SRE_SLOW_LONG_MIN || 360) * 60000,
        shortMs: Number(process.env.SRE_SLOW_SHORT_MIN || 30) * 60000,
        burn: Number(process.env.SRE_SLOW_BURN || 6),
      },
    ],
  });
gateway.setDataService(data);
gateway.setPipeline(pipeline);
gateway.setDashboard(dashboard);
gateway.setResearch(research);
gateway.setPortfolio(portfolio);
gateway.setExecution(execution);
gateway.setSre(sre);
gateway.setRegime(regime);
gateway.setGovernance(governance);
gateway.setExperiments(experiments);
gateway.setAiEvaluation(aiEvaluation);
gateway.setCalibrationGovernance(calibrationGovernance);
gateway.listen().then(async (address) => {
  console.log(
    `Quant Command Floor gateway listening on http://${address.address}:${address.port}`,
  );
  try {
    const telemetry = await data.store.tail("sre.slo-telemetry", 100000),
      recovered = sre.recoverTelemetry(telemetry);
    if (recovered.buckets)
      console.log(`SLO telemetry recovered: ${recovered.buckets} buckets`);
  } catch (e) {
    console.error(`SLO telemetry recovery blocked: ${e.message}`);
    pipeline.risk.halt("slo-telemetry-recovery-failed");
  }
  try {
    const [models, evaluations, graduations, promotions] = await Promise.all([
      data.store.tail("governance.models", 1000),
      data.store.tail("governance.evaluations", 1000),
      data.store.tail("governance.graduations", 1000),
      data.store.tail("governance.promotions", 1000),
    ]);
    const recovered = governance.recover({
      models,
      evaluations,
      graduations,
      promotions,
    });
    if (recovered.models)
      console.log(`Model governance recovered: ${recovered.models} models`);
    const experimentEvents = await data.store.tail(
      "governance.experiments",
      10000,
    );
    const experimentRecovery = experiments.recover(experimentEvents);
    if (experimentRecovery.experiments)
      console.log(
        `Model experiments recovered: ${experimentRecovery.experiments}`,
      );
    const [aiDatasets, aiRuns] = await Promise.all([
      data.store.tail("governance.ai-datasets", 1000),
      data.store.tail("governance.ai-evaluations", 10000),
    ]);
    const aiRecovery = aiEvaluation.recover({
      datasets: aiDatasets,
      runs: aiRuns,
    });
    if (aiRecovery.datasets)
      console.log(`AI evaluation recovered: ${aiRecovery.datasets} datasets`);
    const [calibrationDatasets, calibrationRuns, calibrationApprovals] =
      await Promise.all([
        data.store.tail("governance.calibration-datasets", 1000),
        data.store.tail("governance.calibration-runs", 1000),
        data.store.tail("governance.calibration-approvals", 1000),
      ]);
    const calibrationRecovery = calibrationGovernance.recover({
      datasets: calibrationDatasets,
      runs: calibrationRuns,
      approvals: calibrationApprovals,
    });
    if (calibrationRecovery.datasets)
      console.log(
        `Calibration governance recovered: ${calibrationRecovery.datasets} datasets`,
      );
  } catch (e) {
    console.error(`Model governance recovery blocked: ${e.message}`);
  }
  try {
    const tcaCheckpoints = await data.store.tail("execution.tca", 1),
      tcaRecovery = execution.recoverTca(tcaCheckpoints);
    if (tcaRecovery.recovered)
      console.log(`Execution TCA recovered: ${tcaRecovery.records} records`);
    const recovered = await pipeline.recover();
    if (recovered.recovered)
      console.log(`Pipeline recovered: ${recovered.fills} fills`);
  } catch (e) {
    console.error(`Pipeline recovery blocked: ${e.message}`);
    pipeline.risk.halt("recovery-failed");
  }
  if (process.env.MARKET_DATA_ENABLED !== "false") {
    try {
      await data.start();
      console.log(`Market data online: ${products.join(", ")}`);
    } catch (e) {
      console.error(`Market data degraded: ${e.message}`);
    }
  }
});
const maintenance = setInterval(
  async () => {
    try {
      await data.store.compact({ before: new Date(Date.now() - 86400000) });
      await data.store.enforceRetention({
        days: dataRetentionDays,
      });
    } catch (e) {
      console.error(`Storage maintenance degraded: ${e.message}`);
    }
  },
  Number(process.env.DATA_MAINTENANCE_MS || 3600000),
);
maintenance.unref();
const sreSampler = setInterval(
  () =>
    sre
      .snapshot()
      .catch((error) =>
        console.error(`SLO sampling degraded: ${error.message}`),
      ),
  sreSampleMs,
);
sreSampler.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(maintenance);
    clearInterval(sreSampler);
    data
      .stop()
      .then(() => gateway.close())
      .finally(() => process.exit(0));
  });

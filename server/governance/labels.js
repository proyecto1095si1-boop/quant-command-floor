"use strict";

const { fingerprint } = require("./service.js");

function invalid(message, status = 422) {
  throw Object.assign(new Error(message), { status });
}

function instant(value, message) {
  const milliseconds = Date.parse(String(value || ""));
  if (!Number.isFinite(milliseconds)) invalid(message);
  return milliseconds;
}

function labelSummary(forecasts, nowMs, graceMs) {
  const counts = {
    total: forecasts.length,
    pending: 0,
    maturePending: 0,
    labeled: 0,
    censored: 0,
    corrected: 0,
  };
  for (const forecast of forecasts) {
    counts[forecast.status]++;
    if (
      forecast.status === "pending" &&
      nowMs >= Date.parse(forecast.maturesAt) + graceMs
    )
      counts.maturePending++;
    if (forecast.revisions.length > 1) counts.corrected++;
  }
  return {
    ...counts,
    resolved: counts.labeled + counts.censored,
    censorRate: counts.total ? counts.censored / counts.total : 0,
  };
}

function addLabel(forecast, input, context) {
  if (forecast.status === "censored")
    invalid("censored-forecast-is-terminal", 409);
  const outcome = Number(input.outcome),
    observedMs = context.nowMs,
    outcomeMs = instant(input.outcomeAt, "label-outcome-time-required"),
    maturityMs = Date.parse(forecast.maturesAt);
  if (![0, 1].includes(outcome)) invalid("invalid-sequential-outcome");
  if (outcomeMs < maturityMs) invalid("label-before-horizon");
  if (outcomeMs > observedMs) invalid("label-from-future");
  if (
    input.horizonMs !== undefined &&
    Number(input.horizonMs) !== forecast.horizonMs
  )
    invalid("label-horizon-mismatch");

  const previous = forecast.revisions.at(-1) || null,
    corrected = previous !== null,
    reason = String(input.correctionReason || "").trim(),
    approvedBy = corrected
      ? [String(context.actor || ""), String(input.secondApprover || "")]
      : [];
  if (previous && previous.outcomeAt !== new Date(outcomeMs).toISOString())
    invalid("label-correction-target-mismatch");
  if (
    corrected &&
    (reason.length < 3 ||
      approvedBy.some((actor) => actor.length < 3) ||
      approvedBy[0] === approvedBy[1])
  )
    invalid("label-correction-approval-required", 403);

  const content = {
      version: forecast.revisions.length + 1,
      outcome,
      outcomeAt: new Date(outcomeMs).toISOString(),
      observedAt: new Date(observedMs).toISOString(),
      previousHash: previous?.hash || null,
      correctionReason: corrected ? reason : null,
      approvedBy,
    },
    revision = { ...content, hash: fingerprint(content) };
  forecast.revisions.push(revision);
  forecast.activeLabel = revision;
  forecast.status = "labeled";
  return revision;
}

function censor(forecast, input, context) {
  if (forecast.status !== "pending") invalid("forecast-already-resolved", 409);
  if (context.nowMs < Date.parse(forecast.maturesAt) + context.graceMs)
    invalid("forecast-not-censorable-yet", 409);
  const reason = String(input.reason || "").trim();
  if (reason.length < 3) invalid("censor-reason-required");
  forecast.status = "censored";
  forecast.censoring = {
    at: new Date(context.nowMs).toISOString(),
    reason,
    actor: String(context.actor || "system"),
  };
  return forecast.censoring;
}

function validateRevisionChain(forecast) {
  let previousHash = null;
  for (let index = 0; index < forecast.revisions.length; index++) {
    const revision = forecast.revisions[index],
      { hash, ...content } = revision;
    if (
      revision.version !== index + 1 ||
      revision.previousHash !== previousHash ||
      hash !== fingerprint(content)
    )
      return false;
    previousHash = hash;
  }
  return (
    (forecast.status === "labeled" &&
      forecast.activeLabel?.hash === previousHash &&
      forecast.revisions.length > 0) ||
    (forecast.status !== "labeled" && forecast.revisions.length === 0)
  );
}

module.exports = { addLabel, censor, labelSummary, validateRevisionChain };

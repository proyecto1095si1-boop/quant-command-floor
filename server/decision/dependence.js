"use strict";

const { fingerprint } = require("../governance/service.js");

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function identity(size) {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => (row === column ? 1 : 0)),
  );
}

function eigenvaluesSymmetric(input, tolerance = 1e-12, iterations = 100) {
  const matrix = input.map((row) => [...row]),
    size = matrix.length;
  for (let step = 0; step < iterations * Math.max(1, size * size); step++) {
    let p = 0,
      q = 0,
      largest = 0;
    for (let row = 0; row < size; row++)
      for (let column = row + 1; column < size; column++)
        if (Math.abs(matrix[row][column]) > largest) {
          largest = Math.abs(matrix[row][column]);
          p = row;
          q = column;
        }
    if (largest < tolerance) break;
    const angle =
        0.5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p]),
      cosine = Math.cos(angle),
      sine = Math.sin(angle),
      app = matrix[p][p],
      aqq = matrix[q][q],
      apq = matrix[p][q];
    matrix[p][p] =
      cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
    matrix[q][q] =
      sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
    matrix[p][q] = 0;
    matrix[q][p] = 0;
    for (let index = 0; index < size; index++) {
      if (index === p || index === q) continue;
      const aip = matrix[index][p],
        aiq = matrix[index][q];
      matrix[index][p] = cosine * aip - sine * aiq;
      matrix[p][index] = matrix[index][p];
      matrix[index][q] = sine * aip + cosine * aiq;
      matrix[q][index] = matrix[index][q];
    }
  }
  return matrix.map((row, index) => row[index]).sort((a, b) => a - b);
}

function conditionNumber(matrix) {
  if (!matrix.length) return 1;
  const values = eigenvaluesSymmetric(matrix),
    smallest = Math.max(0, values[0]),
    largest = Math.max(...values);
  return smallest > 1e-12 ? largest / smallest : Infinity;
}

function matrixDistance(left, right) {
  if (!left || left.length !== right.length) return 0;
  let largest = 0;
  for (let row = 0; row < left.length; row++)
    for (let column = row + 1; column < left.length; column++)
      largest = Math.max(
        largest,
        Math.abs(left[row][column] - right[row][column]),
      );
  return largest;
}

function correlationsObject(agents, matrix) {
  const output = {};
  for (let row = 0; row < agents.length; row++)
    for (let column = row + 1; column < agents.length; column++)
      output[[agents[row], agents[column]].sort().join("|")] = clamp(
        matrix[row][column],
        0,
        0.99,
      );
  return output;
}

class DynamicCorrelationEstimator {
  constructor(policy = {}) {
    this.policy = {
      decay: 0.94,
      minimumObservations: 30,
      baseShrinkage: 0.2,
      maximumCondition: 100,
      structuralChangeThreshold: 0.3,
      stabilityThreshold: 0.05,
      recoveryObservations: 10,
      ...policy,
    };
    const p = this.policy;
    if (
      !Number.isFinite(p.decay) ||
      p.decay <= 0 ||
      p.decay >= 1 ||
      !Number.isInteger(p.minimumObservations) ||
      p.minimumObservations < 3 ||
      !Number.isFinite(p.baseShrinkage) ||
      p.baseShrinkage < 0 ||
      p.baseShrinkage > 1 ||
      !Number.isFinite(p.maximumCondition) ||
      p.maximumCondition <= 1 ||
      !Number.isFinite(p.structuralChangeThreshold) ||
      p.structuralChangeThreshold <= 0 ||
      !Number.isFinite(p.stabilityThreshold) ||
      p.stabilityThreshold <= 0 ||
      !Number.isInteger(p.recoveryObservations) ||
      p.recoveryObservations < 1
    )
      throw Object.assign(new Error("invalid-dependence-policy"), {
        status: 422,
      });
    this.reset();
  }

  reset() {
    this.agents = [];
    this.observations = 0;
    this.mean = [];
    this.covariance = [];
    this.correlation = [];
    this.lastStable = null;
    this.previous = null;
    this.changeDetected = false;
    this.stableStreak = 0;
    this.diagnostics = {
      shrinkage: 1,
      conditionNumber: 1,
      maximumShift: 0,
    };
  }

  vector(signals) {
    if (!Array.isArray(signals) || !signals.length)
      throw Object.assign(new Error("invalid-dependence-observation"), {
        status: 422,
      });
    const rows = signals
      .map((row) => ({
        agent: String(row.agent || ""),
        signal: Number(row.signal),
      }))
      .sort((left, right) => left.agent.localeCompare(right.agent));
    if (
      rows.some(
        (row) =>
          !row.agent ||
          !Number.isFinite(row.signal) ||
          row.signal < -1 ||
          row.signal > 1,
      ) ||
      new Set(rows.map((row) => row.agent)).size !== rows.length
    )
      throw Object.assign(new Error("invalid-dependence-observation"), {
        status: 422,
      });
    const agents = rows.map((row) => row.agent);
    if (
      this.agents.length &&
      (agents.length !== this.agents.length ||
        agents.some((agent, index) => agent !== this.agents[index]))
    )
      throw Object.assign(new Error("dependence-agent-set-changed"), {
        status: 409,
      });
    return { agents, values: rows.map((row) => row.signal) };
  }

  estimate() {
    const size = this.agents.length,
      raw = identity(size);
    for (let row = 0; row < size; row++)
      for (let column = row + 1; column < size; column++) {
        const denominator = Math.sqrt(
            Math.max(0, this.covariance[row][row]) *
              Math.max(0, this.covariance[column][column]),
          ),
          value = denominator
            ? clamp(this.covariance[row][column] / denominator, -0.99, 0.99)
            : 0;
        raw[row][column] = value;
        raw[column][row] = value;
      }
    let shrinkage = this.policy.baseShrinkage,
      shrunk,
      condition,
      finished = false;
    do {
      shrunk = raw.map((row, rowIndex) =>
        row.map((value, columnIndex) =>
          rowIndex === columnIndex ? 1 : value * (1 - shrinkage),
        ),
      );
      condition = conditionNumber(shrunk);
      finished = condition <= this.policy.maximumCondition || shrinkage >= 1;
      if (!finished) shrinkage = Math.min(1, shrinkage + 0.05);
    } while (!finished);
    return { matrix: shrunk, shrinkage, conditionNumber: condition };
  }

  observe(signals) {
    const { agents, values } = this.vector(signals);
    if (!this.agents.length) {
      this.agents = agents;
      this.mean = [...values];
      this.covariance = values.map(() => values.map(() => 0));
      this.correlation = identity(values.length);
      this.observations = 1;
      return this.status();
    }
    const alpha = 1 - this.policy.decay,
      delta = values.map((value, index) => value - this.mean[index]),
      nextMean = this.mean.map((value, index) => value + alpha * delta[index]);
    this.covariance = this.covariance.map((row, rowIndex) =>
      row.map(
        (value, columnIndex) =>
          this.policy.decay * value +
          alpha *
            delta[rowIndex] *
            (values[columnIndex] - nextMean[columnIndex]),
      ),
    );
    this.mean = nextMean;
    this.observations++;
    const estimate = this.estimate(),
      shift = matrixDistance(this.previous, estimate.matrix);
    this.previous = this.correlation;
    this.correlation = estimate.matrix;
    if (this.changeDetected) {
      this.stableStreak =
        shift <= this.policy.stabilityThreshold ? this.stableStreak + 1 : 0;
      if (this.stableStreak >= this.policy.recoveryObservations) {
        this.changeDetected = false;
        this.lastStable = this.correlation.map((row) => [...row]);
      }
    } else if (
      this.lastStable &&
      matrixDistance(this.lastStable, this.correlation) >
        this.policy.structuralChangeThreshold
    ) {
      this.changeDetected = true;
      this.stableStreak = 0;
    } else if (
      this.observations >= this.policy.minimumObservations &&
      !this.lastStable
    ) {
      this.lastStable = this.correlation.map((row) => [...row]);
      this.stableStreak = 0;
    } else if (this.lastStable) {
      const distance = matrixDistance(this.lastStable, this.correlation);
      this.stableStreak =
        distance <= this.policy.stabilityThreshold ? this.stableStreak + 1 : 0;
      if (this.stableStreak >= this.policy.recoveryObservations) {
        this.lastStable = this.correlation.map((row) => [...row]);
        this.stableStreak = 0;
      }
    }
    this.diagnostics = {
      shrinkage: estimate.shrinkage,
      conditionNumber: estimate.conditionNumber,
      maximumShift: shift,
    };
    return this.status();
  }

  ready() {
    return (
      this.observations >= this.policy.minimumObservations &&
      !this.changeDetected &&
      Number.isFinite(this.diagnostics.conditionNumber) &&
      this.diagnostics.conditionNumber <= this.policy.maximumCondition
    );
  }

  current(fallback = {}) {
    const ready = this.ready();
    return {
      source: ready ? "dynamic-ewma" : "static-fallback",
      reason: ready
        ? "ready"
        : this.changeDetected
          ? "structural-change"
          : this.observations < this.policy.minimumObservations
            ? "warmup"
            : "ill-conditioned",
      correlations: ready
        ? correlationsObject(this.agents, this.correlation)
        : { ...fallback },
      estimator: this.status(),
    };
  }

  status() {
    return {
      paperOnly: true,
      ready: this.ready(),
      agents: [...this.agents],
      observations: this.observations,
      effectiveWindow: (1 + this.policy.decay) / (1 - this.policy.decay),
      changeDetected: this.changeDetected,
      stableStreak: this.stableStreak,
      ...this.diagnostics,
    };
  }

  export() {
    const state = {
      version: 1,
      policy: this.policy,
      agents: this.agents,
      observations: this.observations,
      mean: this.mean,
      covariance: this.covariance,
      correlation: this.correlation,
      lastStable: this.lastStable,
      previous: this.previous,
      changeDetected: this.changeDetected,
      stableStreak: this.stableStreak,
      diagnostics: this.diagnostics,
    };
    return { ...structuredClone(state), hash: fingerprint(state) };
  }

  restore(input) {
    const { hash, ...state } = input || {};
    if (
      state.version !== 1 ||
      hash !== fingerprint(state) ||
      JSON.stringify(state.policy) !== JSON.stringify(this.policy)
    )
      throw new Error("invalid-dependence-checkpoint");
    const size = state.agents?.length || 0,
      square = (matrix) =>
        Array.isArray(matrix) &&
        matrix.length === size &&
        matrix.every(
          (row) =>
            Array.isArray(row) &&
            row.length === size &&
            row.every(Number.isFinite),
        ),
      correlationMatrix = (matrix) =>
        square(matrix) &&
        matrix.every(
          (row, rowIndex) =>
            Math.abs(row[rowIndex] - 1) <= 1e-9 &&
            row.every(
              (value, columnIndex) =>
                value >= -1 &&
                value <= 1 &&
                Math.abs(value - matrix[columnIndex][rowIndex]) <= 1e-9,
            ),
        );
    if (
      !Array.isArray(state.agents) ||
      state.agents.some((agent) => !agent || typeof agent !== "string") ||
      new Set(state.agents).size !== size ||
      !Number.isInteger(state.observations) ||
      state.observations < 0 ||
      (state.observations > 0 && size === 0) ||
      !Array.isArray(state.mean) ||
      state.mean.length !== size ||
      !state.mean.every(Number.isFinite) ||
      !square(state.covariance) ||
      !correlationMatrix(state.correlation) ||
      (state.lastStable !== null && !correlationMatrix(state.lastStable)) ||
      (state.previous !== null && !correlationMatrix(state.previous)) ||
      typeof state.changeDetected !== "boolean" ||
      !Number.isInteger(state.stableStreak) ||
      state.stableStreak < 0 ||
      !state.diagnostics ||
      !Object.values(state.diagnostics).every(Number.isFinite)
    )
      throw new Error("invalid-dependence-checkpoint");
    Object.assign(this, structuredClone(state));
    return this.status();
  }
}

module.exports = {
  DynamicCorrelationEstimator,
  conditionNumber,
  eigenvaluesSymmetric,
  matrixDistance,
};

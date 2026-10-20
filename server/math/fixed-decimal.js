"use strict";

const DIGITS = 8,
  FACTOR = 10n ** BigInt(DIGITS);

function toAtoms(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && !Number.isFinite(value))
    throw new TypeError("invalid-decimal");
  const text = String(value ?? 0)
      .trim()
      .toLowerCase(),
    match = text.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/);
  if (!match || (!match[2] && !match[3]))
    throw new TypeError("invalid-decimal");
  const negative = match[1] === "-",
    integer = match[2] || "0",
    fraction = match[3] || "",
    exponent = Number(match[4] || 0);
  if (
    !Number.isSafeInteger(exponent) ||
    Math.abs(exponent) > 64 ||
    integer.length + fraction.length > 128
  )
    throw new RangeError("decimal-out-of-range");
  const coefficient = BigInt(`${integer}${fraction}` || "0"),
    power = DIGITS + exponent - fraction.length,
    atoms =
      power >= 0
        ? coefficient * 10n ** BigInt(power)
        : divideRounded(coefficient, 10n ** BigInt(-power));
  return negative ? -atoms : atoms;
}

function fromAtoms(atoms) {
  const value = BigInt(atoms),
    negative = value < 0n,
    absolute = negative ? -value : value,
    integer = absolute / FACTOR,
    fraction = String(absolute % FACTOR)
      .padStart(DIGITS, "0")
      .replace(/0+$/, ""),
    text = `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
  return Number(text);
}

function decimalString(atoms) {
  const value = BigInt(atoms),
    negative = value < 0n,
    absolute = negative ? -value : value,
    integer = absolute / FACTOR,
    fraction = String(absolute % FACTOR).padStart(DIGITS, "0");
  return `${negative ? "-" : ""}${integer}.${fraction}`;
}

function divideRounded(numerator, denominator) {
  if (denominator === 0n) throw new RangeError("division-by-zero");
  const negative = numerator < 0n !== denominator < 0n,
    a = numerator < 0n ? -numerator : numerator,
    b = denominator < 0n ? -denominator : denominator,
    rounded = (a + b / 2n) / b;
  return negative ? -rounded : rounded;
}

function multiplyAtoms(left, right) {
  return divideRounded(BigInt(left) * BigInt(right), FACTOR);
}

module.exports = {
  DIGITS,
  FACTOR,
  decimalString,
  divideRounded,
  fromAtoms,
  multiplyAtoms,
  toAtoms,
};

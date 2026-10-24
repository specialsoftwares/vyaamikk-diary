import {
  MAX_DECIMAL_FRACTION_DIGITS,
  MAX_DECIMAL_INTEGER_DIGITS,
} from "./constants";

const DECIMAL_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export class IncompatibleUnitsError extends Error {
  readonly fromUnit: string;
  readonly toUnit: string;
  constructor(fromUnit: string, toUnit: string) {
    super(
      `goodsEvidence: cannot combine ${fromUnit} with ${toUnit} without a recorded conversion`
    );
    this.name = "IncompatibleUnitsError";
    this.fromUnit = fromUnit;
    this.toUnit = toUnit;
  }
}

export class QuantityBoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuantityBoundError";
  }
}

export type DecimalString = string;

export interface Quantity {
  value: DecimalString;
  unit: string;
  precision: number;
}

export interface RecordedUnitConversion {
  fromUnit: string;
  toUnit: string;
  factor: DecimalString;
  recordedMeasurementId: string;
}

export function assertDecimalString(value: string): DecimalString {
  if (!DECIMAL_RE.test(value)) {
    throw new QuantityBoundError("goodsEvidence: quantity is not a bounded decimal string");
  }
  const negative = value.startsWith("-");
  const abs = negative ? value.slice(1) : value;
  const [integer = "0", fraction = ""] = abs.split(".");
  if (integer.length > MAX_DECIMAL_INTEGER_DIGITS) {
    throw new QuantityBoundError("goodsEvidence: quantity integer digits exceed bound");
  }
  if (fraction.length > MAX_DECIMAL_FRACTION_DIGITS) {
    throw new QuantityBoundError("goodsEvidence: quantity fraction digits exceed bound");
  }
  return value;
}

function scaleOf(value: DecimalString): number {
  const i = value.indexOf(".");
  return i === -1 ? 0 : value.length - i - 1;
}

function toSignedScaled(value: DecimalString, scale: number): bigint {
  const negative = value.startsWith("-");
  const abs = negative ? value.slice(1) : value;
  const [integer = "0", fraction = ""] = abs.split(".");
  const padded = (fraction + "0".repeat(scale)).slice(0, scale);
  const n = BigInt(integer + padded);
  return negative ? -n : n;
}

function fromSignedScaled(n: bigint, scale: number): DecimalString {
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const digits = abs.toString().padStart(scale + 1, "0");
  if (scale === 0) {
    const body = abs.toString();
    return negative && body !== "0" ? `-${body}` : body;
  }
  const integer = (digits.slice(0, -scale) || "0").replace(/^0+(?=\d)/, "");
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  const body = fraction.length > 0 ? `${integer}.${fraction}` : integer;
  return negative && body !== "0" ? `-${body}` : body;
}

export function zeroQuantity(unit: string, precision = 0): Quantity {
  return { value: "0", unit, precision };
}

export function quantity(value: string, unit: string, precision = scaleOf(value)): Quantity {
  const v = assertDecimalString(value);
  if (precision < 0 || precision > MAX_DECIMAL_FRACTION_DIGITS) {
    throw new QuantityBoundError("goodsEvidence: precision out of bound");
  }
  return { value: v, unit, precision };
}

export function compareDecimal(a: DecimalString, b: DecimalString): number {
  const scale = Math.max(scaleOf(a), scaleOf(b));
  const d = toSignedScaled(assertDecimalString(a), scale) - toSignedScaled(assertDecimalString(b), scale);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}

export function addDecimal(a: DecimalString, b: DecimalString): DecimalString {
  const scale = Math.max(scaleOf(a), scaleOf(b));
  return fromSignedScaled(
    toSignedScaled(assertDecimalString(a), scale) + toSignedScaled(assertDecimalString(b), scale),
    scale
  );
}

export function subtractDecimal(a: DecimalString, b: DecimalString): DecimalString {
  const scale = Math.max(scaleOf(a), scaleOf(b));
  return fromSignedScaled(
    toSignedScaled(assertDecimalString(a), scale) - toSignedScaled(assertDecimalString(b), scale),
    scale
  );
}

export function isNonNegative(value: DecimalString): boolean {
  return compareDecimal(value, "0") >= 0;
}

export function quantityShapeError(
  value: unknown,
  options: {
    label: string;
    allowNegative?: boolean;
    requiredUnit?: string | null;
    /** Package counts are whole units of packaging, not a material measure. */
    wholeCount?: boolean;
  }
): string | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return `${options.label} is required`;
  }
  const qty = value as { value?: unknown; unit?: unknown; precision?: unknown };
  if (typeof qty.value !== "string") return `${options.label} value is required`;
  try {
    assertDecimalString(qty.value);
  } catch {
    return `${options.label} is not a bounded decimal string`;
  }
  if (typeof qty.unit !== "string" || !qty.unit.trim()) return `${options.label} unit is required`;
  if (options.requiredUnit && qty.unit !== options.requiredUnit) {
    return `${options.label} unit must be ${options.requiredUnit}`;
  }
  if (
    typeof qty.precision !== "number" ||
    !Number.isInteger(qty.precision) ||
    qty.precision < 0 ||
    qty.precision > MAX_DECIMAL_FRACTION_DIGITS
  ) {
    return `${options.label} precision is invalid`;
  }
  const fraction = qty.value.includes(".") ? qty.value.split(".")[1]!.length : 0;
  if (fraction > qty.precision) return `${options.label} precision does not cover the value`;
  if (!options.allowNegative && compareDecimal(qty.value, "0") < 0) {
    return `${options.label} must not be negative`;
  }
  if (options.wholeCount) {
    if (qty.precision !== 0 || qty.value.includes(".")) {
      return `${options.label} must be a whole count`;
    }
  }
  return null;
}

export function sameUnit(a: Quantity, b: Quantity): boolean {
  return a.unit === b.unit;
}

export function addQuantity(a: Quantity, b: Quantity): Quantity {
  if (!sameUnit(a, b)) throw new IncompatibleUnitsError(a.unit, b.unit);
  return {
    value: addDecimal(a.value, b.value),
    unit: a.unit,
    precision: Math.max(a.precision, b.precision),
  };
}

export function subtractQuantity(a: Quantity, b: Quantity): Quantity {
  if (!sameUnit(a, b)) throw new IncompatibleUnitsError(a.unit, b.unit);
  return {
    value: subtractDecimal(a.value, b.value),
    unit: a.unit,
    precision: Math.max(a.precision, b.precision),
  };
}

/** Convert only when a measurement/conversion is recorded. Bags are never kilograms. */
export function convertQuantity(qty: Quantity, conversion: RecordedUnitConversion): Quantity {
  if (qty.unit !== conversion.fromUnit) {
    throw new IncompatibleUnitsError(qty.unit, conversion.fromUnit);
  }
  if (!conversion.recordedMeasurementId.trim()) {
    throw new Error("goodsEvidence: conversion requires a recorded measurement id");
  }
  assertDecimalString(conversion.factor);
  const scale = Math.max(scaleOf(qty.value), scaleOf(conversion.factor));
  const product =
    toSignedScaled(qty.value, scale) * toSignedScaled(conversion.factor, scale);
  const converted = fromSignedScaled(product, scale * 2);
  return quantity(converted, conversion.toUnit, Math.min(MAX_DECIMAL_FRACTION_DIGITS, scale * 2));
}

export interface LineQuantityLedgers {
  physicalReceived: Quantity;
  qcAllocated: Quantity;
  acceptedForStock: Quantity;
  dispatchedReturn: Quantity;
  supplierAcknowledged: Quantity;
}

export function emptyLedgers(unit: string): LineQuantityLedgers {
  return {
    physicalReceived: zeroQuantity(unit),
    qcAllocated: zeroQuantity(unit),
    acceptedForStock: zeroQuantity(unit),
    dispatchedReturn: zeroQuantity(unit),
    supplierAcknowledged: zeroQuantity(unit),
  };
}

export function availableCustody(ledgers: LineQuantityLedgers): Quantity {
  return subtractQuantity(ledgers.physicalReceived, ledgers.dispatchedReturn);
}

export function assertNonNegativeLedgers(ledgers: LineQuantityLedgers): void {
  for (const [name, qty] of Object.entries(ledgers) as [keyof LineQuantityLedgers, Quantity][]) {
    if (!isNonNegative(qty.value)) {
      throw new QuantityBoundError(`goodsEvidence: ${name} would be negative`);
    }
  }
  if (compareDecimal(ledgers.dispatchedReturn.value, ledgers.physicalReceived.value) > 0) {
    throw new QuantityBoundError("goodsEvidence: return exceeds available custody");
  }
}

/**
 * A later return never rewrites the original physical-received quantity.
 * It only increases dispatchedReturn, bounded by remaining custody.
 * Negative and zero quantities are not dispatches; corrections use a linked event.
 */
export function applyReturnDispatch(
  ledgers: LineQuantityLedgers,
  returnQty: Quantity
): LineQuantityLedgers {
  if (compareDecimal(returnQty.value, "0") <= 0) {
    throw new QuantityBoundError("goodsEvidence: dispatch quantity must be positive");
  }
  const next: LineQuantityLedgers = {
    ...ledgers,
    physicalReceived: { ...ledgers.physicalReceived },
    dispatchedReturn: addQuantity(ledgers.dispatchedReturn, returnQty),
  };
  assertNonNegativeLedgers(next);
  return next;
}

/**
 * Reverse part of a prior return. Requires a linked event id at the command layer.
 * Quantity must be positive and not exceed dispatchedReturn.
 */
export function applyReturnCorrection(
  ledgers: LineQuantityLedgers,
  correctionQty: Quantity
): LineQuantityLedgers {
  if (compareDecimal(correctionQty.value, "0") <= 0) {
    throw new QuantityBoundError("goodsEvidence: correction quantity must be positive");
  }
  const next: LineQuantityLedgers = {
    ...ledgers,
    physicalReceived: { ...ledgers.physicalReceived },
    dispatchedReturn: subtractQuantity(ledgers.dispatchedReturn, correctionQty),
  };
  assertNonNegativeLedgers(next);
  return next;
}

export function applyAcceptedForStock(
  ledgers: LineQuantityLedgers,
  accepted: Quantity
): LineQuantityLedgers {
  const next: LineQuantityLedgers = {
    ...ledgers,
    acceptedForStock: addQuantity(ledgers.acceptedForStock, accepted),
  };
  if (compareDecimal(next.acceptedForStock.value, next.physicalReceived.value) > 0) {
    throw new QuantityBoundError("goodsEvidence: accepted-for-stock exceeds physical received");
  }
  assertNonNegativeLedgers(next);
  return next;
}

export type ShortageOrExcess = "shortage" | "excess" | "none" | "unknown";

/**
 * Shortage/excess vs this delivery's expected quantity, not the full invoice
 * quantity (split deliveries would otherwise false-flag).
 */
export function classifyShortageOrExcess(input: {
  expectedOnThisDelivery: Quantity;
  physicallyReceived: Quantity;
}): ShortageOrExcess {
  if (!sameUnit(input.expectedOnThisDelivery, input.physicallyReceived)) {
    throw new IncompatibleUnitsError(
      input.expectedOnThisDelivery.unit,
      input.physicallyReceived.unit
    );
  }
  const cmp = compareDecimal(input.physicallyReceived.value, input.expectedOnThisDelivery.value);
  if (cmp < 0) return "shortage";
  if (cmp > 0) return "excess";
  return "none";
}

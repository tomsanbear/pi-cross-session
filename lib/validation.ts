// Narrow untrusted JSON/EventBus values before accessing their properties.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isBoundedString(value: unknown, max: number, min = 0): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

export function isSafeInteger(
  value: unknown,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

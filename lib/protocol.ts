import { TextDecoder } from "node:util";
import { validId, validInstance } from "./contract";

export const WIRE_VERSION = 1;
export const MAX_FRAME_BYTES = 1_048_576;
export const MAX_MESSAGE_CHARS = 1_000_000;

export type HelloFrame = {
  v: 1;
  type: "hello";
  requestId: string;
  token: string;
  target: { id: string; instanceId: string };
  capabilities?: string[];
  from?: { id: string; instanceId: string; token: string };
};
export type MessageFrame = {
  v: 1;
  type: "message";
  requestId: string;
  messageId: string;
  text: string;
  summary: string;
  sentAt: number;
  goalId?: string;
};
export type StatusFrame = { v: 1; type: "status"; requestId: string; messageId: string };
export type ResponseFrame = {
  v: 1;
  type: "response";
  requestId: string;
  ok: boolean;
  status: string;
  error?: string;
  capabilities?: string[];
  expiresAt?: number;
  code?: string;
  state?: string;
  retryable?: boolean;
  next?: string;
  peer?: { id: string; instanceId: string; pid: number };
};

const unknownReceiptCodes = new Set([
  "timeout",
  "connection_closed",
  "cancelled",
  "transport_error",
  "invalid_response",
  "invalid_receipt",
]);
export class DeliveryError extends Error {
  readonly state: string;
  readonly retryable: boolean;
  readonly next: string;

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.state =
      code === "cancelled_before_send"
        ? "not_sent"
        : unknownReceiptCodes.has(code)
          ? "receipt_unknown"
          : "refused";
    this.retryable = ["busy", "queue_full", "rate_limited"].includes(code);
    this.next =
      this.state === "not_sent"
        ? "Cancelled before transmission; send again only on a new authorized request"
        : this.state === "receipt_unknown"
          ? "Query message status on the same incarnation; never auto-retry"
          : this.retryable
            ? "Wait for a safe idle recipient, then explicitly retry"
            : "Inspect status/identity and policy; upgrade peers if unsupported";
    this.name = "DeliveryError";
  }
}

export function encodeFrame(frame: object): string {
  const line = `${JSON.stringify(frame)}\n`;
  if (Buffer.byteLength(line) > MAX_FRAME_BYTES) {
    throw new DeliveryError(
      "message_too_large",
      `Serialized cross-session message exceeds ${MAX_FRAME_BYTES.toLocaleString("en-US")} bytes`,
    );
  }
  return line;
}

// Count raw bytes per frame, including LF/BOM and incomplete UTF-8 tails.
// A malformed later frame cannot revoke an already processed earlier frame.
export function frameReader(onLine: (line: string) => boolean, onError: (code: string) => void) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "",
    bytes = 0,
    stopped = false;
  return (chunk: Buffer) => {
    for (let offset = 0; offset < chunk.length && !stopped; ) {
      const newline = chunk.indexOf(10, offset);
      const end = newline < 0 ? chunk.length : newline + 1;
      const part = chunk.subarray(offset, end);
      bytes += part.length;
      if (bytes > MAX_FRAME_BYTES) {
        stopped = true;
        onError("message_too_large");
        return;
      }
      try {
        text += decoder.decode(part, { stream: true });
      } catch {
        stopped = true;
        onError("invalid_frame");
        return;
      }
      offset = end;
      if (newline >= 0) {
        const line = text.slice(0, -1);
        text = "";
        bytes = 0;
        stopped = !onLine(line);
      }
    }
  };
}

function validCapabilities(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= 8 &&
      value.every((item) => typeof item === "string" && item.length <= 64))
  );
}
function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}
function sessionId(value: unknown): value is string {
  return boundedString(value, 512) && value.length > 0;
}

export function isResponse(value: unknown): value is ResponseFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<ResponseFrame>;
  return (
    frame.v === WIRE_VERSION &&
    frame.type === "response" &&
    validId(frame.requestId) &&
    typeof frame.ok === "boolean" &&
    boundedString(frame.status, 64) &&
    validCapabilities(frame.capabilities) &&
    [frame.code, frame.state].every((item) => item === undefined || boundedString(item, 64)) &&
    (frame.next === undefined || boundedString(frame.next, 2048)) &&
    (frame.error === undefined || boundedString(frame.error, 4096)) &&
    (frame.retryable === undefined || typeof frame.retryable === "boolean") &&
    (frame.expiresAt === undefined ||
      (Number.isSafeInteger(frame.expiresAt) && frame.expiresAt > 0))
  );
}

export function isHello(value: unknown): value is HelloFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<HelloFrame>;
  return (
    frame.v === WIRE_VERSION &&
    frame.type === "hello" &&
    validCapabilities(frame.capabilities) &&
    validId(frame.requestId) &&
    typeof frame.token === "string" &&
    !!frame.target &&
    sessionId(frame.target.id) &&
    validInstance(frame.target.instanceId) &&
    (frame.from === undefined ||
      (!!frame.from &&
        sessionId(frame.from.id) &&
        validInstance(frame.from.instanceId) &&
        typeof frame.from.token === "string"))
  );
}

export function isMessage(value: unknown): value is MessageFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<MessageFrame>;
  return (
    frame.v === WIRE_VERSION &&
    frame.type === "message" &&
    validId(frame.requestId) &&
    validId(frame.messageId) &&
    boundedString(frame.text, MAX_MESSAGE_CHARS) &&
    frame.text.isWellFormed() &&
    typeof frame.summary === "string" &&
    frame.summary.isWellFormed() &&
    !!frame.summary.trim() &&
    Array.from(frame.summary).length <= 200 &&
    Number.isSafeInteger(frame.sentAt) &&
    (frame.goalId === undefined || validId(frame.goalId))
  );
}

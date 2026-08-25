export type SaveFailureLog = {
  occurredAt: string;
  operation: string;
  method: string;
  endpoint: string;
  status?: number;
  statusText?: string;
  code?: string;
  message: string;
  response?: unknown;
};

type SaveRequestContext = {
  operation: string;
  method: string;
  endpoint: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function responseCode(payload: unknown) {
  if (!isRecord(payload)) return undefined;
  if (typeof payload.error === "string") return payload.error;
  return typeof payload.code === "string" ? payload.code : undefined;
}

function responseMessage(payload: unknown, fallback: string) {
  if (isRecord(payload) && typeof payload.message === "string")
    return payload.message;
  return responseCode(payload) ?? fallback;
}

export class SaveRequestError extends Error {
  constructor(public readonly log: SaveFailureLog) {
    super(log.message);
    this.name = "SaveRequestError";
  }
}

export async function readSaveResponse<T>(
  response: Response,
  context: SaveRequestContext,
): Promise<T> {
  const rawBody = await response.text();
  let payload: unknown = {};
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = rawBody.slice(0, 12_000);
    }
  }
  if (!response.ok) {
    throw new SaveRequestError({
      occurredAt: new Date().toISOString(),
      ...context,
      status: response.status,
      statusText: response.statusText,
      code: responseCode(payload),
      message: responseMessage(payload, `HTTP ${response.status}`),
      response: payload,
    });
  }
  return payload as T;
}

export function saveFailureLog(
  error: unknown,
  context: SaveRequestContext,
): SaveFailureLog {
  if (error instanceof SaveRequestError) return error.log;
  return {
    occurredAt: new Date().toISOString(),
    ...context,
    code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

export function isProjectVersionConflict(error: unknown) {
  return (
    error instanceof SaveRequestError &&
    error.log.code === "PROJECT_VERSION_CONFLICT"
  );
}

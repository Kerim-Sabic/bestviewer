import {
  createStowFailure,
  StowRsApiResponseSchema,
  type StowRsApiResponse
} from "./stow-rs-schema";

export type StowPushResult =
  | {
      readonly ok: true;
      readonly value: Extract<
        StowRsApiResponse,
        { status: "partially_succeeded" | "succeeded" }
      >;
    }
  | {
      readonly ok: false;
      readonly error: Extract<StowRsApiResponse, { status: "failed" }>;
    };

export async function pushFilesToOrthancStow(
  files: readonly File[],
  signal: AbortSignal
): Promise<StowPushResult> {
  if (files.length === 0) {
    return {
      ok: false,
      error: createStowFailure({
        fileCount: 0,
        message: "No files are selected for Orthanc upload.",
        reason: "invalid_request"
      })
    };
  }

  const formData = new FormData();

  for (const file of files) {
    formData.append("files", file, file.name);
  }

  let response: Response;

  try {
    response = await fetch("/api/dicomweb/studies", {
      body: formData,
      cache: "no-store",
      method: "POST",
      signal
    });
  } catch (error) {
    return {
      ok: false,
      error: createStowFailure({
        fileCount: files.length,
        message: getFetchErrorMessage(error),
        reason: getFetchFailureReason(error)
      })
    };
  }

  const jsonResult = await readJson(response);

  if (!jsonResult.ok) {
    return {
      ok: false,
      error: createStowFailure({
        fileCount: files.length,
        message: jsonResult.message,
        reason: "schema_invalid"
      })
    };
  }

  const parsed = StowRsApiResponseSchema.safeParse(jsonResult.value);

  if (!parsed.success) {
    return {
      ok: false,
      error: createStowFailure({
        fileCount: files.length,
        message: "STOW-RS response from viewer API was invalid.",
        reason: "schema_invalid"
      })
    };
  }

  if (parsed.data.status === "failed") {
    return { ok: false, error: parsed.data };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: createStowFailure({
        fileCount: files.length,
        message: `STOW-RS upload failed with HTTP ${response.status}.`,
        reason: "upstream_http",
        upstreamStatus: response.status
      })
    };
  }

  return { ok: true, value: parsed.data };
}

type JsonReadResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

async function readJson(response: Response): Promise<JsonReadResult> {
  try {
    return { ok: true, value: await response.json() };
  } catch (error) {
    return {
      ok: false,
      message: `STOW-RS response was not JSON: ${getErrorMessage(error)}`
    };
  }
}

function getFetchFailureReason(error: unknown): "cancelled" | "network" {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "cancelled";
  }

  return "network";
}

function getFetchErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "STOW-RS upload was cancelled.";
  }

  return `Unable to reach the viewer STOW-RS API: ${getErrorMessage(error)}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

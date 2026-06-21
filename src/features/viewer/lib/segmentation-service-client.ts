import {
  SegmentationServiceStatusSchema,
  type SegmentationServiceStatus
} from "./segmentation-service-schema";

export type SegmentationServiceStatusResult =
  | { readonly ok: true; readonly value: SegmentationServiceStatus }
  | { readonly ok: false; readonly message: string };

export async function fetchSegmentationServiceStatus(
  signal: AbortSignal
): Promise<SegmentationServiceStatusResult> {
  let response: Response;

  try {
    response = await fetch("/api/segment", {
      cache: "no-store",
      signal
    });
  } catch (error) {
    return { ok: false, message: getFetchErrorMessage(error) };
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    return {
      ok: false,
      message: `Segmentation status response was invalid: ${getErrorMessage(error)}`
    };
  }

  const parsed = SegmentationServiceStatusSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Segmentation status response did not match the expected schema."
    };
  }

  return { ok: true, value: parsed.data };
}

function getFetchErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Segmentation status request was cancelled.";
  }

  return `Could not check segmentation service: ${getErrorMessage(error)}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

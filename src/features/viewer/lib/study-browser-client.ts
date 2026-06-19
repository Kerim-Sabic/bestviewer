import {
  StudyBrowserApiErrorSchema,
  StudyBrowserResponseSchema,
  type StudyBrowserResponse
} from "./study-browser-schema";

export type StudyBrowserFetchResult =
  | { ok: true; value: StudyBrowserResponse }
  | { ok: false; message: string };

export async function fetchStudyBrowser(
  signal: AbortSignal
): Promise<StudyBrowserFetchResult> {
  let response: Response;

  try {
    response = await fetch("/api/orthanc/studies", {
      cache: "no-store",
      signal
    });
  } catch (error) {
    return { ok: false, message: getFetchErrorMessage(error) };
  }

  const jsonResult = await readJson(response);

  if (!jsonResult.ok) {
    return jsonResult;
  }

  if (!response.ok) {
    const parsedError = StudyBrowserApiErrorSchema.safeParse(jsonResult.value);

    if (parsedError.success) {
      return { ok: false, message: parsedError.data.message };
    }

    return { ok: false, message: `Study browser failed: ${response.status}` };
  }

  const parsed = StudyBrowserResponseSchema.safeParse(jsonResult.value);

  if (!parsed.success) {
    return { ok: false, message: "Study browser response was invalid" };
  }

  return { ok: true, value: parsed.data };
}

type JsonReadResult =
  | { ok: true; value: unknown }
  | { ok: false; message: string };

async function readJson(response: Response): Promise<JsonReadResult> {
  try {
    return { ok: true, value: await response.json() };
  } catch (error) {
    return { ok: false, message: getFetchErrorMessage(error) };
  }
}

function getFetchErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Study browser request was cancelled";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to load studies";
}

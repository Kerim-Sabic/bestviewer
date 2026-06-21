import {
  createStowFailure,
  parseStowRsDicomJsonResponse
} from "@/features/viewer/lib/stow-rs-schema";

const PASS_THROUGH_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified"
] as const;

type DicomWebRouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

const STOW_PART_CONTENT_TYPE = "application/dicom";

export async function GET(
  request: Request,
  context: DicomWebRouteContext
): Promise<Response> {
  const { path } = await context.params;
  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(
    `${getUpstreamBaseUrl()}/${path.map(encodeURIComponent).join("/")}`
  );
  upstreamUrl.search = requestUrl.search;

  const headers = new Headers();
  const acceptHeader = request.headers.get("accept");
  const rangeHeader = request.headers.get("range");

  if (acceptHeader) {
    headers.set("accept", acceptHeader);
  }

  if (rangeHeader) {
    headers.set("range", rangeHeader);
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    cache: "no-store",
    headers
  });

  return new Response(upstreamResponse.body, {
    headers: copyResponseHeaders(upstreamResponse.headers),
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText
  });
}

export async function POST(
  request: Request,
  context: DicomWebRouteContext
): Promise<Response> {
  const { path } = await context.params;

  if (!isSupportedStowPath(path)) {
    return Response.json(
      createStowFailure({
        fileCount: null,
        message: "Only STOW-RS POST to /studies is supported.",
        reason: "invalid_request"
      }),
      { status: 405 }
    );
  }

  const formDataResult = await readFormData(request);

  if (!formDataResult.ok) {
    return Response.json(
      createStowFailure({
        fileCount: null,
        message: formDataResult.message,
        reason: "invalid_request"
      }),
      { status: 400 }
    );
  }

  const files = formDataResult.value.getAll("files").filter(isFileWithContent);

  if (files.length === 0) {
    return Response.json(
      createStowFailure({
        fileCount: 0,
        message: "No DICOM files were provided for STOW-RS upload.",
        reason: "invalid_request"
      }),
      { status: 400 }
    );
  }

  const boundary = `horalix-${crypto.randomUUID()}`;
  const upstreamUrl = new URL(
    `${getUpstreamBaseUrl()}/${path.map(encodeURIComponent).join("/")}`
  );

  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(upstreamUrl, {
      body: await buildStowMultipartBody(files, boundary),
      cache: "no-store",
      headers: {
        Accept: "application/dicom+json",
        "Content-Type": `multipart/related; type="${STOW_PART_CONTENT_TYPE}"; boundary=${boundary}`
      },
      method: "POST"
    });
  } catch (error) {
    return Response.json(
      createStowFailure({
        fileCount: files.length,
        message: `Orthanc STOW-RS is unavailable: ${getErrorMessage(error)}`,
        reason: "orthanc_offline"
      }),
      { status: 502 }
    );
  }

  if (!upstreamResponse.ok) {
    return Response.json(
      createStowFailure({
        fileCount: files.length,
        message: `Orthanc STOW-RS returned ${upstreamResponse.status} ${upstreamResponse.statusText}`.trim(),
        reason: "upstream_http",
        upstreamStatus: upstreamResponse.status
      }),
      { status: 502 }
    );
  }

  const jsonResult = await readJson(upstreamResponse);

  if (!jsonResult.ok) {
    return Response.json(
      createStowFailure({
        fileCount: files.length,
        message: jsonResult.message,
        reason: "schema_invalid",
        upstreamStatus: upstreamResponse.status
      }),
      { status: 502 }
    );
  }

  const parsed = parseStowRsDicomJsonResponse(
    jsonResult.value,
    upstreamResponse.status,
    files.length
  );

  if (!parsed.ok) {
    return Response.json(
      createStowFailure({
        fileCount: files.length,
        message: `Orthanc STOW-RS response was invalid: ${parsed.message}`,
        reason: "schema_invalid",
        upstreamStatus: upstreamResponse.status
      }),
      { status: 502 }
    );
  }

  return Response.json(parsed.value, {
    status: parsed.value.status === "partially_succeeded" ? 202 : 200
  });
}

function getUpstreamBaseUrl(): string {
  return (process.env.ORTHANC_DICOMWEB_URL ?? "http://localhost:8042/dicom-web").replace(
    /\/+$/,
    ""
  );
}

function copyResponseHeaders(source: Headers): Headers {
  const headers = new Headers();

  for (const header of PASS_THROUGH_HEADERS) {
    const value = source.get(header);

    if (value) {
      headers.set(header, value);
    }
  }

  return headers;
}

type FormDataReadResult =
  | { readonly ok: true; readonly value: FormData }
  | { readonly ok: false; readonly message: string };

type JsonReadResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

async function readFormData(request: Request): Promise<FormDataReadResult> {
  try {
    return { ok: true, value: await request.formData() };
  } catch (error) {
    return {
      ok: false,
      message: `STOW-RS upload request was invalid: ${getErrorMessage(error)}`
    };
  }
}

async function readJson(response: Response): Promise<JsonReadResult> {
  try {
    return { ok: true, value: await response.json() };
  } catch (error) {
    return {
      ok: false,
      message: `Orthanc STOW-RS response was not DICOM JSON: ${getErrorMessage(error)}`
    };
  }
}

async function buildStowMultipartBody(
  files: readonly File[],
  boundary: string
): Promise<Blob> {
  const encoder = new TextEncoder();
  const chunks: BlobPart[] = [];

  for (const file of files) {
    chunks.push(
      encoder.encode(
        `--${boundary}\r\nContent-Type: ${STOW_PART_CONTENT_TYPE}\r\n\r\n`
      )
    );
    chunks.push(await file.arrayBuffer());
    chunks.push(encoder.encode("\r\n"));
  }

  chunks.push(encoder.encode(`--${boundary}--\r\n`));

  return new Blob(chunks, {
    type: `multipart/related; type="${STOW_PART_CONTENT_TYPE}"; boundary=${boundary}`
  });
}

function isSupportedStowPath(path: readonly string[]): boolean {
  return path.length === 1 && path[0] === "studies";
}

function isFileWithContent(value: FormDataEntryValue): value is File {
  return value instanceof File && value.size > 0;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

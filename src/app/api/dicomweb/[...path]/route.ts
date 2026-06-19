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

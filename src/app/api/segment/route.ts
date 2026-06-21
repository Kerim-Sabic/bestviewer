export const dynamic = "force-dynamic";

const SERVICE_URL = process.env.SEGMENTATION_SERVICE_URL;

/**
 * Proxy the viewer's segmentation request to the on-prem GPU inference service
 * (keeps the service URL server-side, avoids CORS, lets pixels stay on the
 * hospital network). When no service is configured we return a typed 503 rather
 * than ever fabricating a mask — clinical output must come from a validated
 * model, not from here.
 */
export async function POST(request: Request): Promise<Response> {
  if (!SERVICE_URL) {
    return Response.json(
      {
        message:
          "Segmentation service is not configured. Set SEGMENTATION_SERVICE_URL " +
          "to your on-prem GPU inference service (see services/segmentation)."
      },
      { status: 503 }
    );
  }

  const body = await request.text();

  try {
    const upstream = await fetch(`${SERVICE_URL.replace(/\/+$/, "")}/segment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store"
    });

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json"
      }
    });
  } catch (error) {
    return Response.json(
      {
        message: `Could not reach segmentation service: ${
          error instanceof Error ? error.message : String(error)
        }`
      },
      { status: 502 }
    );
  }
}

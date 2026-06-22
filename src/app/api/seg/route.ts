export const dynamic = "force-dynamic";

const SERVICE_URL = process.env.SEGMENTATION_SERVICE_URL;

/**
 * Proxy a DICOM SEG export to the inference service, which builds a
 * standards-compliant SEG (highdicom) from the clinician-editable labelmap and
 * STOWs it to Orthanc. Kept server-side so the service/Orthanc URLs stay off the
 * client and pixels never leave the network.
 */
export async function POST(request: Request): Promise<Response> {
  if (!SERVICE_URL) {
    return Response.json(
      {
        status: "error",
        message:
          "Segmentation service is not configured (set SEGMENTATION_SERVICE_URL)."
      },
      { status: 503 }
    );
  }

  const body = await request.text();

  try {
    const upstream = await fetch(`${SERVICE_URL.replace(/\/+$/, "")}/seg`, {
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
        status: "error",
        message: `Could not reach segmentation service: ${
          error instanceof Error ? error.message : String(error)
        }`
      },
      { status: 502 }
    );
  }
}

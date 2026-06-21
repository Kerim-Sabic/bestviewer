import { z } from "zod";

import type { SegmentationServiceStatus } from "@/features/viewer/lib/segmentation-service-schema";

export const dynamic = "force-dynamic";

const SERVICE_URL = process.env.SEGMENTATION_SERVICE_URL;
const SERVICE_NOT_CONFIGURED_MESSAGE =
  "Segmentation service is not configured. Set SEGMENTATION_SERVICE_URL " +
  "to your on-prem GPU inference service (see services/segmentation).";

const ReadyResponseSchema = z.object({
  modelId: z.string().min(1),
  ready: z.boolean()
});

/**
 * Proxy the viewer's segmentation request to the on-prem GPU inference service
 * (keeps the service URL server-side, avoids CORS, lets pixels stay on the
 * hospital network). When no service is configured we return a typed 503 rather
 * than ever fabricating a mask — clinical output must come from a validated
 * model, not from here.
 */
export async function GET(): Promise<Response> {
  if (!SERVICE_URL) {
    return Response.json(
      {
        message: SERVICE_NOT_CONFIGURED_MESSAGE,
        models: [],
        reason: "not_configured",
        status: "unavailable"
      } satisfies SegmentationServiceStatus,
      { status: 503 }
    );
  }

  try {
    const upstream = await fetch(`${trimServiceUrl(SERVICE_URL)}/ready`, {
      cache: "no-store",
      headers: { accept: "application/json" }
    });

    const payload = await upstream.json();
    const parsed = ReadyResponseSchema.safeParse(payload);

    if (!parsed.success) {
      return Response.json(
        {
          message: "Segmentation service readiness response was invalid.",
          models: [],
          reason: "not_ready",
          status: "unavailable"
        } satisfies SegmentationServiceStatus,
        { status: 502 }
      );
    }

    if (!upstream.ok || !parsed.data.ready) {
      return Response.json(
        {
          message: `Segmentation service is not ready for inference (model: ${parsed.data.modelId}).`,
          models: [],
          reason: "not_ready",
          status: "unavailable"
        } satisfies SegmentationServiceStatus,
        { status: 503 }
      );
    }

    return Response.json({
      message: "Segmentation service is ready.",
      models: [
        {
          id: parsed.data.modelId,
          label: parsed.data.modelId,
          version: null
        }
      ],
      status: "ready"
    } satisfies SegmentationServiceStatus);
  } catch (error) {
    return Response.json(
      {
        message: `Could not reach segmentation service: ${getErrorMessage(error)}`,
        models: [],
        reason: "network",
        status: "unavailable"
      } satisfies SegmentationServiceStatus,
      { status: 502 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!SERVICE_URL) {
    return Response.json(
      {
        message: SERVICE_NOT_CONFIGURED_MESSAGE
      },
      { status: 503 }
    );
  }

  const body = await request.text();

  try {
    const upstream = await fetch(`${trimServiceUrl(SERVICE_URL)}/segment`, {
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
        message: `Could not reach segmentation service: ${getErrorMessage(error)}`
      },
      { status: 502 }
    );
  }
}

function trimServiceUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

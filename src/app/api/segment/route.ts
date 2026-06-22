import { z } from "zod";

import type { SegmentationServiceStatus } from "@/features/viewer/lib/segmentation-service-schema";

export const dynamic = "force-dynamic";

const SERVICE_URL = process.env.SEGMENTATION_SERVICE_URL;
const SERVICE_NOT_CONFIGURED_MESSAGE =
  "Segmentation service is not configured. Set SEGMENTATION_SERVICE_URL " +
  "to your on-prem GPU inference service (see services/segmentation).";

const ModelsResponseSchema = z.object({
  models: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      version: z.string().nullable().optional(),
      ready: z.boolean()
    })
  )
});

/**
 * Proxy the viewer's segmentation request to the on-prem GPU inference service
 * (keeps the service URL server-side, avoids CORS, lets pixels stay on the
 * hospital network). When no service is configured we return a typed 503 rather
 * than ever fabricating a mask — clinical output must come from a validated
 * model, not from here. The GET surfaces the full model menu (one entry per
 * loaded backend) so the UI can offer model selection.
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
    const upstream = await fetch(`${trimServiceUrl(SERVICE_URL)}/models`, {
      cache: "no-store",
      headers: { accept: "application/json" }
    });

    const payload = await upstream.json();
    const parsed = ModelsResponseSchema.safeParse(payload);

    if (!parsed.success) {
      return Response.json(
        {
          message: "Segmentation service model response was invalid.",
          models: [],
          reason: "not_ready",
          status: "unavailable"
        } satisfies SegmentationServiceStatus,
        { status: 502 }
      );
    }

    const readyModels = parsed.data.models
      .filter((model) => model.ready)
      .map((model) => ({
        id: model.id,
        label: model.label,
        version: model.version ?? null
      }));

    if (!upstream.ok || readyModels.length === 0) {
      return Response.json(
        {
          message:
            "Segmentation service is reachable but no model is loaded on the GPU yet.",
          models: [],
          reason: "not_ready",
          status: "unavailable"
        } satisfies SegmentationServiceStatus,
        { status: 503 }
      );
    }

    return Response.json({
      message: `Segmentation service ready — ${readyModels.length} model(s) loaded.`,
      models: readyModels,
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

import { z } from "zod";

import { err, getErrorMessage, ok, type Result } from "./result";

/**
 * Promptable AI segmentation seam. This module is the single source of truth
 * for the viewer <-> inference-service contract; it is intentionally
 * **model-agnostic** (the model is a request parameter), carries prompts in
 * **image-pixel** space (never canvas pixels or Cornerstone detail), and parses
 * every response at the boundary into typed results. The clinical pixels it
 * moves originate in a validated segmentation service, never in a language model.
 */

// --------------------------------------------------------------------------
// Prompts — domain types, in image-pixel coordinates
// --------------------------------------------------------------------------

export type SegmentationPrompt =
  | {
      readonly kind: "point";
      readonly x: number;
      readonly y: number;
      /** include (foreground) vs exclude (background) click. */
      readonly include: boolean;
    }
  | {
      readonly kind: "box";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };

export interface ImageReference {
  readonly studyInstanceUid: string;
  readonly seriesInstanceUid: string;
  readonly sopInstanceUid: string;
  /** 0-based frame index within the referenced instance. */
  readonly frameIndex: number;
}

export interface SegmentationRequest {
  readonly modelId: string;
  readonly image: ImageReference;
  readonly prompts: readonly SegmentationPrompt[];
  /** 1-based labelmap segment the mask is written into. */
  readonly segmentIndex: number;
  /** Ask the service to propagate the prompt across frames (temporal memory). */
  readonly propagate: boolean;
}

// --------------------------------------------------------------------------
// Wire schemas (parse, don't validate)
// --------------------------------------------------------------------------

const promptSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("point"),
    x: z.number(),
    y: z.number(),
    include: z.boolean()
  }),
  z.object({
    kind: z.literal("box"),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive()
  })
]);

export const segmentationRequestSchema = z.object({
  modelId: z.string().min(1),
  image: z.object({
    studyInstanceUid: z.string().min(1),
    seriesInstanceUid: z.string().min(1),
    sopInstanceUid: z.string().min(1),
    frameIndex: z.number().int().nonnegative()
  }),
  prompts: z.array(promptSchema).min(1),
  segmentIndex: z.number().int().positive(),
  propagate: z.boolean()
});

const frameMaskSchema = z.object({
  frameIndex: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /**
   * Run-length encoding, row-major, alternating run lengths that START with a
   * background (0) run. A segmentation is mostly background, so RLE keeps a
   * 512^2 mask to a few hundred integers with no image codec.
   */
  runLengths: z.array(z.number().int().nonnegative())
});

export const segmentationResponseSchema = z.object({
  modelId: z.string(),
  modelVersion: z.string(),
  confidence: z.number().min(0).max(1).nullable(),
  inferenceMs: z.number().nonnegative(),
  frames: z.array(frameMaskSchema).min(1)
});

type SegmentationResponseWire = z.infer<typeof segmentationResponseSchema>;
type FrameMaskWire = z.infer<typeof frameMaskSchema>;

// --------------------------------------------------------------------------
// Decoded results
// --------------------------------------------------------------------------

export interface DecodedFrameMask {
  readonly frameIndex: number;
  readonly width: number;
  readonly height: number;
  /** 0/1 per pixel, row-major, length width * height. */
  readonly mask: Uint8Array;
}

export interface SegmentationResult {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly confidence: number | null;
  readonly inferenceMs: number;
  readonly frames: readonly DecodedFrameMask[];
}

export type InferenceError =
  | { reason: "aborted"; message: string }
  | { reason: "network"; message: string }
  | { reason: "http"; status: number; message: string }
  | { reason: "invalid_response"; message: string }
  | { reason: "decode"; message: string };

export interface RunSegmentationOptions {
  readonly endpoint: string;
  readonly signal?: AbortSignal;
}

/**
 * Call the inference service. Supports `AbortSignal` so a superseded prompt
 * (live mode clicks faster than the GPU answers) is cancelled cleanly. Every
 * failure is a typed {@link InferenceError}, never a throw.
 */
export async function runSegmentation(
  request: SegmentationRequest,
  options: RunSegmentationOptions
): Promise<Result<SegmentationResult, InferenceError>> {
  let response: Response;

  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request)
  };

  if (options.signal) {
    init.signal = options.signal;
  }

  try {
    response = await fetch(options.endpoint, init);
  } catch (error) {
    if (options.signal?.aborted) {
      return err({ reason: "aborted", message: "Inference request was superseded." });
    }

    return err({ reason: "network", message: getErrorMessage(error) });
  }

  if (!response.ok) {
    return err({
      reason: "http",
      status: response.status,
      message: `Inference service returned HTTP ${response.status}.`
    });
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    return err({ reason: "invalid_response", message: getErrorMessage(error) });
  }

  const parsed = segmentationResponseSchema.safeParse(payload);

  if (!parsed.success) {
    return err({ reason: "invalid_response", message: parsed.error.message });
  }

  try {
    return ok({
      modelId: parsed.data.modelId,
      modelVersion: parsed.data.modelVersion,
      confidence: parsed.data.confidence,
      inferenceMs: parsed.data.inferenceMs,
      frames: parsed.data.frames.map(decodeFrameMask)
    });
  } catch (error) {
    return err({ reason: "decode", message: getErrorMessage(error) });
  }
}

/**
 * Decode one RLE frame into a flat 0/1 mask. Runs are clipped at the buffer end
 * rather than overrunning on a malformed stream.
 */
export function decodeFrameMask(frame: FrameMaskWire): DecodedFrameMask {
  const total = frame.width * frame.height;
  const mask = new Uint8Array(total);

  let offset = 0;
  let isForeground = false; // RLE starts with a background run

  for (const run of frame.runLengths) {
    const end = Math.min(offset + run, total);

    if (isForeground) {
      mask.fill(1, offset, end);
    }

    offset = end;
    isForeground = !isForeground;

    if (offset >= total) {
      break;
    }
  }

  return {
    frameIndex: frame.frameIndex,
    width: frame.width,
    height: frame.height,
    mask
  };
}

/**
 * Encode a flat 0/1 mask as row-major run lengths that START with a background
 * (0) run — the same scheme {@link decodeFrameMask} consumes. If the first pixel
 * is foreground, a leading zero-length background run is emitted so the
 * alternation invariant holds. Used to serialize a (clinician-edited) labelmap
 * frame for DICOM SEG export.
 */
export function encodeMaskRle(mask: Uint8Array): number[] {
  const runs: number[] = [];
  let current = 0; // RLE starts with a background run
  let count = 0;

  for (let index = 0; index < mask.length; index += 1) {
    const value = mask[index] === 1 ? 1 : 0;

    if (value === current) {
      count += 1;
    } else {
      runs.push(count);
      current = value;
      count = 1;
    }
  }

  runs.push(count);
  return runs;
}

export type { SegmentationResponseWire };

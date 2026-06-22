import { wadors } from "@cornerstonejs/dicom-image-loader";
import { z } from "zod";

import {
  ImageId,
  SeriesInstanceUid,
  SopInstanceUid,
  StudyInstanceUid
} from "./brand";
import { err, getErrorMessage, ok, type Result } from "./result";
import type { ImageReference } from "./segmentation";

const SOP_INSTANCE_UID_TAG = "00080018";
const MODALITY_TAG = "00080060";
const RECOMMENDED_DISPLAY_FRAME_RATE_TAG = "00082144";
const CINE_RATE_TAG = "00180040";
const FRAME_TIME_TAG = "00181063";
const NUMBER_OF_FRAMES_TAG = "00280008";

const DicomWebElementSchema = z
  .object({
    vr: z.string().optional(),
    Value: z.array(z.unknown()).optional(),
    BulkDataURI: z.string().optional(),
    InlineBinary: z.string().optional()
  })
  .passthrough();

const DicomWebMetadataSchema = z.record(z.string(), DicomWebElementSchema);
const DicomWebMetadataListSchema = z.array(DicomWebMetadataSchema);

export type DicomWebMetadata = z.infer<typeof DicomWebMetadataSchema>;

type WadorsElementValue = boolean | number[] | string[];
type WadorsMetadata = Record<string, { Value: WadorsElementValue }>;

export type DicomWebLoadError =
  | { reason: "network"; message: string }
  | { reason: "http"; status: number; message: string }
  | { reason: "invalid_metadata"; message: string }
  | { reason: "missing_sop_instance_uid"; index: number };

export interface DicomWebSeriesRequest {
  readonly wadoRoot: string;
  readonly studyInstanceUid: StudyInstanceUid;
  readonly seriesInstanceUid: SeriesInstanceUid;
  readonly headers?: HeadersInit;
}

export interface DicomWebSeries {
  readonly imageIds: ImageId[];
  readonly imageReferences: readonly ImageReference[];
  readonly instances: readonly DicomWebMetadata[];
  readonly modality: string | null;
  readonly recommendedFrameRate: number | null;
}

export async function fetchDicomWebSeries(
  request: DicomWebSeriesRequest
): Promise<Result<DicomWebSeries, DicomWebLoadError>> {
  const metadataUrl = buildSeriesMetadataUrl(request);
  const responseResult = await fetchJson(metadataUrl, request.headers);

  if (!responseResult.ok) {
    return responseResult;
  }

  const parsed = DicomWebMetadataListSchema.safeParse(responseResult.value);

  if (!parsed.success) {
    return err({
      reason: "invalid_metadata",
      message: parsed.error.message
    });
  }

  const imageIds: ImageId[] = [];
  const imageReferences: ImageReference[] = [];

  for (const [index, metadata] of parsed.data.entries()) {
    const sopInstanceUid = readString(metadata, SOP_INSTANCE_UID_TAG);

    if (!sopInstanceUid) {
      return err({ reason: "missing_sop_instance_uid", index });
    }

    const frameCount = readPositiveInteger(metadata, NUMBER_OF_FRAMES_TAG) ?? 1;
    const wadorsMetadata = toWadorsMetadata(metadata);

    for (let frame = 1; frame <= frameCount; frame += 1) {
      const imageId = buildFrameImageId({
        frame,
        seriesInstanceUid: request.seriesInstanceUid,
        sopInstanceUid: SopInstanceUid(sopInstanceUid),
        studyInstanceUid: request.studyInstanceUid,
        wadoRoot: request.wadoRoot
      });

      wadors.metaDataManager.add(imageId, wadorsMetadata);
      imageIds.push(imageId);
      imageReferences.push({
        frameIndex: frame - 1,
        seriesInstanceUid: request.seriesInstanceUid,
        sopInstanceUid,
        studyInstanceUid: request.studyInstanceUid
      });
    }
  }

  const firstInstance = parsed.data[0];

  return ok({
    imageIds,
    imageReferences,
    instances: parsed.data,
    modality: firstInstance ? readString(firstInstance, MODALITY_TAG) ?? null : null,
    recommendedFrameRate: readRecommendedFrameRate(parsed.data)
  });
}

export function buildSeriesMetadataUrl(request: DicomWebSeriesRequest): string {
  return [
    trimTrailingSlash(request.wadoRoot),
    "studies",
    encodeURIComponent(request.studyInstanceUid),
    "series",
    encodeURIComponent(request.seriesInstanceUid),
    "metadata"
  ].join("/");
}

export interface FrameImageIdInput {
  readonly frame: number;
  readonly seriesInstanceUid: SeriesInstanceUid;
  readonly sopInstanceUid: SopInstanceUid;
  readonly studyInstanceUid: StudyInstanceUid;
  readonly wadoRoot: string;
}

export function buildFrameImageId(input: FrameImageIdInput): ImageId {
  const frameUrl = [
    trimTrailingSlash(input.wadoRoot),
    "studies",
    encodeURIComponent(input.studyInstanceUid),
    "series",
    encodeURIComponent(input.seriesInstanceUid),
    "instances",
    encodeURIComponent(input.sopInstanceUid),
    "frames",
    String(input.frame)
  ].join("/");

  return ImageId(`wadors:${frameUrl}`);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

async function fetchJson(
  url: string,
  headers: HeadersInit | undefined
): Promise<Result<unknown, DicomWebLoadError>> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/dicom+json",
        ...headers
      }
    });
  } catch (error) {
    return err({ reason: "network", message: getErrorMessage(error) });
  }

  if (!response.ok) {
    return err({
      reason: "http",
      status: response.status,
      message: response.statusText
    });
  }

  try {
    return ok(await response.json());
  } catch (error) {
    return err({ reason: "invalid_metadata", message: getErrorMessage(error) });
  }
}

function readString(
  metadata: DicomWebMetadata,
  tag: string
): string | undefined {
  const firstValue = metadata[tag]?.Value?.[0];

  if (typeof firstValue === "string") {
    return firstValue;
  }

  if (typeof firstValue === "number") {
    return String(firstValue);
  }

  return undefined;
}

function readPositiveInteger(
  metadata: DicomWebMetadata,
  tag: string
): number | undefined {
  const value = readNumber(metadata, tag);

  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 1) {
    return undefined;
  }

  return value;
}

function readNumber(
  metadata: DicomWebMetadata,
  tag: string
): number | undefined {
  const firstValue = metadata[tag]?.Value?.[0];

  if (typeof firstValue === "number" && Number.isFinite(firstValue)) {
    return firstValue;
  }

  if (typeof firstValue !== "string") {
    return undefined;
  }

  const parsed = Number(firstValue);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

function readRecommendedFrameRate(
  instances: readonly DicomWebMetadata[]
): number | null {
  for (const metadata of instances) {
    const recommendedRate =
      readPositiveFrameRate(metadata, RECOMMENDED_DISPLAY_FRAME_RATE_TAG) ??
      readPositiveFrameRate(metadata, CINE_RATE_TAG) ??
      readFrameRateFromFrameTime(metadata);

    if (recommendedRate !== null) {
      return recommendedRate;
    }
  }

  return null;
}

function readPositiveFrameRate(
  metadata: DicomWebMetadata,
  tag: string
): number | null {
  const value = readNumber(metadata, tag);

  if (value === undefined || value <= 0 || value > 120) {
    return null;
  }

  return Math.round(value);
}

function readFrameRateFromFrameTime(metadata: DicomWebMetadata): number | null {
  const frameTimeMilliseconds = readNumber(metadata, FRAME_TIME_TAG);

  if (
    frameTimeMilliseconds === undefined ||
    frameTimeMilliseconds <= 0 ||
    frameTimeMilliseconds > 1000
  ) {
    return null;
  }

  return Math.round(1000 / frameTimeMilliseconds);
}

function toWadorsMetadata(metadata: DicomWebMetadata): WadorsMetadata {
  const converted: WadorsMetadata = {};

  for (const [tag, element] of Object.entries(metadata)) {
    const value = toWadorsValue(element.Value);

    if (value !== undefined) {
      converted[tag] = { Value: value };
    }
  }

  return converted;
}

function toWadorsValue(values: unknown[] | undefined): WadorsElementValue | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  const stringValues = values.filter(isString);

  if (stringValues.length === values.length) {
    return stringValues;
  }

  const numberValues = values.filter(isNumber);

  if (numberValues.length === values.length) {
    return numberValues;
  }

  const firstValue = values[0];

  if (typeof firstValue === "boolean") {
    return firstValue;
  }

  return values.map(String);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

import { z } from "zod";

export const StowUploadFailureReasonSchema = z.enum([
  "cancelled",
  "invalid_request",
  "network",
  "orthanc_offline",
  "schema_invalid",
  "upstream_http"
]);

export const StowInstanceReferenceSchema = z.object({
  retrieveUrl: z.string().nullable(),
  sopClassUid: z.string().nullable(),
  sopInstanceUid: z.string().nullable(),
  warningReason: z.string().nullable()
});

export const StowInstanceFailureSchema = z.object({
  failureReason: z.string().nullable(),
  sopClassUid: z.string().nullable(),
  sopInstanceUid: z.string().nullable()
});

const StowResponseBaseSchema = z.object({
  accepted: z.array(StowInstanceReferenceSchema),
  fileCount: z.number().int().positive(),
  rejected: z.array(StowInstanceFailureSchema),
  studyRetrieveUrl: z.string().nullable(),
  upstreamStatus: z.number().int()
});

export const StowRsSucceededResponseSchema = StowResponseBaseSchema.extend({
  status: z.literal("succeeded")
});

export const StowRsPartiallySucceededResponseSchema = StowResponseBaseSchema.extend({
  status: z.literal("partially_succeeded")
});

export const StowRsFailedResponseSchema = z.object({
  fileCount: z.number().int().nonnegative().nullable(),
  message: z.string().min(1),
  reason: StowUploadFailureReasonSchema,
  status: z.literal("failed"),
  upstreamStatus: z.number().int().optional()
});

export const StowRsApiResponseSchema = z.discriminatedUnion("status", [
  StowRsSucceededResponseSchema,
  StowRsPartiallySucceededResponseSchema,
  StowRsFailedResponseSchema
]);

const DicomJsonElementSchema = z
  .object({
    Value: z.array(z.unknown()).optional(),
    vr: z.string().optional()
  })
  .passthrough();

const DicomJsonDatasetSchema = z.record(z.string(), DicomJsonElementSchema);

const DicomJsonSequenceElementSchema = z
  .object({
    Value: z.array(DicomJsonDatasetSchema).optional()
  })
  .passthrough();

export type StowUploadFailureReason = z.infer<
  typeof StowUploadFailureReasonSchema
>;
export type StowInstanceReference = z.infer<typeof StowInstanceReferenceSchema>;
export type StowInstanceFailure = z.infer<typeof StowInstanceFailureSchema>;
export type StowRsApiResponse = z.infer<typeof StowRsApiResponseSchema>;

type DicomJsonDataset = z.infer<typeof DicomJsonDatasetSchema>;

type ParsedStowResponse =
  | {
      readonly ok: true;
      readonly value: Extract<
        StowRsApiResponse,
        { status: "partially_succeeded" | "succeeded" }
      >;
    }
  | { readonly ok: false; readonly message: string };

const TAG = {
  failedSopSequence: "00081198",
  failureReason: "00081197",
  referencedSopClassUid: "00081150",
  referencedSopInstanceUid: "00081155",
  referencedSopSequence: "00081199",
  retrieveUrl: "00081190",
  warningReason: "00081196"
} as const;

export function parseStowRsDicomJsonResponse(
  raw: unknown,
  upstreamStatus: number,
  fileCount: number
): ParsedStowResponse {
  const parsed = DicomJsonDatasetSchema.safeParse(raw);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.message };
  }

  const accepted = readSequence(parsed.data, TAG.referencedSopSequence).map(
    toAcceptedInstance
  );
  const rejected = readSequence(parsed.data, TAG.failedSopSequence).map(
    toRejectedInstance
  );

  return {
    ok: true,
    value: {
      accepted,
      fileCount,
      rejected,
      status:
        upstreamStatus === 202 || rejected.length > 0
          ? "partially_succeeded"
          : "succeeded",
      studyRetrieveUrl: readString(parsed.data, TAG.retrieveUrl),
      upstreamStatus
    }
  };
}

export function createStowFailure(input: {
  readonly fileCount: number | null;
  readonly message: string;
  readonly reason: StowUploadFailureReason;
  readonly upstreamStatus?: number;
}): Extract<StowRsApiResponse, { status: "failed" }> {
  return {
    fileCount: input.fileCount,
    message: input.message,
    reason: input.reason,
    status: "failed",
    ...(input.upstreamStatus === undefined
      ? {}
      : { upstreamStatus: input.upstreamStatus })
  };
}

function toAcceptedInstance(item: DicomJsonDataset): StowInstanceReference {
  return {
    retrieveUrl: readString(item, TAG.retrieveUrl),
    sopClassUid: readString(item, TAG.referencedSopClassUid),
    sopInstanceUid: readString(item, TAG.referencedSopInstanceUid),
    warningReason: readReason(item, TAG.warningReason)
  };
}

function toRejectedInstance(item: DicomJsonDataset): StowInstanceFailure {
  return {
    failureReason: readReason(item, TAG.failureReason),
    sopClassUid: readString(item, TAG.referencedSopClassUid),
    sopInstanceUid: readString(item, TAG.referencedSopInstanceUid)
  };
}

function readSequence(dataset: DicomJsonDataset, tag: string): readonly DicomJsonDataset[] {
  const parsed = DicomJsonSequenceElementSchema.safeParse(dataset[tag]);

  if (!parsed.success) {
    return [];
  }

  return parsed.data.Value ?? [];
}

function readString(dataset: DicomJsonDataset, tag: string): string | null {
  const value = dataset[tag]?.Value?.[0];

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function readReason(dataset: DicomJsonDataset, tag: string): string | null {
  const value = dataset[tag]?.Value?.[0];

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

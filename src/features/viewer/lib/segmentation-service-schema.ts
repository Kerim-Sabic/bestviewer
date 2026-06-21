import { z } from "zod";

export const SegmentationServiceModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  version: z.string().nullable()
});

const UnavailableSegmentationServiceStatusSchema = z.discriminatedUnion(
  "reason",
  [
    z.object({
      message: z.string().min(1),
      models: z.array(SegmentationServiceModelSchema),
      reason: z.literal("not_configured"),
      status: z.literal("unavailable")
    }),
    z.object({
      message: z.string().min(1),
      models: z.array(SegmentationServiceModelSchema),
      reason: z.literal("not_ready"),
      status: z.literal("unavailable")
    }),
    z.object({
      message: z.string().min(1),
      models: z.array(SegmentationServiceModelSchema),
      reason: z.literal("network"),
      status: z.literal("unavailable")
    })
  ]
);

export const SegmentationServiceStatusSchema = z.union([
  UnavailableSegmentationServiceStatusSchema,
  z.object({
    message: z.string().min(1),
    models: z.array(SegmentationServiceModelSchema).min(1),
    status: z.literal("ready")
  })
]);

export type SegmentationServiceModel = z.infer<
  typeof SegmentationServiceModelSchema
>;
export type SegmentationServiceStatus = z.infer<
  typeof SegmentationServiceStatusSchema
>;

import { z } from "zod";

export const StudyBrowserSeriesSchema = z.object({
  description: z.string().nullable(),
  instances: z.number().int().nonnegative(),
  isLoadable: z.boolean(),
  modality: z.string().nullable(),
  seriesId: z.string().min(1),
  seriesInstanceUid: z.string().min(1),
  seriesNumber: z.string().nullable()
});

export const StudyBrowserStudySchema = z.object({
  accessionNumber: z.string().nullable(),
  patientId: z.string().nullable(),
  patientName: z.string().nullable(),
  series: z.array(StudyBrowserSeriesSchema),
  studyDate: z.string().nullable(),
  studyDescription: z.string().nullable(),
  studyId: z.string().min(1),
  studyInstanceUid: z.string().min(1)
});

export const StudyBrowserResponseSchema = z.object({
  refreshedAt: z.string().min(1),
  studies: z.array(StudyBrowserStudySchema)
});

export const StudyBrowserApiErrorSchema = z.object({
  message: z.string().min(1)
});

export type StudyBrowserResponse = z.infer<typeof StudyBrowserResponseSchema>;
export type StudyBrowserSeries = z.infer<typeof StudyBrowserSeriesSchema>;
export type StudyBrowserStudy = z.infer<typeof StudyBrowserStudySchema>;

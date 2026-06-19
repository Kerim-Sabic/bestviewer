export type Brand<T, TBrand extends string> = T & {
  readonly __brand: TBrand;
};

export type ImageId = Brand<string, "ImageId">;
export type RenderingEngineId = Brand<string, "RenderingEngineId">;
export type SeriesInstanceUid = Brand<string, "SeriesInstanceUid">;
export type SopInstanceUid = Brand<string, "SopInstanceUid">;
export type StudyInstanceUid = Brand<string, "StudyInstanceUid">;
export type ToolGroupId = Brand<string, "ToolGroupId">;
export type ViewportId = Brand<string, "ViewportId">;

export function ImageId(value: string): ImageId {
  return value as ImageId;
}

export function RenderingEngineId(value: string): RenderingEngineId {
  return value as RenderingEngineId;
}

export function SeriesInstanceUid(value: string): SeriesInstanceUid {
  return value as SeriesInstanceUid;
}

export function SopInstanceUid(value: string): SopInstanceUid {
  return value as SopInstanceUid;
}

export function StudyInstanceUid(value: string): StudyInstanceUid {
  return value as StudyInstanceUid;
}

export function ToolGroupId(value: string): ToolGroupId {
  return value as ToolGroupId;
}

export function ViewportId(value: string): ViewportId {
  return value as ViewportId;
}

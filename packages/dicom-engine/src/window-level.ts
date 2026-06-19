export interface WindowLevelPreset {
  readonly label: string;
  readonly width: number;
  readonly center: number;
}

export interface VoiRange {
  readonly lower: number;
  readonly upper: number;
}

export function toVoiRange(preset: WindowLevelPreset): VoiRange {
  const halfWidth = preset.width / 2;

  return {
    lower: preset.center - halfWidth,
    upper: preset.center + halfWidth
  };
}

export const CT_WINDOW_LEVEL_PRESETS = {
  brain: { label: "Brain", width: 80, center: 40 },
  subdural: { label: "Subdural", width: 215, center: 75 },
  stroke: { label: "Stroke", width: 40, center: 40 },
  softTissue: { label: "Soft tissue", width: 400, center: 50 },
  mediastinum: { label: "Mediastinum", width: 350, center: 50 },
  liver: { label: "Liver", width: 150, center: 30 },
  lung: { label: "Lung", width: 1500, center: -600 },
  bone: { label: "Bone", width: 2500, center: 480 },
  angio: { label: "Angio", width: 600, center: 300 }
} as const satisfies Record<string, WindowLevelPreset>;

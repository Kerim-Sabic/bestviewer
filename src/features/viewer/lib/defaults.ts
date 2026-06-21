import type { WindowLevelPreset } from "@horalix/dicom-engine";

import type { WindowLevelSelection } from "../types";

const CT_WINDOW_LEVEL_PRESETS = {
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

export const DEFAULT_WINDOW_LEVEL: WindowLevelSelection = {
  key: "softTissue",
  preset: CT_WINDOW_LEVEL_PRESETS.softTissue
};

export const WINDOW_LEVEL_OPTIONS: readonly WindowLevelSelection[] = Object.entries(
  CT_WINDOW_LEVEL_PRESETS
).map(([key, preset]) => ({ key, preset }));

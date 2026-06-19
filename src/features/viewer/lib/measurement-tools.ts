import type { MeasurementToolName } from "@horalix/dicom-engine";
import { Crosshair, Move, Ruler, Square, Triangle, type LucideIcon } from "lucide-react";

/**
 * The measurement tools the palette exposes, in display order. `hotkeyCode`
 * uses `KeyboardEvent.code` so the binding is layout-independent (a `Length`
 * shortcut sits under the physical `L` key on any keyboard layout).
 */
export interface ToolDefinition {
  readonly tool: MeasurementToolName;
  readonly label: string;
  readonly hotkey: string;
  readonly hotkeyCode: string;
  readonly Icon: LucideIcon;
}

export const MEASUREMENT_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  { tool: "length", label: "Length", hotkey: "L", hotkeyCode: "KeyL", Icon: Ruler },
  { tool: "probe", label: "Probe", hotkey: "P", hotkeyCode: "KeyP", Icon: Crosshair },
  { tool: "rectangleRoi", label: "ROI", hotkey: "R", hotkeyCode: "KeyR", Icon: Square },
  {
    tool: "bidirectional",
    label: "Bidirectional",
    hotkey: "B",
    hotkeyCode: "KeyB",
    Icon: Move
  },
  { tool: "angle", label: "Angle", hotkey: "A", hotkeyCode: "KeyA", Icon: Triangle }
];

const TOOL_BY_HOTKEY_CODE = new Map<string, MeasurementToolName>(
  MEASUREMENT_TOOL_DEFINITIONS.map((definition) => [definition.hotkeyCode, definition.tool])
);

export function toolForHotkeyCode(code: string): MeasurementToolName | undefined {
  return TOOL_BY_HOTKEY_CODE.get(code);
}

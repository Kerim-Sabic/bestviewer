"use client";

import type { MeasurementToolName } from "@horalix/dicom-engine";
import { PencilRuler } from "lucide-react";

import { MEASUREMENT_TOOL_DEFINITIONS } from "../lib/measurement-tools";

interface ToolPaletteProps {
  readonly activeTool: MeasurementToolName | null;
  readonly disabled: boolean;
  readonly onSelect: (tool: MeasurementToolName | null) => void;
}

export function ToolPalette({ activeTool, disabled, onSelect }: ToolPaletteProps) {
  return (
    <section className="viewer-panel" aria-labelledby="tools-title">
      <div className="panel-heading">
        <span className="panel-icon" aria-hidden="true">
          <PencilRuler size={16} />
        </span>
        <h2 id="tools-title">Tools</h2>
      </div>

      <div className="tool-grid" role="group" aria-label="Measurement tools">
        {MEASUREMENT_TOOL_DEFINITIONS.map(({ tool, label, hotkey, Icon }) => {
          const isActive = tool === activeTool;

          return (
            <button
              key={tool}
              className="tool-button"
              type="button"
              data-active={isActive}
              aria-pressed={isActive}
              aria-keyshortcuts={hotkey}
              disabled={disabled}
              onClick={() => onSelect(isActive ? null : tool)}
            >
              <Icon size={16} aria-hidden="true" />
              <strong>{label}</strong>
              <kbd>{hotkey}</kbd>
            </button>
          );
        })}
      </div>
    </section>
  );
}

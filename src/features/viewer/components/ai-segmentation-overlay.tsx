"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { PendingPrompt, PromptMode } from "../lib/ai-segmentation";

interface AiSegmentationOverlayProps {
  readonly promptMode: PromptMode;
  readonly pendingPrompts: readonly PendingPrompt[];
  readonly onAddPoint: (canvasPoint: [number, number]) => void;
  readonly onAddBox: (
    start: [number, number],
    end: [number, number]
  ) => void;
}

interface DragState {
  readonly start: [number, number];
  readonly current: [number, number];
}

const MIN_BOX_SIZE = 4;

/**
 * Transient prompt-capture layer over the viewport canvas. It is pointer-active
 * only while a prompt tool is selected, so window/level, zoom, and measurement
 * tools keep the canvas otherwise. Markers are ephemeral affordances for the
 * pending prompts; the resolved mask is a Cornerstone labelmap (which tracks
 * zoom/pan correctly), not canvas paint.
 */
export function AiSegmentationOverlay({
  promptMode,
  pendingPrompts,
  onAddPoint,
  onAddBox
}: AiSegmentationOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const active = promptMode !== "off";

  function toLocalPoint(event: ReactPointerEvent<HTMLDivElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (promptMode === "box") {
      const point = toLocalPoint(event);
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ start: point, current: point });
      return;
    }

    if (promptMode === "point-include" || promptMode === "point-exclude") {
      onAddPoint(toLocalPoint(event));
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag) {
      setDrag({ start: drag.start, current: toLocalPoint(event) });
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) {
      return;
    }

    const end = toLocalPoint(event);
    const width = Math.abs(end[0] - drag.start[0]);
    const height = Math.abs(end[1] - drag.start[1]);

    if (width >= MIN_BOX_SIZE && height >= MIN_BOX_SIZE) {
      onAddBox(drag.start, end);
    }

    setDrag(null);
  }

  return (
    <div
      ref={overlayRef}
      className="ai-overlay"
      data-active={active}
      data-mode={promptMode}
      onPointerDown={active ? handlePointerDown : undefined}
      onPointerMove={active ? handlePointerMove : undefined}
      onPointerUp={active ? handlePointerUp : undefined}
    >
      <svg className="ai-overlay-canvas" aria-hidden="true">
        {pendingPrompts.map((pending) =>
          pending.display.kind === "point" ? (
            <g key={pending.id}>
              <circle
                className="ai-prompt-point"
                cx={pending.display.x}
                cy={pending.display.y}
                r={6}
                data-polarity={pending.display.include ? "include" : "exclude"}
              />
              <line
                className="ai-prompt-tick"
                x1={pending.display.x - 3}
                y1={pending.display.y}
                x2={pending.display.x + 3}
                y2={pending.display.y}
              />
              {pending.display.include ? (
                <line
                  className="ai-prompt-tick"
                  x1={pending.display.x}
                  y1={pending.display.y - 3}
                  x2={pending.display.x}
                  y2={pending.display.y + 3}
                />
              ) : null}
            </g>
          ) : (
            <rect
              key={pending.id}
              className="ai-prompt-box"
              x={pending.display.x}
              y={pending.display.y}
              width={pending.display.width}
              height={pending.display.height}
            />
          )
        )}

        {drag ? (
          <rect
            className="ai-prompt-box ai-prompt-box-preview"
            x={Math.min(drag.start[0], drag.current[0])}
            y={Math.min(drag.start[1], drag.current[1])}
            width={Math.abs(drag.current[0] - drag.start[0])}
            height={Math.abs(drag.current[1] - drag.start[1])}
          />
        ) : null}
      </svg>
    </div>
  );
}

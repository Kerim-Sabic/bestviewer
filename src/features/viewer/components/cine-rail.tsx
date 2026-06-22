"use client";

import { Film } from "lucide-react";
import { useState } from "react";

import type { Cine } from "../lib/study-cines";

interface CineRailProps {
  readonly cines: readonly Cine[];
  readonly activeCineId: string | null;
  readonly onSelect: (cine: Cine) => void;
}

export function CineRail({ cines, activeCineId, onSelect }: CineRailProps) {
  if (cines.length === 0) {
    return <p className="muted-line">No viewable cines.</p>;
  }

  return (
    <ul className="cine-rail-list">
      {cines.map((cine) => (
        <li key={cine.id}>
          <CineCard
            cine={cine}
            isActive={cine.id === activeCineId}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}

function CineCard({
  cine,
  isActive,
  onSelect
}: {
  readonly cine: Cine;
  readonly isActive: boolean;
  readonly onSelect: (cine: Cine) => void;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);

  return (
    <button
      className="cine-card"
      data-active={isActive}
      onClick={() => onSelect(cine)}
      type="button"
    >
      <span className="cine-card-thumb">
        {cine.thumbnailUrl && !thumbFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
            src={cine.thumbnailUrl}
          />
        ) : (
          <Film size={18} aria-hidden="true" />
        )}
        {cine.frameCount > 1 ? (
          <span className="cine-card-frames">{cine.frameCount}f</span>
        ) : null}
      </span>
      <span className="cine-card-body">
        <strong>{cine.label}</strong>
        <small>
          {cine.modality ?? "OT"} ·{" "}
          {cine.frameCount > 1
            ? `${cine.frameCount} frames`
            : `${cine.instanceCount} image${cine.instanceCount === 1 ? "" : "s"}`}
        </small>
      </span>
    </button>
  );
}

"use client";

import { Film, Loader2 } from "lucide-react";

import type { StudyBrowserSeries } from "../lib/study-browser-schema";

interface SeriesRailProps {
  readonly series: readonly StudyBrowserSeries[];
  readonly activeSeriesInstanceUid: string | null;
  readonly loadingSeriesInstanceUid: string | null;
}

interface SeriesRailControlledProps extends SeriesRailProps {
  readonly onSelect: (series: StudyBrowserSeries) => void;
}

/** The study's cines (loadable series) as a switchable rail. Selecting a cine
 * loads it into the single viewport — segmentation is always scoped to the one
 * active cine. */
export function SeriesRail({
  series,
  activeSeriesInstanceUid,
  loadingSeriesInstanceUid,
  onSelect
}: SeriesRailControlledProps) {
  const loadable = series.filter((entry) => entry.isLoadable);

  if (loadable.length === 0) {
    return <p className="muted-line">No image cines in this study.</p>;
  }

  return (
    <ul className="series-rail-list">
      {loadable.map((entry) => {
        const isActive = entry.seriesInstanceUid === activeSeriesInstanceUid;
        const isLoading =
          entry.seriesInstanceUid === loadingSeriesInstanceUid;

        return (
          <li key={entry.seriesId}>
            <button
              className="series-card"
              data-active={isActive}
              disabled={loadingSeriesInstanceUid !== null}
              onClick={() => onSelect(entry)}
              type="button"
            >
              <span className="series-card-thumb" aria-hidden="true">
                {isLoading ? (
                  <Loader2 size={18} className="spin" />
                ) : (
                  <Film size={18} />
                )}
              </span>
              <span className="series-card-body">
                <strong>{seriesTitle(entry)}</strong>
                <small>
                  {entry.instances} frame{entry.instances === 1 ? "" : "s"} ·{" "}
                  {entry.description ?? "No description"}
                </small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function seriesTitle(series: StudyBrowserSeries): string {
  const number = series.seriesNumber ? `#${series.seriesNumber}` : "Series";
  return `${number} · ${series.modality ?? "OT"}`;
}

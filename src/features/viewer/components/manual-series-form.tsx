"use client";

import { UploadCloud } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  getDefaultDicomWebRoot,
  type LoadDicomWebSeriesInput
} from "../lib/load-dicomweb-series";

interface ManualSeriesFormProps {
  readonly onLoadSeries: (input: LoadDicomWebSeriesInput) => void;
}

export function ManualSeriesForm({ onLoadSeries }: ManualSeriesFormProps) {
  const [wadoRoot, setWadoRoot] = useState(getDefaultDicomWebRoot);
  const [studyInstanceUid, setStudyInstanceUid] = useState("");
  const [seriesInstanceUid, setSeriesInstanceUid] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onLoadSeries({
      seriesInstanceUid,
      studyInstanceUid,
      wadoRoot
    });
  }

  return (
    <details className="manual-loader">
      <summary>Manual UID load</summary>
      <form className="study-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>DICOMweb root</span>
          <input
            value={wadoRoot}
            onChange={(event) => setWadoRoot(event.target.value)}
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span>Study Instance UID</span>
          <input
            value={studyInstanceUid}
            onChange={(event) => setStudyInstanceUid(event.target.value)}
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span>Series Instance UID</span>
          <input
            value={seriesInstanceUid}
            onChange={(event) => setSeriesInstanceUid(event.target.value)}
            spellCheck={false}
          />
        </label>

        <button className="primary-command" type="submit">
          <UploadCloud size={16} />
          <span>Load Series</span>
        </button>
      </form>
    </details>
  );
}

"use client";

import { UploadCloud } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";

interface LocalUploadDropzoneProps {
  readonly disabled: boolean;
  readonly onFiles: (files: File[]) => void;
}

export function LocalUploadDropzone({ disabled, onFiles }: LocalUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);

  function emit(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);

    if (files.length > 0) {
      onFiles(files);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);

    if (!disabled) {
      emit(event.dataTransfer.files);
    }
  }

  return (
    <div
      className="upload-dropzone"
      data-dragging={isDragging}
      data-disabled={disabled}
      onDragOver={(event) => {
        event.preventDefault();

        if (!disabled) {
          setIsDragging(true);
        }
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <span className="upload-mark" aria-hidden="true">
        <UploadCloud size={18} />
      </span>
      <strong>Drop DICOM files</strong>
      <span className="upload-hint">Single multi-frame loop or a folder of slices</span>
      <button
        className="secondary-command"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        Choose from your PC
      </button>
      <input
        ref={inputRef}
        id={inputId}
        className="upload-input"
        disabled={disabled}
        multiple
        onChange={(event) => {
          emit(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
        type="file"
      />
    </div>
  );
}

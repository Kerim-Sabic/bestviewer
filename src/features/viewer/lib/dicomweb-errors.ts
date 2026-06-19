import type { DicomWebLoadError } from "@horalix/dicom-engine";

export function formatDicomWebError(error: DicomWebLoadError): string {
  switch (error.reason) {
    case "network":
      return `Network error: ${error.message}`;
    case "http":
      return `DICOMweb returned ${error.status}: ${error.message}`;
    case "invalid_metadata":
      return `Invalid DICOM metadata: ${error.message}`;
    case "missing_sop_instance_uid":
      return `Metadata item ${error.index + 1} is missing SOP Instance UID`;
  }
}

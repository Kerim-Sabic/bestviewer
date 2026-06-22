"""Build a standards-compliant DICOM SEG from the viewer's labelmap and STOW it
to Orthanc. The SEG references the source series and is stamped with algorithm
provenance — AI-generated, clinician-editable (SaMD). Masks arrive RLE-encoded
per segment per frame; we decode them into a label volume aligned to the source
frames and let highdicom assemble the SEG.
"""

from __future__ import annotations

import io

import highdicom as hd
import numpy as np
import requests
from pydicom.sr.codedict import codes
from pydicom.sr.coding import Code
from pydicom.uid import generate_uid

from contract import SegExportRequest, SegExportResponse
from dicom_source import ORTHANC_URL, fetch_instance
from rle import decode_mask_rle

_ANATOMY = Code("91723000", "SCT", "Anatomical Structure")


def build_and_store_seg(request: SegExportRequest) -> SegExportResponse:
    sop_order: list[str] = []
    for frame in request.frames:
        if frame.sopInstanceUid not in sop_order:
            sop_order.append(frame.sopInstanceUid)

    if not sop_order:
        return SegExportResponse(status="error", message="No frames to export.")

    datasets = {
        sop: fetch_instance(
            request.studyInstanceUid, request.seriesInstanceUid, sop
        )
        for sop in sop_order
    }

    first = datasets[sop_order[0]]
    rows = int(first.Rows)
    columns = int(first.Columns)
    number_of_frames = int(getattr(first, "NumberOfFrames", 1))

    multiframe = len(sop_order) == 1 and number_of_frames > 1

    if multiframe:
        source_images = [first]
        label_volume = np.zeros((number_of_frames, rows, columns), dtype=np.uint8)
        for frame in request.frames:
            plane = label_volume[frame.frameIndex]
            _apply_masks(plane, frame, request)
    else:
        source_images = [datasets[sop] for sop in sop_order]
        planes: list[np.ndarray] = []
        for sop in sop_order:
            plane = np.zeros((rows, columns), dtype=np.uint8)
            for frame in request.frames:
                if frame.sopInstanceUid == sop:
                    _apply_masks(plane, frame, request)
            planes.append(plane)
        label_volume = np.stack(planes, axis=0)

    if not label_volume.any():
        return SegExportResponse(status="error", message="All segments were empty.")

    algorithm = hd.AlgorithmIdentificationSequence(
        name="Horalix-AI",
        family=codes.DCM.ArtificialIntelligence,
        version="0.2.0",
    )

    segment_descriptions = [
        hd.seg.SegmentDescription(
            segment_number=segment.index,
            segment_label=segment.label,
            segmented_property_category=_ANATOMY,
            segmented_property_type=_ANATOMY,
            algorithm_type=hd.seg.SegmentAlgorithmTypeValues.AUTOMATIC,
            algorithm_identification=algorithm,
        )
        for segment in sorted(request.segments, key=lambda item: item.index)
    ]

    segmentation = hd.seg.Segmentation(
        source_images=source_images,
        pixel_array=label_volume,
        segmentation_type=hd.seg.SegmentationTypeValues.BINARY,
        segment_descriptions=segment_descriptions,
        series_instance_uid=generate_uid(),
        series_number=99,
        sop_instance_uid=generate_uid(),
        instance_number=1,
        manufacturer="Horalix",
        manufacturer_model_name="Horalix Viewer",
        software_versions="0.2.0",
        device_serial_number="horalix-seg",
        series_description="Horalix AI segmentation (research use only)",
        omit_empty_frames=True,
    )

    stored = _stow(segmentation)
    if not stored:
        return SegExportResponse(
            status="error", message="SEG built but Orthanc rejected the STOW."
        )

    return SegExportResponse(
        status="ok",
        message=f"DICOM SEG stored to Orthanc ({len(segment_descriptions)} segment(s)).",
        segSopInstanceUid=segmentation.SOPInstanceUID,
        studyInstanceUid=request.studyInstanceUid,
    )


def _apply_masks(plane: np.ndarray, frame, request: SegExportRequest) -> None:
    for mask in frame.masks:
        decoded = decode_mask_rle(mask.runLengths, frame.width, frame.height)
        if decoded.shape != plane.shape:
            # Resize-safe: only write the overlapping region.
            rows = min(decoded.shape[0], plane.shape[0])
            columns = min(decoded.shape[1], plane.shape[1])
            plane[:rows, :columns][decoded[:rows, :columns] > 0] = mask.segmentIndex
        else:
            plane[decoded > 0] = mask.segmentIndex


def _stow(segmentation: hd.seg.Segmentation) -> bool:
    buffer = io.BytesIO()
    segmentation.save_as(buffer)
    seg_bytes = buffer.getvalue()

    boundary = "horalixsegboundary"
    body = (
        f"--{boundary}\r\n".encode()
        + b"Content-Type: application/dicom\r\n\r\n"
        + seg_bytes
        + f"\r\n--{boundary}--\r\n".encode()
    )

    response = requests.post(
        f"{ORTHANC_URL}/dicom-web/studies",
        data=body,
        headers={
            "Content-Type": f'multipart/related; type="application/dicom"; boundary={boundary}',
            "Accept": "application/dicom+json",
        },
        timeout=60,
    )
    return response.status_code in (200, 202)

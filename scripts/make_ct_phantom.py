"""Generate a SYNTHETIC CT volume phantom and push it to Orthanc.

This is a clearly-labeled test fixture (PatientID HORALIX-CT-PHANTOM) used only to
exercise the volume/MPR rendering path — it is NOT clinical data. Produces N
axial slices with consistent geometry (shared FrameOfReferenceUID, incremental
ImagePositionPatient) so Cornerstone can reconstruct a volume.
"""

from __future__ import annotations

import io

import numpy as np
import pydicom
import requests
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian, generate_uid

ORTHANC = "http://localhost:8042"
N, ROWS, COLS = 48, 128, 128
SPACING = [2.0, 2.0]
THICKNESS = 3.0
INTERCEPT = -1024.0

study = generate_uid()
series = generate_uid()
frame_of_reference = generate_uid()

# Phantom: air background, soft-tissue cylinder, a bright "bone" sphere and a
# smaller off-center "lesion" so all three MPR planes show structure.
zz, yy, xx = np.mgrid[0:N, 0:ROWS, 0:COLS]
cz, cy, cx = N / 2, ROWS / 2, COLS / 2
vol = np.full((N, ROWS, COLS), -1000.0, dtype=np.float32)
cylinder = (yy - cy) ** 2 + (xx - cx) ** 2 < (COLS * 0.4) ** 2
vol[cylinder] = 40.0
sphere = np.sqrt(((zz - cz) * 1.5) ** 2 + (yy - cy) ** 2 + (xx - cx) ** 2) < 28
vol[sphere] = 600.0
lesion = np.sqrt(((zz - cz) * 1.5) ** 2 + (yy - cy - 25) ** 2 + (xx - cx - 20) ** 2) < 10
vol[lesion] = 220.0

stored = np.clip(vol - INTERCEPT, 0, 4095).astype(np.uint16)

ok = 0
for index in range(N):
    ds = Dataset()
    ds.file_meta = FileMetaDataset()
    sop = generate_uid()
    ds.file_meta.MediaStorageSOPClassUID = CTImageStorage
    ds.file_meta.MediaStorageSOPInstanceUID = sop
    ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds.SOPClassUID = CTImageStorage
    ds.SOPInstanceUID = sop
    ds.StudyInstanceUID = study
    ds.SeriesInstanceUID = series
    ds.FrameOfReferenceUID = frame_of_reference
    ds.Modality = "CT"
    ds.PatientName = "PHANTOM^Synthetic"
    ds.PatientID = "HORALIX-CT-PHANTOM"
    ds.StudyDescription = "Synthetic CT phantom (MPR test, not clinical)"
    ds.SeriesDescription = "Axial phantom"
    ds.StudyID = "1"
    ds.SeriesNumber = "1"
    ds.InstanceNumber = str(index + 1)
    ds.ImageType = ["DERIVED", "SECONDARY", "AXIAL"]

    ds.Rows = ROWS
    ds.Columns = COLS
    ds.PixelSpacing = SPACING
    ds.SliceThickness = THICKNESS
    ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    z = index * THICKNESS
    ds.ImagePositionPatient = [-COLS * SPACING[1] / 2, -ROWS * SPACING[0] / 2, z]
    ds.SliceLocation = z

    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.RescaleIntercept = INTERCEPT
    ds.RescaleSlope = 1.0
    ds.WindowCenter = 40
    ds.WindowWidth = 400
    ds.PixelData = stored[index].tobytes()

    buffer = io.BytesIO()
    ds.save_as(buffer, enforce_file_format=True)
    response = requests.post(
        f"{ORTHANC}/instances",
        data=buffer.getvalue(),
        headers={"content-type": "application/dicom"},
        timeout=30,
    )
    if response.status_code == 200:
        ok += 1

print("study", study)
print("series", series)
print("uploaded", ok, "of", N)

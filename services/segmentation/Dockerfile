# On-prem GPU segmentation service.
#
# CUDA 12.8 base so the torch cu128 wheels run on Blackwell / RTX 50-series
# (sm_120). For older GPUs you may pin an earlier CUDA base + torch index.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    SAM2_BUILD_CUDA=0

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip git curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# torch first (CUDA 12.8 wheels), then the SAM2 code, then the rest.
RUN pip3 install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu128
RUN pip3 install --no-cache-dir "git+https://github.com/facebookresearch/sam2.git"

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

# Download weights at build time (or mount a volume at /app/weights at runtime).
RUN python3 download_weights.py || true

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# Pull frames from the cluster's Orthanc; override at runtime.
ENV ORTHANC_URL=http://orthanc:8042

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

# On-prem GPU segmentation service.
# Pin the CUDA base image to match the torch build you install for the model
# backend. The default below targets CUDA 12.1; change it to fit your hardware.
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Install the model backend + copy weights here when you wire load_backend().

COPY app.py .

EXPOSE 8000

# Readiness/liveness for the orchestrator.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DEFAULT_TIMEOUT=120

# Thư viện hệ thống tối thiểu cho OpenCV Headless & PyTorch trên Debian Bookworm/Trixie
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && (apt-get install -y --no-install-recommends libglib2.0-0t64 || apt-get install -y --no-install-recommends libglib2.0-0) \
    && rm -rf /var/lib/apt/lists/*

# Cài trước bản PyTorch CPU ở layer riêng để cache lâu dài (~180MB thay vì ~3.5GB gói NVIDIA CUDA)
RUN pip install --no-cache-dir --retries 5 --index-url https://download.pytorch.org/whl/cpu "torch>=2.2.0" "torchvision>=0.17.0"

COPY requirements.txt .

ENV KERAS_BACKEND=torch

RUN pip install --no-cache-dir --retries 5 -r requirements.txt \
   ` && python -c "import cv2, torch, torchvision, keras; print('Verified ML stack:', cv2.__version__, torch.__version__, keras.__version__)"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

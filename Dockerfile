FROM python:3.11-slim

# force rebuild v3
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    poppler-utils \
    libpoppler-cpp-dev \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install -r requirements.txt
COPY . .

ENV PORT=8000
CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements-minimal.txt .
RUN pip install --no-cache-dir -r requirements-minimal.txt

COPY backend/app ./app
COPY backend/demo-silo ./demo-silo
COPY backend/config.yaml ./config.yaml
COPY backend/silos-demo.json ./silos.json

RUN mkdir -p cache

EXPOSE 8000

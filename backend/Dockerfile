FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (minimal)
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python packages (minimal for Railway)
COPY backend/requirements-minimal.txt .
RUN pip install --no-cache-dir -r requirements-minimal.txt

# Copy only necessary backend files
COPY backend/app ./app
COPY backend/demo-silo ./demo-silo
COPY backend/config.yaml ./config.yaml
COPY backend/silos-demo.json ./silos.json

# Create cache directory
RUN mkdir -p cache

# Expose port
EXPOSE 8000

# Start the server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

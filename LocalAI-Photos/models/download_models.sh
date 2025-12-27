#!/usr/bin/env bash
set -euo pipefail
mkdir -p models
cd models

# CLIP ViT-B-32 via open_clip cache
if [ ! -f clip-ViT-B-32-laion2b_s34b_b79k.pt ]; then
  echo "Downloading CLIP ViT-B-32 (laion2b_s34b_b79k)"
  wget -q https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/pytorch_model.bin -O clip-ViT-B-32-laion2b_s34b_b79k.pt || true
fi

# YOLOv8n
if [ ! -f yolov8n.pt ]; then
  echo "Downloading YOLOv8n"
  wget -q https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt -O yolov8n.pt || true
fi

# DeepFace Facenet512 weights (cached name)
if [ ! -f facenet512_weights.h5 ]; then
  echo "Downloading Facenet512"
  wget -q https://github.com/serengil/deepface_models/releases/download/v1.0/facenet512_weights.h5 -O facenet512_weights.h5 || true
fi

# RetinaFace weights
if [ ! -f retinaface_resnet50.pth ]; then
  echo "Downloading RetinaFace ResNet50"
  wget -q https://github.com/serengil/deepface_models/releases/download/v1.0/retinaface_resnet50.pth -O retinaface_resnet50.pth || true
fi

echo "Downloads attempted. If any failed, re-run with internet available."

import os
from functools import lru_cache
from typing import Tuple

import torch
import open_clip
from deepface import DeepFace
from ultralytics import YOLO
import easyocr

DEVICE = "cuda" if torch.cuda.is_available() and os.environ.get("PAI_USE_GPU", "0") == "1" else "cpu"
MODEL_DIR = os.environ.get("PAI_MODEL_DIR", None)


def _maybe_model_path(filename: str):
    if MODEL_DIR:
        candidate = os.path.join(MODEL_DIR, filename)
        if os.path.exists(candidate):
            return candidate
    return None


@lru_cache(maxsize=1)
def load_clip_model():
    model_name = os.environ.get("PAI_CLIP_MODEL", "ViT-B-32")
    pretrained = os.environ.get("PAI_CLIP_PRETRAINED", "laion2b_s34b_b79k")
    local_path = _maybe_model_path("clip-ViT-B-32-laion2b_s34b_b79k.pt")
    if local_path:
        model, _, preprocess = open_clip.create_model_and_transforms(model_name, pretrained=local_path, device=DEVICE)
    else:
        model, _, preprocess = open_clip.create_model_and_transforms(model_name, pretrained=pretrained, device=DEVICE)
    tokenizer = open_clip.get_tokenizer(model_name)
    model.eval()
    return model, preprocess, tokenizer


@lru_cache(maxsize=1)
def load_face_model():
    backend = os.environ.get("PAI_FACE_DETECTOR", "retinaface")
    model_name = os.environ.get("PAI_FACE_MODEL", "Facenet512")
    # DeepFace handles caching internally and will use local files if present in ~/.deepface or MODEL_DIR
    if MODEL_DIR:
        os.environ.setdefault("DEEPFACE_HOME", os.path.abspath(MODEL_DIR))
    model = DeepFace.build_model(model_name)
    return model, backend


@lru_cache(maxsize=1)
def load_yolo_model():
    model_file = _maybe_model_path("yolov8n.pt") or os.environ.get("PAI_YOLO_MODEL", "yolov8n.pt")
    model = YOLO(model_file, task="detect")
    if DEVICE == "cuda":
        model.to("cuda")
    return model


@lru_cache(maxsize=1)
def load_ocr_reader():
    langs = os.environ.get("PAI_OCR_LANGS", "en").split(",")
    reader = easyocr.Reader(langs, gpu=(DEVICE == "cuda"))
    return reader


__all__ = [
    "load_clip_model",
    "load_face_model",
    "load_yolo_model",
    "load_ocr_reader",
]

import os
from functools import lru_cache
from typing import Optional
import json

import numpy as np

try:
    import open_clip
    import torch
    from PIL import Image
    from sentence_transformers import SentenceTransformer
    PYTORCH_AVAILABLE = True
except ImportError:
    PYTORCH_AVAILABLE = False
    open_clip = None
    torch = None
    Image = None
    SentenceTransformer = None

CLIP_MODEL_NAME = os.environ.get("PAI_CLIP_MODEL", "ViT-B-32")
CLIP_PRETRAINED = os.environ.get("PAI_CLIP_PRETRAINED", "laion2b_s34b_b79k")
SBERT_MODEL_NAME = os.environ.get("PAI_SBERT_MODEL", "all-MiniLM-L6-v2")
HF_API_TOKEN = os.environ.get("HF_API_TOKEN")

if PYTORCH_AVAILABLE:
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
else:
    DEVICE = "cpu"


@lru_cache(maxsize=1)
def get_clip_components():
    """Load CLIP model + preprocessors once."""
    if not PYTORCH_AVAILABLE:
        print("[CLIP] PyTorch not available - using remote inference")
        return None, None, None
    try:
        model, _, preprocess = open_clip.create_model_and_transforms(
            CLIP_MODEL_NAME, pretrained=CLIP_PRETRAINED, device=DEVICE
        )
        tokenizer = open_clip.get_tokenizer(CLIP_MODEL_NAME)
        model.eval()
        return model, preprocess, tokenizer
    except Exception as e:
        print(f"[CLIP] Failed to load model (possibly OOM): {e}")
        return None, None, None


@lru_cache(maxsize=1)
def get_sbert_model():
    if not PYTORCH_AVAILABLE:
        return None
    model = SentenceTransformer(SBERT_MODEL_NAME, device=DEVICE)
    model.eval()
    return model


def _normalize_numpy(vec: np.ndarray) -> np.ndarray:
    """Normalize vector using numpy."""
    norm = np.linalg.norm(vec)
    if norm == 0:
        return vec
    return vec / norm


def _normalize(vec) -> np.ndarray:
    """Normalize vector - works with both torch and numpy."""
    if PYTORCH_AVAILABLE and torch is not None and isinstance(vec, torch.Tensor):
        return vec / (vec.norm(dim=-1, keepdim=True) + 1e-12)
    else:
        return _normalize_numpy(vec)


def get_clip_text_embedding_remote(text: str) -> Optional[list[float]]:
    """Encode text using Hugging Face Inference API (free tier)."""
    import requests
    
    API_URL = "https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32"
    headers = {}
    if HF_API_TOKEN:
        headers["Authorization"] = f"Bearer {HF_API_TOKEN}"
    
    payload = {"inputs": text}
    
    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=10)
        response.raise_for_status()
        
        embedding = response.json()
        
        embedding_array = np.array(embedding, dtype=np.float32)
        normalized = _normalize_numpy(embedding_array)
        return normalized.tolist()
    except Exception as e:
        print(f"[CLIP] Remote inference failed: {e}")
        return None


def get_clip_text_embedding(text: str) -> Optional[list[float]]:
    """Encode text with CLIP text encoder for image-text similarity."""
    if not text.strip():
        return None
    
    model, _, tokenizer = get_clip_components()
    if model is not None and PYTORCH_AVAILABLE:
        tokens = tokenizer([text])
        with torch.no_grad():
            feats = model.encode_text(tokens.to(DEVICE))
            feats = _normalize(feats)
        return feats[0].float().cpu().numpy().tolist()
    
    print("[CLIP] Using remote inference for text encoding")
    return get_clip_text_embedding_remote(text)


def get_clip_image_embedding(path: str) -> Optional[list[float]]:
    """Encode an image with CLIP image encoder."""
    if not PYTORCH_AVAILABLE:
        print("[CLIP] Image encoding not available without PyTorch")
        return None
    try:
        img = Image.open(path).convert("RGB")
    except Exception:
        return None
    model, preprocess, _ = get_clip_components()
    if model is None:
        return None
    with torch.no_grad():
        tensor = preprocess(img).unsqueeze(0).to(DEVICE)
        feats = model.encode_image(tensor)
        feats = _normalize(feats)
    return feats[0].float().cpu().numpy().tolist()


def get_sbert_embedding(text: str) -> Optional[list[float]]:
    """Encode text with SBERT for semantic text similarity (objects/OCR/metadata)."""
    if not PYTORCH_AVAILABLE:
        return None
    if not text.strip():
        return None
    model = get_sbert_model()
    if model is None:
        return None
    with torch.no_grad():
        vec = model.encode(text, convert_to_numpy=True, normalize_embeddings=True)
    return vec.astype(np.float32).tolist()


def get_text_embedding(text: str) -> Optional[list[float]]:
    return get_clip_text_embedding(text)


def get_image_embedding(path: str) -> Optional[list[float]]:
    return get_clip_image_embedding(path)


__all__ = [
    "get_clip_text_embedding",
    "get_clip_image_embedding",
    "get_sbert_embedding",
    "get_clip_components",
    "get_text_embedding",
    "get_image_embedding",
]

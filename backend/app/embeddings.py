import os
from functools import lru_cache
from typing import Optional

import numpy as np
import open_clip
import torch
from PIL import Image
from sentence_transformers import SentenceTransformer

# Model choices are environment overridable to stay local-first while allowing swaps.
CLIP_MODEL_NAME = os.environ.get("PAI_CLIP_MODEL", "ViT-B-32")
CLIP_PRETRAINED = os.environ.get("PAI_CLIP_PRETRAINED", "laion2b_s34b_b79k")
SBERT_MODEL_NAME = os.environ.get("PAI_SBERT_MODEL", "all-MiniLM-L6-v2")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


@lru_cache(maxsize=1)
def get_clip_components():
    """Load CLIP model + preprocessors once."""
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
def get_sbert_model() -> SentenceTransformer:
    model = SentenceTransformer(SBERT_MODEL_NAME, device=DEVICE)
    model.eval()
    return model


def _normalize(vec: torch.Tensor) -> torch.Tensor:
    return vec / (vec.norm(dim=-1, keepdim=True) + 1e-12)


def get_clip_text_embedding(text: str) -> Optional[list[float]]:
    """Encode text with CLIP text encoder for image-text similarity."""
    if not text.strip():
        return None
    model, _, tokenizer = get_clip_components()
    if model is None:
        print("[CLIP] Model not available, cannot encode text")
        return None
    tokens = tokenizer([text])
    with torch.no_grad():
        feats = model.encode_text(tokens.to(DEVICE))
        feats = _normalize(feats)
    return feats[0].float().cpu().numpy().tolist()


def get_clip_image_embedding(path: str) -> Optional[list[float]]:
    """Encode an image with CLIP image encoder."""
    try:
        img = Image.open(path).convert("RGB")
    except Exception:
        return None
    model, preprocess, _ = get_clip_components()
    with torch.no_grad():
        tensor = preprocess(img).unsqueeze(0).to(DEVICE)
        feats = model.encode_image(tensor)
        feats = _normalize(feats)
    return feats[0].float().cpu().numpy().tolist()


def get_sbert_embedding(text: str) -> Optional[list[float]]:
    """Encode text with SBERT for semantic text similarity (objects/OCR/metadata)."""
    if not text.strip():
        return None
    model = get_sbert_model()
    with torch.no_grad():
        vec = model.encode(text, convert_to_numpy=True, normalize_embeddings=True)
    return vec.astype(np.float32).tolist()


# Backward-compatible helpers
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

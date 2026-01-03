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
    """
    Encode text using Hugging Face Inference API.
    Requires HF_API_TOKEN environment variable for authentication.
    """
    import requests
    
    if not HF_API_TOKEN:
        print("[CLIP] HF_API_TOKEN not set, cannot use remote inference")
        return None
    
    API_URL = "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/clip-ViT-B-32-multilingual-v1"
    headers = {"Authorization": f"Bearer {HF_API_TOKEN}"}
    payload = {
        "inputs": text,
        "options": {"wait_for_model": True}
    }
    
    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        
        # Response format: list of floats
        if isinstance(result, list) and len(result) > 0:
            if isinstance(result[0], list):
                embedding_array = np.array(result[0], dtype=np.float32)
            else:
                embedding_array = np.array(result, dtype=np.float32)
            
            # Normalize to match CLIP format
            normalized = _normalize_numpy(embedding_array)
            return normalized.tolist()
        
        print(f"[CLIP] Unexpected response format: {type(result)}")
        return None
        
    except Exception as e:
        print(f"[CLIP] Remote inference failed: {e}")
        return None


def get_clip_text_embedding_fallback(text: str) -> list[float]:
    """
    Generate a simple embedding for demo mode when ML models are unavailable.
    Uses basic word hashing to create consistent 512-dim vectors.
    This allows demo search to work without requiring API keys or PyTorch.
    """
    import hashlib
    
    text = text.lower().strip()
    words = text.split()
    
    embedding = np.zeros(512, dtype=np.float32)
    
    for word in words:
        word_hash = int(hashlib.md5(word.encode()).hexdigest(), 16)
        
        for i in range(8):
            idx = (word_hash + i * 7919) % 512
            weight = ((word_hash >> (i * 4)) & 0xF) / 15.0
            embedding[idx] += weight
    
    text_hash = int(hashlib.md5(text.encode()).hexdigest(), 16)
    for i in range(0, 512, 64):
        embedding[i] += (text_hash % 100) / 100.0
        text_hash = text_hash // 100
    
    normalized = _normalize_numpy(embedding)
    return normalized.tolist()


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
    
    if HF_API_TOKEN:
        print("[CLIP] Using remote inference for text encoding")
        result = get_clip_text_embedding_remote(text)
        if result is not None:
            return result
    
    print("[CLIP] Using fallback embedding generation (demo mode)")
    return get_clip_text_embedding_fallback(text)

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

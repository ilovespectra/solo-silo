import os
import faiss
import numpy as np
from typing import List, Tuple, Optional

# Base cache directory - will be overridden by silo-specific paths
BASE_CACHE_DIR = os.environ.get("PAI_INDEX_DIR", "./cache")


def get_index_paths(silo_name: Optional[str] = None) -> Tuple[str, str]:
    """Get silo-specific paths for FAISS index and ID map.
    
    Args:
        silo_name: The silo name. If None, uses default cache directory.
        
    Returns:
        Tuple of (index_path, id_map_path)
    """
    if silo_name:
        # Silo-specific paths
        silo_cache_dir = os.path.join(BASE_CACHE_DIR, "silos", silo_name)
        index_path = os.path.join(silo_cache_dir, "faiss.index")
        id_map_path = os.path.join(silo_cache_dir, "faiss_ids.npy")
    else:
        # Default paths (for backwards compatibility)
        index_path = os.path.join(BASE_CACHE_DIR, "faiss.index")
        id_map_path = os.path.join(BASE_CACHE_DIR, "faiss_ids.npy")
    
    return index_path, id_map_path


def ensure_dir(silo_name: Optional[str] = None):
    """Ensure cache directory exists for FAISS index and ID map."""
    if silo_name:
        silo_cache_dir = os.path.join(BASE_CACHE_DIR, "silos", silo_name)
    else:
        silo_cache_dir = BASE_CACHE_DIR
    os.makedirs(silo_cache_dir, exist_ok=True)


# Ensure default directory exists when module is loaded
try:
    ensure_dir()
except Exception as e:
    print(f"[WARNING] Failed to create index directory {BASE_CACHE_DIR}: {e}")


def save_index(index: faiss.IndexFlatIP, ids: List[int], silo_name: Optional[str] = None):
    """Save FAISS index and ID map to silo-specific location."""
    ensure_dir(silo_name)
    index_path, id_map_path = get_index_paths(silo_name)
    faiss.write_index(index, index_path)
    np.save(id_map_path, np.array(ids, dtype=np.int64))


def load_index(dim: int, silo_name: Optional[str] = None) -> Tuple[faiss.IndexFlatIP, List[int]]:
    """Load FAISS index from silo-specific location."""
    ensure_dir(silo_name)
    index_path, id_map_path = get_index_paths(silo_name)
    if os.path.exists(index_path) and os.path.exists(id_map_path):
        index = faiss.read_index(index_path)
        ids = np.load(id_map_path).tolist()
        return index, ids
    index = faiss.IndexFlatIP(dim)
    return index, []


def build_index(embeddings: List[List[float]], ids: List[int], silo_name: Optional[str] = None) -> faiss.IndexFlatIP:
    """Build and save FAISS index for a silo."""
    if not embeddings:
        return faiss.IndexFlatIP(1)
    dim = len(embeddings[0])
    index = faiss.IndexFlatIP(dim)
    xb = np.array(embeddings, dtype="float32")
    faiss.normalize_L2(xb)
    index.add(xb)
    save_index(index, ids, silo_name)
    return index


def search(index: faiss.IndexFlatIP, ids: List[int], query: List[float], top_k: int = 20):
    """Search the FAISS index."""
    if index.ntotal == 0:
        return []
    q = np.array([query], dtype="float32")
    faiss.normalize_L2(q)
    scores, idxs = index.search(q, top_k)
    results = []
    for s, idx in zip(scores[0].tolist(), idxs[0].tolist()):
        if idx < len(ids):
            results.append((ids[idx], s))
    return results


__all__ = ["load_index", "build_index", "search", "save_index"]

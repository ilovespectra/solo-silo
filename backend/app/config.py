import os
import yaml
from typing import List

def get_cache_dir():
    """Get cache directory for the active silo."""
    try:
        from .silo_manager import SiloManager
        return SiloManager.get_silo_cache_dir()
    except:
        return "./cache"

DEFAULT_CONFIG = {
    "storage": {
        "media_paths": ["./media"],
        "thumbnail_path": os.path.join(get_cache_dir(), "thumbnails"),
    },
    "processing": {
        "batch_size": 32,
        "workers": 4,
        "skip_videos": False,
    },
}

CONFIG_PATH = os.environ.get("PAI_CONFIG", "./config.yaml")


def load_config() -> dict:
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
            return deep_merge(DEFAULT_CONFIG, data)
    return DEFAULT_CONFIG


def deep_merge(base: dict, override: dict) -> dict:
    result = {**base}
    for k, v in override.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def ensure_paths(cfg: dict) -> None:
    # Use silo-specific cache directory
    try:
        from .silo_manager import SiloManager
        cache_dir = SiloManager.get_silo_cache_dir()
    except:
        cache_dir = "./cache"
    
    thumbnail_path = os.path.join(cache_dir, "thumbnails")
    os.makedirs(thumbnail_path, exist_ok=True)
    
    for p in cfg["storage"]["media_paths"]:
        os.makedirs(p, exist_ok=True)


__all__ = ["load_config", "ensure_paths", "DEFAULT_CONFIG"]

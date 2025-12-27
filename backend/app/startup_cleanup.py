"""
Startup cleanup module for the backend.
Clears old logs and cache on application start.
"""

import os
import shutil
import logging
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)


def cleanup_old_logs():
    """Remove old log files from backend root."""
    log_files = [
        'backend.log',
        'backend_run.log',
        'face_detection_service.log',
        'backend_fixed.log',
    ]
    
    backend_root = Path(__file__).parent.parent
    
    for log_file in log_files:
        log_path = backend_root / log_file
        if log_path.exists():
            try:
                log_path.unlink()
                print(f"[STARTUP] Removed old log: {log_file}")
            except Exception as e:
                print(f"[STARTUP] Failed to remove {log_file}: {e}")


def cleanup_thumbnail_cache():
    """Clear thumbnail cache to save space."""
    thumb_dir = Path(__file__).parent / 'cache' / 'thumbnails'
    
    if thumb_dir.exists():
        try:
            # Remove all thumbnails but keep directory
            for thumb_file in thumb_dir.glob('*'):
                if thumb_file.is_file():
                    thumb_file.unlink()
            print(f"[STARTUP] Cleared thumbnail cache")
        except Exception as e:
            print(f"[STARTUP] Failed to clear thumbnail cache: {e}")


def cleanup_python_cache():
    """Remove Python __pycache__ directories."""
    backend_root = Path(__file__).parent.parent
    
    removed_count = 0
    for pycache_dir in backend_root.rglob('__pycache__'):
        try:
            shutil.rmtree(pycache_dir)
            removed_count += 1
        except Exception as e:
            print(f"[STARTUP] Failed to remove {pycache_dir}: {e}")
    
    if removed_count > 0:
        print(f"[STARTUP] Removed {removed_count} __pycache__ directories")


def startup_cleanup():
    """Run all cleanup operations on app startup."""
    print("\n" + "="*60)
    print("[STARTUP] Running cleanup operations...")
    print("="*60)
    
    cleanup_old_logs()
    cleanup_thumbnail_cache()
    cleanup_python_cache()
    
    print("[STARTUP] Cleanup complete! Fresh session starting.")
    print("="*60 + "\n")

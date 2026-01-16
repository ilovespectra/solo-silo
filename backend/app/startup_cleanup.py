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
    """Clear thumbnail cache to save space - per silo."""
    # CRITICAL: Clean up per-silo caches, not global cache
    try:
        from .silo_manager import SiloManager
        # Clean active silo's thumbnail cache
        try:
            cache_dir = SiloManager.get_silo_cache_dir()
            thumb_dir = Path(cache_dir) / 'thumbnails'
            
            if thumb_dir.exists():
                for thumb_file in thumb_dir.glob('*'):
                    if thumb_file.is_file():
                        thumb_file.unlink()
                print(f"[STARTUP] Cleared thumbnail cache for active silo")
        except Exception as e:
            print(f"[STARTUP] Failed to clear silo thumbnail cache: {e}")
    except Exception as e:
        print(f"[STARTUP] Could not access SiloManager: {e}")


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


def regenerate_cluster_cache_if_missing():
    """Regenerate cluster cache if missing or corrupted."""
    try:
        from .face_cluster import load_cluster_cache, load_faces_from_db, cluster_faces, save_cluster_cache
        from .db import get_db
        
        # Try to load existing cache
        existing_clusters = load_cluster_cache()
        
        if existing_clusters:
            # Check for duplicates
            cluster_ids = [c.get('id') for c in existing_clusters]
            if len(cluster_ids) != len(set(cluster_ids)):
                print(f"[STARTUP] WARNING: Found {len(set(cluster_ids))} unique cluster IDs out of {len(cluster_ids)} total")
                print(f"[STARTUP] Cache is corrupted with duplicate IDs - regenerating...")
                existing_clusters = None
        
        if not existing_clusters:
            print(f"[STARTUP] No cluster cache found - generating fresh clusters from database...")
            
            # Load all faces from database
            faces = load_faces_from_db()
            print(f"[STARTUP] Loaded {len(faces)} faces from database")
            
            if faces:
                # Cluster them
                clusters = cluster_faces(faces)
                print(f"[STARTUP] Generated {len(clusters)} clusters")
                
                # Save to cache
                save_cluster_cache(clusters)
                print(f"[STARTUP] Saved clusters to cache")
            else:
                print(f"[STARTUP] No faces in database - skipping cluster generation")
        else:
            print(f"[STARTUP] Cluster cache exists with {len(existing_clusters)} clusters (no duplicates detected)")
    except Exception as e:
        print(f"[STARTUP] WARNING: Failed to regenerate cluster cache: {e}")
        import traceback
        traceback.print_exc()


def startup_cleanup():
    """Run all cleanup operations on app startup."""
    print("\n" + "="*60)
    print("[STARTUP] Running cleanup operations...")
    print("="*60)
    
    cleanup_old_logs()
    cleanup_thumbnail_cache()
    cleanup_python_cache()
    regenerate_cluster_cache_if_missing()
    
    print("[STARTUP] Cleanup complete! Fresh session starting.")
    print("="*60 + "\n")

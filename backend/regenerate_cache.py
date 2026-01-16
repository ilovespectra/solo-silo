#!/usr/bin/env python3
"""Regenerate cluster cache - useful for fixing corrupted caches."""

import sys
import os

# Add backend to path
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

# Now import
from app.face_cluster import load_cluster_cache, load_faces_from_db, cluster_faces, save_cluster_cache

print("[Regenerate] Checking cluster cache...")
existing_clusters = load_cluster_cache()

if not existing_clusters:
    print("[Regenerate] No cluster cache found - generating fresh clusters...")
    faces = load_faces_from_db()
    print(f"[Regenerate] Loaded {len(faces)} faces from database")
    
    if faces:
        clusters = cluster_faces(faces)
        print(f"[Regenerate] Generated {len(clusters)} clusters")
        save_cluster_cache(clusters)
        print(f"[Regenerate] Saved clusters to cache")
else:
    print(f"[Regenerate] Found {len(existing_clusters)} existing clusters")
    # Check for duplicates
    cluster_ids = [c.get('id') for c in existing_clusters]
    unique_ids = set(cluster_ids)
    print(f"[Regenerate] Unique IDs: {len(unique_ids)}, Total: {len(cluster_ids)}")
    
    if len(unique_ids) != len(cluster_ids):
        print(f"[Regenerate] Found duplicate cluster IDs - regenerating...")
        faces = load_faces_from_db()
        print(f"[Regenerate] Loaded {len(faces)} faces from database")
        clusters = cluster_faces(faces)
        print(f"[Regenerate] Generated {len(clusters)} clusters")
        save_cluster_cache(clusters)
        print(f"[Regenerate] Saved regenerated clusters to cache")
        
        # Verify no duplicates
        cluster_ids_new = [c.get('id') for c in clusters]
        unique_ids_new = set(cluster_ids_new)
        print(f"[Regenerate] Verification: {len(unique_ids_new)} unique IDs out of {len(cluster_ids_new)} total")

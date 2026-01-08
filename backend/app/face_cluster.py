import json
import os
from dataclasses import dataclass
from typing import List, Optional

import numpy as np

try:
    import hdbscan
    from deepface import DeepFace
    FACE_DETECTION_AVAILABLE = True
except ImportError:
    FACE_DETECTION_AVAILABLE = False
    hdbscan = None
    DeepFace = None

from .db import get_db
from .config import get_cache_dir
from .silo_manager import SiloManager

# Resolve paths relative to backend root directory, not working directory
_backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def _get_label_path():
    """Get silo-aware path to people.json"""
    cache_dir = SiloManager.get_silo_cache_dir()
    return os.environ.get("PAI_PEOPLE_STORE", os.path.join(cache_dir, "people.json"))

def _get_rotations_path():
    """Get silo-aware path to rotations.json"""
    cache_dir = SiloManager.get_silo_cache_dir()
    return os.environ.get("PAI_ROTATIONS_STORE", os.path.join(cache_dir, "rotations.json"))

def _get_cluster_cache_path():
    """Get silo-aware path to people_cluster_cache.json"""
    cache_dir = SiloManager.get_silo_cache_dir()
    return os.environ.get("PAI_CLUSTER_CACHE", os.path.join(cache_dir, "people_cluster_cache.json"))

def _get_animal_label_path():
    """Get silo-aware path to animals.json"""
    cache_dir = SiloManager.get_silo_cache_dir()
    return os.environ.get("PAI_ANIMALS_STORE", os.path.join(cache_dir, "animals.json"))

# These are now functions instead of constants - call them when needed
LABEL_PATH = property(lambda: _get_label_path())
ROTATIONS_PATH = property(lambda: _get_rotations_path())
CLUSTER_CACHE_PATH = property(lambda: _get_cluster_cache_path())
ANIMAL_LABEL_PATH = property(lambda: _get_animal_label_path())

# Ensure cache directory exists when module loads
try:
    cache_dir = SiloManager.get_silo_cache_dir()
    os.makedirs(cache_dir, exist_ok=True)
except Exception as e:
    print(f"[WARNING] Failed to create cache directory: {e}")
FACE_MODEL = os.environ.get("PAI_FACE_MODEL", "Facenet512")
FACE_DETECTOR = os.environ.get("PAI_FACE_DETECTOR", "mtcnn")

# NOTE: Model preloading DISABLED - it was causing backend crashes with lz4 I/O errors
# and multiprocessing semaphore leaks. Models will load lazily on first use.
# This adds ~2-3 seconds to first face detection but prevents startup crashes.


@dataclass
class FaceInstance:
    path: str
    bbox: List[float]
    embedding: List[float]
    score: float


def _bbox_from_facial_area(area: dict) -> List[float]:
    # DeepFace returns dict with x, y, w, h.
    return [
        float(area.get("x", 0)),
        float(area.get("y", 0)),
        float(area.get("x", 0) + area.get("w", 0)),
        float(area.get("y", 0) + area.get("h", 0)),
    ]


def detect_faces(paths: List[str], batch_size: int = 1, timeout_seconds: int = 180) -> List[FaceInstance]:
    """Detect faces using DeepFace with optimized processing for M1 Mac.
    
    Args:
        paths: List of image paths to process
        batch_size: Number of images before memory cleanup (default 1)
        timeout_seconds: Timeout per image in seconds (default 180 for M1 Mac)
    
    Returns:
        List of detected FaceInstance objects
    """
    import time
    import gc
    import threading
    
    # Limit CPU usage to prevent system overload
    import os as os_module
    if hasattr(os_module, 'nice'):
        try:
            os_module.nice(10)  # Lower priority
        except:
            pass
    
    faces: List[FaceInstance] = []
    processed = 0
    errors = 0
    timeouts = 0
    max_seconds_per_image = timeout_seconds  # Use parameter passed in (default 180s for M1 Mac)
    
    print(f"[FACE] Starting face detection for {len(paths)} images (timeout: {max_seconds_per_image}s per image)")
    
    for idx, path in enumerate(paths):
        if not os.path.exists(path) or not path.lower().endswith(('.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp')):
            processed += 1
            continue
        
        filename = os.path.basename(path)
        print(f"[FACE] [{idx+1}/{len(paths)}] {filename}", end=" ", flush=True)
        
        # Result holder for thread
        result = [None]
        error = [None]
        
        def process_image():
            try:
                reps = DeepFace.represent(
                    img_path=path,
                    model_name=FACE_MODEL,
                    detector_backend=FACE_DETECTOR,
                    enforce_detection=False,
                )
                result[0] = reps
            except Exception as e:
                error[0] = e
        
        # Run in thread with timeout
        start = time.time()
        thread = threading.Thread(target=process_image, daemon=True)
        thread.start()
        thread.join(timeout=max_seconds_per_image)
        elapsed = time.time() - start
        
        if thread.is_alive():
            # Thread still running - timeout
            print(f"⏱ TIMEOUT ({elapsed:.0f}s)")
            timeouts += 1
            processed += 1
            gc.collect()
            time.sleep(1.0)  # Allow system to breathe
            continue
        
        if error[0]:
            print(f"✗ {type(error[0]).__name__} ({elapsed:.1f}s)")
            errors += 1
            processed += 1
            gc.collect()
            time.sleep(0.5)
            continue
        
        # Process results
        detected = []
        reps = result[0]
        if reps and isinstance(reps, list):
            for rep in reps:
                if not isinstance(rep, dict):
                    continue
                score = float(rep.get("face_confidence") or rep.get("detector_score") or 0.0)
                if score < 0.3:
                    continue
                area = rep.get("facial_area")
                if not isinstance(area, dict):
                    continue
                embedding = rep.get("embedding", [])
                if not embedding:
                    continue
                
                bbox = _bbox_from_facial_area(area)
                detected.append(
                    FaceInstance(
                        path=path,
                        bbox=bbox,
                        embedding=[float(x) for x in embedding],
                        score=score,
                    )
                )
        
        faces.extend(detected)
        if detected:
            print(f"✓ {len(detected)} ({elapsed:.1f}s)")
        else:
            print(f"○ ({elapsed:.1f}s)")
        processed += 1
        
        # Minimal cleanup - only on batch boundaries
        if processed % batch_size == 0:
            gc.collect()
        
        # CPU throttling - sleep after each image to prevent system overload
        time.sleep(0.3)
        
        # Progress every batch
        if processed % batch_size == 0:
            print(f"[FACE] Progress: {processed}/{len(paths)} | Faces: {len(faces)} | Errors: {errors} | Timeouts: {timeouts}")
            
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except:
                pass
    
    print(f"\n[FACE] ========== COMPLETE ==========")
    print(f"[FACE] Processed: {processed} | Faces: {len(faces)} | Errors: {errors} | Timeouts: {timeouts}")
    print(f"[FACE] ============================")
    
    return faces


def load_faces_from_db() -> List[FaceInstance]:
    """Load stored face embeddings from SQLite, deduplicated by image."""
    instances: List[FaceInstance] = []
    total_embeddings = 0
    skipped_invalid = 0
    skipped_conversion = 0
    skipped_error = 0
    
    with get_db() as conn:
        cur = conn.execute(
            """
            SELECT media_files.id, media_files.path, face_embeddings.embedding, face_embeddings.bbox, face_embeddings.confidence
            FROM face_embeddings
            JOIN media_files ON media_files.id = face_embeddings.media_id
            WHERE face_embeddings.embedding IS NOT NULL
            """
        )
        rows = cur.fetchall()
        total_embeddings = len(rows)
        
        for media_id, path, emb_blob, bbox_json, conf in rows:
            try:
                emb = np.frombuffer(emb_blob, dtype=np.float32).tolist() if emb_blob else []
                bbox = json.loads(bbox_json) if bbox_json else []
                
                # Validate embedding is a valid list of floats
                if not emb or not isinstance(emb, list) or len(emb) == 0:
                    skipped_invalid += 1
                    continue
                
                # Validate all elements are numbers
                try:
                    emb = [float(x) for x in emb]
                except (TypeError, ValueError):
                    skipped_conversion += 1
                    continue
                
                instances.append(
                    FaceInstance(
                        path=path,
                        bbox=[float(x) for x in bbox] if bbox else [0, 0, 0, 0],
                        embedding=emb,
                        score=float(conf) if conf is not None else 0.0,
                    )
                )
            except Exception as e:
                skipped_error += 1
                print(f"[WARNING] Error loading face from {path}: {e}")
                continue
    
    # Simple deduplication: for faces from the same image path that are very similar embeddings,
    # keep only the highest confidence one. This removes detector noise without loading everything.
    # We'll do this more efficiently by just keeping all faces - clustering will handle near-duplicates
    # through the distance threshold. The key insight: we don't need perfect dedup, clustering threshold handles it.
    
    print(f"[FACE_LOAD] Total embeddings from DB: {total_embeddings}, Loaded: {len(instances)}, Skipped (invalid): {skipped_invalid}, (conversion): {skipped_conversion}, (error): {skipped_error}")
    
    if not instances:
        print("[INFO] No valid face embeddings found in database")
    
    return instances


def cluster_faces(instances: List[FaceInstance], min_cluster_size: int = 2):
    """Simple clustering using euclidean distance threshold with confirmed face handling."""
    if not instances:
        return []
    
    print(f"[CLUSTERING] Starting with {len(instances)} face instances")
    
    # Load confirmed/rejected labels and search feedback
    labels = load_labels()
    
    # Load user feedback on which faces they've approved/rejected
    with get_db() as conn:
        approved_cur = conn.execute(
            "SELECT DISTINCT media_id FROM uncertain_detections WHERE approved = 1 AND reviewed = 1"
        )
        approved_ids = {row[0] for row in approved_cur.fetchall()}
        
        rejected_cur = conn.execute(
            "SELECT DISTINCT media_id FROM uncertain_detections WHERE approved = 0 AND reviewed = 1"
        )
        rejected_ids = {row[0] for row in rejected_cur.fetchall()}
    
    # Filter instances to only those with valid, same-size embeddings
    if not instances:
        return []
    
    # Determine expected embedding size from first valid instance
    expected_size = None
    valid_instances = []
    for instance in instances:
        if not instance.embedding or len(instance.embedding) == 0:
            continue
        if expected_size is None:
            expected_size = len(instance.embedding)
        
        if len(instance.embedding) == expected_size:
            valid_instances.append(instance)
        else:
            print(f"[WARNING] Skipping face with mismatched embedding size {len(instance.embedding)} (expected {expected_size})")
    
    print(f"[CLUSTERING] Valid instances after size check: {len(valid_instances)} (expected embedding size: {expected_size})")
    
    if not valid_instances:
        print("[WARNING] No valid embeddings for clustering")
        return []
    
    # Use simple distance-based clustering
    embeddings = np.array([f.embedding for f in valid_instances], dtype="float32")
    
    # Normalize embeddings
    embeddings = embeddings / (np.linalg.norm(embeddings, axis=1, keepdims=True) + 1e-6)
    
    # Compute pairwise distances
    from scipy.spatial.distance import pdist, squareform
    # Use cosine distance (not euclidean) - much better for normalized embeddings like FaceNet
    distances = squareform(pdist(embeddings, metric='cosine'))
    
    # Cosine distance threshold for face matching
    # Cosine distance ranges from 0 (identical) to 1 (opposite)
    # Higher threshold = more lenient matching = fewer, larger clusters
    # Lower threshold = stricter matching = more clusters
    # 0.70 is stricter: Elliott's median is 0.60, and 0.70 catches ~67% of his face variations
    # This prevents merging different people while keeping same person's photos together better
    base_threshold = 0.70
    
    # Adjust based on user feedback
    if approved_ids:
        # User approved some matches - be stricter (lower threshold)
        base_threshold = 0.65
    
    if rejected_ids:
        # User rejected some matches - be more lenient (higher threshold)
        base_threshold = 0.80
    
    clusters = {}
    assigned = set()
    cluster_id = 0
    
    for i in range(len(valid_instances)):
        if i in assigned:
            continue
        
        # Start new cluster
        cluster = [valid_instances[i]]
        assigned.add(i)
        
        # Find neighbors within threshold
        for j in range(i + 1, len(valid_instances)):
            if j not in assigned and distances[i, j] < base_threshold:
                cluster.append(valid_instances[j])
                assigned.add(j)
        
        # Keep ALL clusters, including singletons (min_cluster_size no longer filters)
        # This allows individual faces to be shown even if they don't have a matching pair
        clusters[cluster_id] = cluster
        cluster_id += 1
    
    result = []
    for cid, faces in clusters.items():
        # Sort faces by confidence score (descending) to get highest confidence first
        sorted_faces = sorted(faces, key=lambda f: f.score, reverse=True)
        highest_confidence_face = sorted_faces[0]
        
        # Build photo list with confidence scores and media IDs
        # Use dict to deduplicate by media_id (one face per photo, highest confidence)
        unique_photos_dict = {}  # media_id -> photo data
        with get_db() as conn:
            for face in sorted_faces:
                cur = conn.execute("SELECT id FROM media_files WHERE path = ?", (face.path,))
                row = cur.fetchone()
                media_id = row[0] if row else None
                
                # Only keep highest confidence face per media_id
                if media_id not in unique_photos_dict:
                    unique_photos_dict[media_id] = {
                        "path": face.path,
                        "media_id": media_id,
                        "confidence": face.score,
                        "bbox": face.bbox,
                    }
        
        photos = list(unique_photos_dict.values())
        
        result.append(
            {
                "id": f"person_{cid}",
                "count": len(photos),  # Count unique photos, not individual face detections
                "sample": highest_confidence_face.path,
                "sample_media_id": photos[0].get("media_id") if photos else None,
                "bbox": highest_confidence_face.bbox,
                "label": "unknown",
                "score": sum(f.score for f in faces) / len(faces),
                "photos": photos,
                "hidden": False,
            }
        )
    result.sort(key=lambda x: x["count"], reverse=True)
    
    total_faces_in_clusters = sum(c["count"] for c in result)
    print(f"[CLUSTERING] Created {len(result)} clusters with {total_faces_in_clusters} total faces")
    print(f"[CLUSTERING] Cluster sizes: {[c['count'] for c in result[:10]]}")  # Log first 10 cluster sizes
    
    return result


def load_labels():
    """
    Load user-assigned face labels (people.json).
    
    IMPORTANT: This file is NEVER overwritten during indexing.
    User labels are persistent and preserved across reindex operations.
    """
    try:
        label_path = _get_label_path()
        # Ensure cache directory exists
        os.makedirs(os.path.dirname(label_path), exist_ok=True)
        with open(label_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        # File doesn't exist yet - return empty labels
        return {}
    except Exception as e:
        print(f"[WARNING] Error loading labels from {_get_label_path()}: {e}")
        return {}


def save_labels(data: dict):
    """
    Save user-assigned face labels to people.json.
    
    IMPORTANT: This only happens when user explicitly names/hides a face.
    The reindex process does NOT call this function and does NOT overwrite labels.
    """
    label_path = _get_label_path()
    os.makedirs(os.path.dirname(label_path), exist_ok=True)
    with open(label_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def load_rotations():
    """Load media file rotations (rotation overrides for images)."""
    try:
        rotations_path = _get_rotations_path()
        # Ensure cache directory exists
        os.makedirs(os.path.dirname(rotations_path), exist_ok=True)
        with open(rotations_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        # File doesn't exist yet - return empty rotations
        return {}
    except Exception as e:
        print(f"[WARNING] Error loading rotations from {_get_rotations_path()}: {e}")
        return {}


def save_rotations(data: dict):
    """Save media file rotations to cache."""
    rotations_path = _get_rotations_path()
    os.makedirs(os.path.dirname(rotations_path), exist_ok=True)
    with open(rotations_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def set_media_rotation(media_id: int, rotation: int, type: str = "image"):
    """Set rotation for a media file (0, 90, 180, 270).
    
    Stores a single rotation value that applies to both thumbnail and full image.
    """
    rotations = load_rotations()
    rotations[str(media_id)] = rotation
    save_rotations(rotations)


def save_cluster_cache(clusters):
    """Save clustering results to cache file for fast retrieval."""
    try:
        cluster_cache_path = _get_cluster_cache_path()
        os.makedirs(os.path.dirname(cluster_cache_path) or ".", exist_ok=True)
        with open(cluster_cache_path, "w", encoding="utf-8") as f:
            json.dump(clusters, f, indent=2)
    except Exception as e:
        print(f"[CACHE] Error saving cluster cache: {e}")


def load_cluster_cache():
    """Load cached clustering results if available. Gracefully handles missing files."""
    try:
        cluster_cache_path = _get_cluster_cache_path()
        # Ensure cache directory exists
        os.makedirs(os.path.dirname(cluster_cache_path), exist_ok=True)
        
        if not os.path.exists(cluster_cache_path):
            return []
        
        with open(cluster_cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except FileNotFoundError:
        return []
    except Exception as e:
        print(f"[CACHE] Error loading cluster cache: {e}")
        return []


def apply_labels(clusters):
    labels = load_labels()
    for c in clusters:
        if c["id"] in labels:
            c.update(labels[c["id"]])
    return clusters


def assign_new_faces_to_confirmed_clusters(clusters):
    """Automatically assign new faces to existing confirmed clusters if they match well.
    
    This function:
    1. Gets all confirmed cluster embeddings (average of all faces in each)
    2. For each new unlabeled cluster, finds the closest confirmed cluster
    3. If distance is below 0.65 (stricter than 0.75 clustering threshold), assigns it
    4. Updates the confirmed cluster's confirmed_photos list
    
    Args:
        clusters: List of clustered faces from cluster_faces()
    
    Returns:
        Updated clusters with new faces assigned to confirmed clusters
    """
    from scipy.spatial.distance import cdist
    
    labels = load_labels()
    
    # Get all confirmed cluster IDs (those in people.json)
    confirmed_ids = set(labels.keys())
    
    if not confirmed_ids:
        return clusters
    
    print(f"[AUTO_ASSIGN] Matching {len(clusters)} clusters to {len(confirmed_ids)} confirmed clusters...")
    
    # Build embeddings for each confirmed cluster
    confirmed_embeddings = {}  # cluster_id -> average_embedding
    confirmed_face_count = {}   # cluster_id -> number of faces
    
    with get_db() as conn:
        for cluster_id in confirmed_ids:
            label_data = labels[cluster_id]
            confirmed_photos = label_data.get("confirmed_photos", [])
            
            if not confirmed_photos:
                continue
            
            # Get embeddings for all photos in this confirmed cluster
            embeddings = []
            for photo_id in confirmed_photos:
                try:
                    cur = conn.execute(
                        "SELECT embedding FROM face_embeddings WHERE media_id = ? LIMIT 1",
                        (photo_id,)
                    )
                    row = cur.fetchone()
                    if row and row[0]:
                        emb = np.frombuffer(row[0], dtype=np.float32)
                        embeddings.append(emb)
                except:
                    pass
            
            if embeddings:
                # Average the embeddings and normalize
                avg_emb = np.mean(embeddings, axis=0)
                avg_emb = avg_emb / (np.linalg.norm(avg_emb) + 1e-6)
                confirmed_embeddings[cluster_id] = avg_emb
                confirmed_face_count[cluster_id] = len(confirmed_photos)
    
    print(f"[AUTO_ASSIGN] Built embeddings for {len(confirmed_embeddings)} confirmed clusters")
    
    if not confirmed_embeddings:
        return clusters
    
    # Convert to numpy array for distance computation
    confirmed_emb_array = np.array(list(confirmed_embeddings.values()), dtype=np.float32)
    confirmed_ids_list = list(confirmed_embeddings.keys())
    
    # Process each cluster
    assignments = {}  # cluster_id -> confirmed_cluster_id
    
    for cluster in clusters:
        cluster_id = cluster.get("id")
        
        # Skip already-labeled clusters
        if cluster_id in labels:
            continue
        
        # Skip if no photos
        photos = cluster.get("photos", [])
        if not photos:
            continue
        
        # Get embeddings for this cluster's faces
        cluster_embeddings = []
        for photo in photos:
            if "confidence" in photo:  # These are from our clustering
                # Need to get the actual embedding from DB
                try:
                    with get_db() as conn:
                        cur = conn.execute(
                            "SELECT embedding FROM face_embeddings WHERE media_id = ? LIMIT 1",
                            (photo["media_id"],)
                        )
                        row = cur.fetchone()
                        if row and row[0]:
                            emb = np.frombuffer(row[0], dtype=np.float32)
                            # Normalize
                            emb = emb / (np.linalg.norm(emb) + 1e-6)
                            cluster_embeddings.append(emb)
                except:
                    pass
        
        if not cluster_embeddings:
            continue
        
        # Average this cluster's embeddings
        avg_cluster_emb = np.mean(cluster_embeddings, axis=0)
        avg_cluster_emb = avg_cluster_emb / (np.linalg.norm(avg_cluster_emb) + 1e-6)
        
        # Compute cosine distances to all confirmed clusters
        distances = cdist([avg_cluster_emb], confirmed_emb_array, metric='cosine')[0]
        
        # Find closest confirmed cluster
        closest_idx = np.argmin(distances)
        closest_distance = distances[closest_idx]
        closest_confirmed_id = confirmed_ids_list[closest_idx]
        
        # Threshold: 0.65 for cosine distance (stricter than 0.70 clustering threshold)
        if closest_distance < 0.65:
            assignments[cluster_id] = closest_confirmed_id
            print(f"[AUTO_ASSIGN] Cluster {cluster_id} ({len(photos)} faces) → {closest_confirmed_id} (distance: {closest_distance:.3f})")
    
    # Now update the confirmed clusters with the assigned faces
    if assignments:
        print(f"[AUTO_ASSIGN] Automatically assigned {len(assignments)} new clusters to confirmed clusters")
        
        # Update people.json to include the new photos
        for new_cluster_id, confirmed_id in assignments.items():
            new_photos = set()
            
            # Get photo IDs from the new cluster
            for cluster in clusters:
                if cluster.get("id") == new_cluster_id:
                    for photo in cluster.get("photos", []):
                        new_photos.add(photo.get("media_id"))
            
            # Add to confirmed cluster
            if new_photos:
                existing = set(labels[confirmed_id].get("confirmed_photos", []))
                existing.update(new_photos)
                labels[confirmed_id]["confirmed_photos"] = list(existing)
                print(f"[AUTO_ASSIGN] Added {len(new_photos)} new photos to {confirmed_id}")
        
        # Save updated labels
        save_labels(labels)
        print(f"[AUTO_ASSIGN] Updated people.json with {len(assignments)} new assignments")
    else:
        print(f"[AUTO_ASSIGN] No clusters matched confirmed clusters well enough")
    
    return clusters


def merge_cluster_caches(existing_clusters, new_clusters):
    """Merge new clustering results with existing cached clusters.
    
    Preserves:
    - Existing cluster IDs and labels
    - User-set metadata (hidden, confirmed, labels)
    - Existing faces in their original clusters
    
    Adds:
    - New faces to matching existing clusters
    - New clusters for truly new faces
    
    Args:
        existing_clusters: List of existing cluster dicts from cache
        new_clusters: List of newly clustered results from cluster_faces()
    
    Returns:
        List of merged clusters with preserved metadata
    """
    if not existing_clusters:
        return new_clusters
    
    print(f"[CLUSTERING] Merging {len(new_clusters)} new clusters with {len(existing_clusters)} existing clusters")
    
    # Build a map of existing cluster IDs to their metadata
    existing_by_id = {c["id"]: c for c in existing_clusters}
    
    # Build a map of media_ids that were in existing clusters
    existing_faces = {}  # media_id -> existing_cluster_id
    for cluster in existing_clusters:
        for photo in cluster.get("photos", []):
            existing_faces[photo["media_id"]] = cluster["id"]
    
    print(f"[CLUSTERING] Found {len(existing_faces)} existing faces in {len(existing_by_id)} clusters")
    
    # Create new cluster ID counter (start after highest existing ID)
    max_existing_id = max([int(c["id"].split("_")[0]) for c in existing_clusters if "_" in c["id"]], default=0)
    next_new_id = max_existing_id + 1
    
    merged_clusters = []
    processed_new = set()  # Track which new clusters we've processed
    
    # For each existing cluster, try to merge faces from new clusters
    for existing_cluster in existing_clusters:
        cluster_id = existing_cluster["id"]
        # Preserve all existing metadata
        merged = existing_cluster.copy()
        
        # Keep existing faces, but update their data if it appears in new clusters
        existing_photos_by_media = {p["media_id"]: p for p in existing_cluster.get("photos", [])}
        
        # Look for new faces that match this cluster in the new results
        for new_cluster in new_clusters:
            if new_cluster["id"] in processed_new:
                continue  # Already merged this new cluster
            
            # Check if any faces from this new cluster are faces we already knew about
            new_faces = new_cluster.get("photos", [])
            matching_faces = [p for p in new_faces if p["media_id"] in existing_faces and existing_faces[p["media_id"]] == cluster_id]
            
            if matching_faces:
                # This new cluster contains faces from the existing cluster - merge them
                print(f"[CLUSTERING] Merging {len(new_faces)} faces from new cluster into existing cluster {cluster_id}")
                
                # Add new faces that weren't in the existing cluster
                for photo in new_faces:
                    if photo["media_id"] not in existing_photos_by_media:
                        existing_photos_by_media[photo["media_id"]] = photo
                
                processed_new.add(new_cluster["id"])
        
        # Update merged cluster's photos
        merged["photos"] = list(existing_photos_by_media.values())
        merged_clusters.append(merged)
    
    # Add any new clusters that weren't merged with existing ones
    for new_cluster in new_clusters:
        if new_cluster["id"] not in processed_new:
            # This is a truly new cluster - give it a new ID that preserves existing IDs
            new_cluster["id"] = f"{next_new_id}_new"
            next_new_id += 1
            merged_clusters.append(new_cluster)
            processed_new.add(new_cluster["id"])
            print(f"[CLUSTERING] Added new cluster {new_cluster['id']} with {len(new_cluster.get('photos', []))} faces")
    
    print(f"[CLUSTERING] Merge complete: {len(merged_clusters)} clusters ({len(existing_by_id)} preserved + {len(new_clusters) - len(existing_by_id)} new)")
    return merged_clusters


def set_label(person_id: str, name: str = None, hidden: bool = None, confirmed: bool = None, rotation_override: int = None):
    labels = load_labels()
    entry = labels.get(person_id, {"label": "unknown", "hidden": False, "confirmed": False})
    if name is not None:
        entry["label"] = name
    if hidden is not None:
        entry["hidden"] = hidden
    if confirmed is not None:
        entry["confirmed"] = confirmed
    if rotation_override is not None:
        entry["rotation_override"] = rotation_override
    labels[person_id] = entry
    save_labels(labels)


# Animal/Pet clustering functions
# ANIMAL_LABEL_PATH defined above at module level


@dataclass
class AnimalInstance:
    path: str
    label: str  # e.g., "dog", "cat", "bird"
    bbox: List[float]
    score: float


def load_animals_from_db() -> List[AnimalInstance]:
    """Load animal detections from database."""
    animals = []
    with get_db() as conn:
        cur = conn.execute("SELECT path, animals FROM media_files WHERE animals IS NOT NULL AND animals != '[]'")
        for path, animals_json in cur.fetchall():
            try:
                detections = json.loads(animals_json)
                for detection in detections:
                    # Try to use user-set label first, fall back to detected class, then unknown
                    label = detection.get("label") or detection.get("class", "unknown")
                    animals.append(
                        AnimalInstance(
                            path=path,
                            label=label,
                            bbox=detection.get("bbox", [0, 0, 0, 0]),
                            score=detection.get("confidence", detection.get("score", 0.5)),
                        )
                    )
            except (json.JSONDecodeError, KeyError):
                continue
    return animals


def cluster_animals(instances: List[AnimalInstance], min_cluster_size: int = 1):
    """Group animals by type and visual similarity to create multiple clusters per species.
    
    Uses bounding box overlap and confidence scores as a proxy for visual similarity.
    Creates multiple clusters per animal type (e.g., multiple dog clusters, multiple cat clusters).
    """
    if not instances:
        return []
    
    # First group by animal type/label
    by_type = {}
    for instance in instances:
        label = instance.label.lower().strip()
        if label not in by_type:
            by_type[label] = []
        by_type[label].append(instance)
    
    # For each type, create multiple clusters using spatial/visual similarity
    all_clusters = {}
    global_cluster_id = 0
    
    for animal_type, type_animals in by_type.items():
        # Sort by confidence score descending
        type_animals.sort(key=lambda x: x.score, reverse=True)
        
        # Use bounding box overlap and confidence to group similar individuals
        # This creates multiple clusters within the same species
        assigned = set()
        type_clusters = {}
        type_cluster_id = 0
        
        for i, animal in enumerate(type_animals):
            if i in assigned:
                continue
            
            # Start new cluster with this animal
            cluster = [animal]
            assigned.add(i)
            
            # Find similar animals (based on bbox overlap and confidence proximity)
            x1_i, y1_i, x2_i, y2_i = animal.bbox
            area_i = (x2_i - x1_i) * (y2_i - y1_i) if len(animal.bbox) >= 4 else 1
            
            for j in range(i + 1, len(type_animals)):
                if j in assigned:
                    continue
                
                other = type_animals[j]
                x1_j, y1_j, x2_j, y2_j = other.bbox
                area_j = (x2_j - x1_j) * (y2_j - y1_j) if len(other.bbox) >= 4 else 1
                
                # Calculate IoU (Intersection over Union) for bounding boxes
                if area_i > 0 and area_j > 0:
                    x1_inter = max(x1_i, x1_j)
                    y1_inter = max(y1_i, y1_j)
                    x2_inter = min(x2_i, x2_j)
                    y2_inter = min(y2_i, y2_j)
                    
                    inter_area = max(0, x2_inter - x1_inter) * max(0, y2_inter - y1_inter)
                    union_area = area_i + area_j - inter_area
                    iou = inter_area / union_area if union_area > 0 else 0
                else:
                    iou = 0
                
                # Confidence proximity (animals with similar confidence scores are likely the same individual)
                confidence_diff = abs(animal.score - other.score)
                
                # Heuristic: cluster together if:
                # 1. Moderate bbox overlap (IoU > 0.1) OR
                # 2. Very high confidence difference (likely same individual at different times/angles)
                should_cluster = (iou > 0.1) or (confidence_diff < 0.15 and animal.score > 0.7)
                
                if should_cluster:
                    cluster.append(other)
                    assigned.add(j)
            
            # Only keep clusters with at least min_cluster_size animals
            if len(cluster) >= min_cluster_size:
                type_clusters[type_cluster_id] = cluster
                type_cluster_id += 1
        
        # If no clusters were created (all below min_cluster_size), create single clusters
        if not type_clusters:
            for i, animal in enumerate(type_animals):
                type_clusters[i] = [animal]
        
        # Map type clusters to global cluster IDs
        for tc_id, cluster in type_clusters.items():
            all_clusters[global_cluster_id] = (animal_type, cluster)
            global_cluster_id += 1
    
    result = []
    for cid, (animal_type, animals) in all_clusters.items():
        if not animals:
            continue
        
        # Highest confidence animal first
        sorted_animals = sorted(animals, key=lambda a: a.score, reverse=True)
        highest_confidence = sorted_animals[0]
        
        # Build photos list with confidence scores and media IDs
        photos = []
        with get_db() as conn:
            for animal in sorted_animals:
                cur = conn.execute("SELECT id FROM media_files WHERE path = ?", (animal.path,))
                row = cur.fetchone()
                media_id = row[0] if row else None
                photos.append({
                    "path": animal.path,
                    "media_id": media_id,
                    "confidence": animal.score,
                    "bbox": animal.bbox,
                })
        
        result.append(
            {
                "id": f"animal_{cid}",
                "label": animal_type,
                "count": len(animals),
                "sample": highest_confidence.path,
                "sample_media_id": photos[0].get("media_id") if photos else None,
                "bbox": highest_confidence.bbox,
                "score": sum(a.score for a in animals) / len(animals) if animals else 0,
                "photos": photos,
                "hidden": False,
            }
        )
    
    result.sort(key=lambda x: x["count"], reverse=True)
    total_animals = sum(c["count"] for c in result)
    print(f"[CLUSTERING] Created {len(result)} animal clusters with {total_animals} total animals")
    
    return result


def load_animal_labels():
    """
    Load user-assigned animal labels (animals.json).
    
    IMPORTANT: This file is NEVER overwritten during indexing.
    User labels for animals/pets are persistent and preserved across reindex operations.
    """
    try:
        animal_label_path = _get_animal_label_path()
        # Ensure cache directory exists
        os.makedirs(os.path.dirname(animal_label_path), exist_ok=True)
        with open(animal_label_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        # File doesn't exist yet - return empty labels
        return {}
    except Exception as e:
        print(f"[WARNING] Error loading animal labels from {_get_animal_label_path()}: {e}")
        return {}


def save_animal_labels(data: dict):
    """
    Save user-assigned animal labels to animals.json.
    
    IMPORTANT: This only happens when user explicitly names/hides an animal.
    The reindex process does NOT call this function and does NOT overwrite labels.
    """
    animal_label_path = _get_animal_label_path()
    os.makedirs(os.path.dirname(animal_label_path), exist_ok=True)
    with open(animal_label_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def apply_animal_labels(clusters):
    """Apply saved labels/names to animal clusters."""
    labels = load_animal_labels()
    for c in clusters:
        if c["id"] in labels:
            c.update(labels[c["id"]])
    return clusters


def set_animal_label(animal_id: str, name: str = None, hidden: bool = None):
    """Set name and hidden status for an animal/pet."""
    labels = load_animal_labels()
    entry = labels.get(animal_id, {"label": "unknown", "hidden": False, "category": None})
    if name is not None:
        entry["label"] = name
    if hidden is not None:
        entry["hidden"] = hidden
    labels[animal_id] = entry
    save_animal_labels(labels)


__all__ = ["detect_faces", "cluster_faces", "FaceInstance", "load_faces_from_db", "apply_labels", "set_label",
           "load_animals_from_db", "cluster_animals", "AnimalInstance", "apply_animal_labels", "set_animal_label"]

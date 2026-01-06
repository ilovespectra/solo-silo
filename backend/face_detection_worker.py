#!/usr/bin/env python3
"""
Robust face detection worker with crash recovery and memory management.
Runs as a subprocess to isolate face detection from async backend.
"""
import sys
import os
import json
import gc
import sqlite3
import psutil
import traceback
import time
import signal
import threading
from pathlib import Path
from datetime import datetime

# Force unbuffered output for real-time logging
os.environ['PYTHONUNBUFFERED'] = '1'

# Set database path to backend cache directory before importing
# BUT: if PAI_DB is already set by parent process (for silo support), respect it!
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if "PAI_DB" not in os.environ:
    os.environ["PAI_DB"] = os.path.join(root_dir, "backend", "cache", "personalai.db")
if "PAI_CLUSTER_CACHE" not in os.environ:
    os.environ["PAI_CLUSTER_CACHE"] = os.path.join(root_dir, "backend", "cache", "people_cluster_cache.json")

# Setup persistent logging - USE SILO-SPECIFIC CACHE IF AVAILABLE
log_dir = os.environ.get("PAI_CLUSTER_CACHE")
if log_dir:
    # Extract the cache directory from cluster cache path (parent dir)
    log_dir = os.path.dirname(log_dir)
else:
    # Fallback to global cache
    log_dir = os.path.join(root_dir, "cache")
os.makedirs(log_dir, exist_ok=True)

worker_log = os.path.join(log_dir, "worker.log")
crash_log = os.path.join(log_dir, "worker-crashes.log")
skipped_log = os.path.join(log_dir, "skipped-images.txt")
progress_file = os.path.join(log_dir, "detection-progress.json")

def log_worker(msg):
    """Log to worker.log for UI consumption."""
    with open(worker_log, "a") as f:
        f.write(msg + "\n")
    print(msg, flush=True)

def log_crash(msg):
    """Log crashes to persistent file with timestamp."""
    timestamp = datetime.now().isoformat()
    with open(crash_log, "a") as f:
        f.write(f"[{timestamp}] {msg}\n")
    print(f"[CRASH] {msg}", flush=True)

def log_skipped(img_path, reason):
    """Log skipped images."""
    with open(skipped_log, "a") as f:
        f.write(f"{img_path} - {reason}\n")
    print(f"[SKIPPED] {img_path}: {reason}", flush=True)

def log_progress(processed, total, faces_found, current_file=""):
    """Save progress checkpoint."""
    try:
        with open(progress_file, "w") as f:
            json.dump({
                "processed": processed,
                "total": total,
                "faces_found": faces_found,
                "current_file": current_file,
                "timestamp": datetime.now().isoformat()
            }, f)
    except Exception as e:
        log_crash(f"Failed to save progress: {e}")

def get_memory_usage():
    """Get current memory usage in MB."""
    try:
        process = psutil.Process(os.getpid())
        return process.memory_info().rss / 1024 / 1024
    except:
        return 0

def handle_signal(signum, frame):
    """Handle crash signals."""
    log_crash(f"Received signal {signum} - dumping state and exiting")
    import traceback
    log_crash("Stack trace at crash:")
    log_crash(traceback.format_stack())
    sys.exit(1)

# Register signal handlers for crash diagnostics
signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)

try:
    log_worker("=== Worker starting ===")
    log_worker(f"[SYSTEM] Python: {sys.version}")
    log_worker(f"[SYSTEM] Process ID: {os.getpid()}")
    log_worker(f"[SYSTEM] Working directory: {os.getcwd()}")
    log_worker(f"[SYSTEM] Memory available: {psutil.virtual_memory().available / 1024 / 1024:.0f}MB")
    log_worker(f"[SYSTEM] CPU count: {psutil.cpu_count()}")
    
    # Add app directory to path
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, backend_dir)
    log_worker(f"[SYSTEM] Backend dir: {backend_dir}")
    log_worker(f"[SYSTEM] Database: {os.environ.get('PAI_DB', 'NOT SET')}")

    # Import from app directory directly
    log_worker("Importing dependencies...")
    from app.db import get_db, init_db
    from app.face_cluster import detect_faces, load_faces_from_db, cluster_faces, apply_labels, save_cluster_cache, load_cluster_cache, merge_cluster_caches
    from app.indexer import store_face_embeddings
    log_worker("Imports successful")

except Exception as e:
    log_crash(f"Import error: {e}")
    import traceback
    log_crash(traceback.format_exc())
    sys.exit(1)

def mark_image_processed(media_id):
    """Mark image as processed in database."""
    try:
        with get_db() as conn:
            conn.execute(
                "UPDATE media_files SET face_detection_attempted = 1 WHERE id = ?",
                (media_id,)
            )
            conn.commit()
    except Exception as e:
        log_crash(f"Failed to mark image processed: {e}")

def rebuild_clustering_cache():
    """Rebuild the face clustering cache for live propagation to People tab."""
    try:
        log_worker("[CLUSTERING] Starting cache rebuild...")
        start_time = time.time()
        
        # Load all faces from database
        faces = load_faces_from_db()
        log_worker(f"[CLUSTERING] Loaded {len(faces)} faces from database")
        
        if not faces:
            log_worker("[CLUSTERING] No faces to cluster, skipping cache rebuild")
            return
        
        # Run clustering on all faces
        clusters = cluster_faces(faces)
        log_worker(f"[CLUSTERING] Created {len(clusters)} clusters from all faces")
        
        # Apply labels to new clusters
        clusters = apply_labels(clusters)
        log_worker(f"[CLUSTERING] Applied labels to clusters")
        
        # Load existing cache and merge with new results
        existing_clusters = load_cluster_cache()
        if existing_clusters:
            log_worker(f"[CLUSTERING] Found existing cache with {len(existing_clusters)} clusters, merging...")
            clusters = merge_cluster_caches(existing_clusters, clusters)
        
        # Save merged clusters to cache file for live propagation to People tab
        save_cluster_cache(clusters)
        log_worker(f"[CLUSTERING] Saved {len(clusters)} clusters to cache")
        
        elapsed = time.time() - start_time
        log_worker(f"[CLUSTERING] Cache rebuild complete in {elapsed:.2f}s - clusters now available for live propagation")
        
    except Exception as e:
        log_worker(f"[CLUSTERING] Error during cache rebuild: {e}")
        import traceback
        log_worker(f"[CLUSTERING] Traceback: {traceback.format_exc()}")

def detect_faces_with_timeout(img_path, timeout_seconds=30):
    """Detect faces with timeout protection using daemon thread."""
    result = [None]
    exception = [None]
    
    def run_detection():
        try:
            result[0] = detect_faces([img_path], batch_size=1)
        except Exception as e:
            exception[0] = e
    
    # Use daemon=True so thread doesn't block process exit on timeout
    thread = threading.Thread(target=run_detection, daemon=True)
    thread.start()
    thread.join(timeout=timeout_seconds)
    
    if thread.is_alive():
        # Timeout occurred - thread is still running
        log_worker(f"[TIMEOUT] face detection exceeded {timeout_seconds}s for {os.path.basename(img_path)}")
        log_worker(f"[TIMEOUT] Skipping image and continuing with next file")
        # Note: daemon thread will be killed when process exits, but we continue with next image
        raise TimeoutError(f"face detection timeout after {timeout_seconds} seconds")
    
    if exception[0]:
        raise exception[0]
    
    return result[0]

def detect_faces_worker():
    """Run face detection with crash recovery and memory management."""
    try:
        log_worker("Initializing database...")
        # Initialize database if needed
        init_db()
        log_worker("Database initialized")
        
        total_faces_detected = 0
        processed_count = 0
        skipped_count = 0
        RESTART_THRESHOLD = 5  # Auto-restart after processing 5 files to avoid memory/hang issues
        TIMEOUT_SECONDS = 120  # M1 Mac timeout: 120s to handle large images with slow deepface
        last_failed_file = None  # Track consecutive failures
        
        # Get total count of eligible files in database
        log_worker("Querying database for file counts...")
        with get_db() as conn:
            # Total eligible files (still images only)
            total_cur = conn.execute(
                """SELECT COUNT(*) FROM media_files 
                   WHERE type IN ('.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp')"""
            )
            total_eligible_files = total_cur.fetchone()[0] or 0
            
            # Already processed files
            processed_cur = conn.execute(
                """SELECT COUNT(*) FROM media_files 
                   WHERE face_detection_attempted = 1
                   AND type IN ('.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp')"""
            )
            already_processed = processed_cur.fetchone()[0] or 0
            
            # Already found faces from previously processed files
            faces_cur = conn.execute(
                """SELECT COUNT(*) FROM face_embeddings 
                   WHERE embedding IS NOT NULL"""
            )
            already_found_faces = faces_cur.fetchone()[0] or 0
            
            # Get unprocessed files for this batch
            unprocessed_cur = conn.execute(
                """SELECT id, path FROM media_files 
                   WHERE face_detection_attempted = 0
                   AND type IN ('.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp')
                   ORDER BY id"""
            )
            unprocessed = unprocessed_cur.fetchall()
        
        remaining_to_process = len(unprocessed)
        log_worker(f"Database stats:")
        log_worker(f"  - Total eligible files: {total_eligible_files}")
        log_worker(f"  - Already processed: {already_processed}")
        log_worker(f"  - Already found faces: {already_found_faces}")
        log_worker(f"  - Remaining to process: {remaining_to_process}")
        
        if remaining_to_process == 0:
            log_worker("No files to process!")
            log_progress(already_processed, total_eligible_files, already_found_faces)
            print(json.dumps({"status": "complete", "faces_found": already_found_faces, "processed": already_processed, "total": total_eligible_files}))
            return
        
        log_progress(already_processed, total_eligible_files, already_found_faces)
        
        # Process each image one at a time with strict batch_size=1
        for media_id, img_path in unprocessed:
            try:
                # Memory check: if memory usage > 600MB, force cleanup (lowered from 800MB)
                mem_usage = get_memory_usage()
                if mem_usage > 600:
                    log_worker(f"Memory high ({mem_usage:.0f}MB), forcing cleanup...")
                    gc.collect()
                    time.sleep(0.5)
                
                # Update progress checkpoint (cumulative from database + current batch)
                cumulative_processed = already_processed + processed_count
                cumulative_faces = already_found_faces + total_faces_detected
                current_filename = os.path.basename(img_path)
                log_progress(cumulative_processed, total_eligible_files, cumulative_faces, current_filename)
                
                print(f"[{cumulative_processed}/{total_eligible_files}] {current_filename}...", end=" ", flush=True)
                
                # Check if file still exists
                if not os.path.exists(img_path):
                    log_skipped(img_path, "File not found")
                    skipped_count += 1
                    processed_count += 1
                    print("✗ Not found", flush=True)
                    mark_image_processed(media_id)
                    last_failed_file = None
                    continue
                
                # Detect faces for this single image with timeout protection
                try:
                    log_worker(f"[FACE_DETECT_START] Processing {current_filename}")
                    log_worker(f"  - Image path: {img_path}")
                    log_worker(f"  - File size: {os.path.getsize(img_path) if os.path.exists(img_path) else 'N/A'} bytes")
                    log_worker(f"  - Memory before: {get_memory_usage():.1f}MB available / {psutil.virtual_memory().available / 1024 / 1024:.0f}MB")
                    
                    # Use timeout-protected detection
                    all_faces = detect_faces_with_timeout(img_path, timeout_seconds=TIMEOUT_SECONDS)
                    
                    log_worker(f"[FACE_DETECT_SUCCESS] Found {len(all_faces)} face(s)")
                    print(f"✓ {len(all_faces)} faces", flush=True)
                    last_failed_file = None  # Reset on success
                    
                except (TimeoutError, Exception) as detect_error:
                    # Check if this is same file failing twice in a row
                    error_type = "TIMEOUT" if isinstance(detect_error, TimeoutError) else type(detect_error).__name__
                    error_msg = str(detect_error)[:100]
                    
                    if last_failed_file == img_path:
                        # Same file failed twice - skip it
                        log_skipped(img_path, f"Consecutive failure ({error_type}): {error_msg}")
                        log_worker(f"[SKIP_CONSECUTIVE] Skipping {current_filename} - failed twice in a row")
                        skipped_count += 1
                        processed_count += 1
                        print(f"✗ SKIP (consecutive fail)", flush=True)
                        mark_image_processed(media_id)
                        last_failed_file = None
                        continue
                    else:
                        # First failure - log and trigger restart after this batch
                        log_worker(f"[FACE_DETECT_ERROR] {error_type}: {error_msg}")
                        if isinstance(detect_error, TimeoutError):
                            # Timeout - exit to restart fresh
                            log_worker(f"[TIMEOUT_EXIT] File {current_filename} exceeded {TIMEOUT_SECONDS}s, restarting worker")
                            mark_image_processed(media_id)
                            processed_count += 1
                            # Save progress and exit to restart
                            cumulative_processed = already_processed + processed_count
                            cumulative_faces = already_found_faces + total_faces_detected
                            log_progress(cumulative_processed, total_eligible_files, cumulative_faces, current_filename)
                            print(json.dumps({
                                "status": "restarting",
                                "reason": "timeout",
                                "processed": cumulative_processed,
                                "faces_found": cumulative_faces
                            }), flush=True)
                            sys.exit(0)
                        else:
                            # Other error - skip this file and mark for retry
                            last_failed_file = img_path
                            log_skipped(img_path, f"Detection failed ({error_type}): {error_msg}")
                            skipped_count += 1
                            processed_count += 1
                            print(f"✗ SKIP", flush=True)
                            mark_image_processed(media_id)
                            continue
                
                # Store embeddings if faces found
                if all_faces and len(all_faces) > 0:
                    try:
                        log_worker(f"[STORE_EMBEDDINGS_START] Storing {len(all_faces)} face(s) for media_id {media_id}")
                        with get_db() as conn:
                            log_worker(f"[DB_CONNECTED] Database connection established")
                            store_face_embeddings(
                                conn,
                                media_id,
                                [
                                    {
                                        "embedding": f.embedding,
                                        "bbox": f.bbox,
                                        "score": f.score,
                                    }
                                    for f in all_faces
                                ],
                            )
                            log_worker(f"[DB_COMMIT] Committing changes to database")
                            conn.commit()
                        log_worker(f"[STORE_EMBEDDINGS_SUCCESS] Embeddings stored successfully")
                    except Exception as store_error:
                        log_worker(f"[STORE_EMBEDDINGS_ERROR] {type(store_error).__name__}: {str(store_error)}")
                        log_worker(f"[STORE_EMBEDDINGS_TRACEBACK] {traceback.format_exc()}")
                        raise
                    
                    face_count = len([f for f in all_faces if f.embedding])
                    total_faces_detected += face_count
                else:
                    face_count = 0
                
                processed_count += 1
                
                # Log with face count (using cumulative)
                cumulative_processed = already_processed + processed_count
                cumulative_faces = already_found_faces + total_faces_detected
                log_worker(f"[IMAGE_COMPLETE] {current_filename}: {face_count} face(s) found • Total: {cumulative_faces} faces in {cumulative_processed} images")
                log_progress(cumulative_processed, total_eligible_files, cumulative_faces, current_filename)
                
                if face_count > 0:
                    print(f"✓ {face_count} face(s) [Total: {cumulative_faces}]", flush=True)
                else:
                    print(f"✓ No faces [Total: {cumulative_faces}]", flush=True)
                
                # Mark as processed
                mark_image_processed(media_id)
                
                # Explicit memory cleanup after each image
                gc.collect()
                time.sleep(0.1)  # Small delay to prevent overheating
                
                # Memory cleanup + clustering cache rebuild after processing RESTART_THRESHOLD files
                if processed_count >= RESTART_THRESHOLD:
                    cumulative_processed = already_processed + processed_count
                    cumulative_faces = already_found_faces + total_faces_detected
                    
                    # Rebuild clustering cache for live propagation
                    log_worker(f"[MEMORY_CLEANUP] Rebuilding clustering cache with newly detected faces...")
                    rebuild_clustering_cache()
                    
                    log_worker(f"[MEMORY_CLEANUP] Processed {processed_count} files (cumulative: {cumulative_processed}/{total_eligible_files}), performing memory cleanup...")
                    log_progress(cumulative_processed, total_eligible_files, cumulative_faces, current_filename)
                    print(json.dumps({
                        "status": "memory_cleanup",
                        "reason": "Memory cleanup + clustering cache rebuild",
                        "processed": processed_count,
                        "faces_found": total_faces_detected
                    }), flush=True)
                    
                    # Reset counter and continue processing (don't exit)
                    processed_count = 0
                    total_faces_detected = 0
                    gc.collect()
                    time.sleep(0.5)  # Brief pause for memory cleanup
                
            except Exception as img_error:
                error_msg = str(img_error)[:100]
                print(f"✗ Unexpected error: {error_msg}", flush=True)
                log_crash(f"Error processing {img_path}: {str(img_error)}\n{traceback.format_exc()}")
                
                # Try to mark as processed to avoid infinite loops
                try:
                    mark_image_processed(media_id)
                    processed_count += 1
                except:
                    pass
        
        # Final status with cluster information
        cumulative_final = already_processed + processed_count
        cumulative_faces_final = already_found_faces + total_faces_detected
        log_worker(f"✓ face detection complete")
        log_worker(f"  - Processed: {cumulative_final}/{total_eligible_files} images")
        log_worker(f"  - Faces found: {cumulative_faces_final}")
        log_worker(f"  - Skipped: {skipped_count} images")
        
        # Rebuild clustering cache on completion for live propagation
        log_worker(f"[CLUSTERING] Final cache rebuild for complete dataset...")
        rebuild_clustering_cache()
        
        # Get cluster information
        try:
            with get_db() as conn:
                # Count unique person clusters
                cluster_cur = conn.execute("SELECT COUNT(DISTINCT label) FROM face_clusters WHERE label IS NOT NULL")
                named_clusters = cluster_cur.fetchone()[0] or 0
                
                # Count total face embeddings in database
                face_cur = conn.execute("SELECT COUNT(*) FROM face_embeddings")
                total_embeddings = face_cur.fetchone()[0] or 0
                
                log_worker(f"  - Named clusters: {named_clusters} (labeled people)")
                log_worker(f"  - Total face embeddings in database: {total_embeddings}")
        except Exception as e:
            log_worker(f"  - Could not fetch cluster stats: {e}")
        
        cumulative_final = already_processed + processed_count
        cumulative_faces_final = already_found_faces + total_faces_detected
        log_progress(cumulative_final, total_eligible_files, cumulative_faces_final)
        print(json.dumps({
            "status": "complete",
            "faces_found": cumulative_faces_final,
            "processed": cumulative_final,
            "total": total_eligible_files,
            "skipped": skipped_count
        }))
        
    except Exception as e:
        log_crash(f"FATAL: {str(e)}\n{traceback.format_exc()}")
        print(f"[ERROR] Fatal error in face detection: {e}", flush=True)
        print(json.dumps({"status": "error", "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    try:
        log_worker("=" * 50)
        log_worker("face detection worker starting up")
        log_worker(f"python: {sys.version}")
        log_worker(f"pid: {os.getpid()}")
        log_worker(f"database: {os.environ.get('PAI_DB', 'default')}")
        log_worker("=" * 50)
        
        detect_faces_worker()
        
        log_worker("=" * 50)
        log_worker("face detection worker exiting normally")
        log_worker("=" * 50)
        sys.exit(0)
        
    except KeyboardInterrupt:
        log_crash("worker interrupted by user")
        sys.exit(130)
    except Exception as e:
        log_crash(f"UNCAUGHT EXCEPTION: {type(e).__name__}: {str(e)}")
        log_crash(traceback.format_exc())
        print(f"FATAL ERROR: {e}", file=sys.stderr, flush=True)
        print(json.dumps({"status": "error", "error": f"{type(e).__name__}: {str(e)}"}), flush=True)
        sys.exit(1)
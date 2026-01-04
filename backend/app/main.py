import asyncio
import json
import os
import sys
import time
import gc
import glob
import subprocess
import numpy as np
from typing import List, Optional, Dict, Any
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, Query, HTTPException, Body, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .config import load_config, ensure_paths
from .db import init_db, get_db
from .indexer import full_reindex, rebuild_faiss_index_from_db, watch_directories, process_single, is_media, md5sum, extract_exif, SUPPORTED_IMAGE_TYPES, store_face_embeddings
from .embeddings import get_text_embedding, get_image_embedding
from .search_index import load_index, search, save_index
from .face_cluster import load_faces_from_db, cluster_faces, apply_labels, set_label, detect_faces, load_labels, save_labels, assign_new_faces_to_confirmed_clusters
from .user_config import get_config_manager
from .folder_service import FolderService
from .silo_manager import SiloManager
from .startup_cleanup import startup_cleanup
from . import silo_endpoints

# Demo mode helper
def check_read_only():
    """Check if system is in read-only demo mode."""
    if SiloManager.is_demo_mode():
        raise HTTPException(
            status_code=403,
            detail="Operation not allowed in demo mode. This is a read-only demo deployment."
        )

# Global lock to ensure only one indexing operation runs at a time
# Will be properly initialized in startup_event
_indexing_lock = None
_face_detection_running = False  # Simple flag for face detection
_executor = None  # Thread pool for blocking operations
_processing_paused = False  # Flag to pause/resume processing

def get_indexing_lock():
    """Get or create the indexing lock."""
    global _indexing_lock
    if _indexing_lock is None:
        _indexing_lock = asyncio.Lock()
    return _indexing_lock

def get_executor():
    """Get or create the thread pool executor."""
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=1)  # Single worker to prevent memory issues
    return _executor

app = FastAPI(title="PersonalAI Photo Manager", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include silo management router
app.include_router(silo_endpoints.router)

# Global state for retraining progress
_retraining_state = {
    "is_running": False,
    "progress": 0,
    "message": "",
    "error": None,
    "metrics": None,
    "start_time": None,
    "estimated_duration": None
}

# Per-silo indexing state - each silo has its own indexing progress
_silo_indexing_states = {}

# Track which silo is currently being processed to prevent race conditions
_currently_processing_silo = None

def _set_processing_silo(silo_name: str) -> None:
    """Explicitly set which silo is currently being processed."""
    global _currently_processing_silo
    _currently_processing_silo = silo_name
    # Also update silos.json to ensure consistency
    from .silo_manager import SiloManager
    SiloManager.switch_silo(silo_name)

def _create_indexing_state():
    """Create a fresh indexing state dict."""
    return {
        "status": "idle",
        "processed": 0,
        "total": 0,
        "current_file": None,
        "percentage": 0,
        "error": None,
        "faces_found": 0,
        "animals_found": 0,
        "phase": None,
        "message": None,
        "is_indexing": False,
    }

def _get_current_silo_name():
    """Get the currently active silo name."""
    # CRITICAL: Check processing silo FIRST, then active silo
    global _currently_processing_silo
    if _currently_processing_silo:
        return _currently_processing_silo
    
    try:
        from .silo_manager import SiloManager
        silos = SiloManager.load_silos()
        return silos.get("active_silo", "default")
    except:
        return "default"

def _get_silo_indexing_state():
    """Get indexing state for the current silo."""
    global _silo_indexing_states
    silo_name = _get_current_silo_name()
    if silo_name not in _silo_indexing_states:
        _silo_indexing_states[silo_name] = _create_indexing_state()
    return _silo_indexing_states[silo_name]

# Keep a reference to indexing_state for backwards compatibility
indexing_state = None


class MediaResponse(BaseModel):
    id: int
    path: str
    type: str
    date_taken: Optional[int]
    size: Optional[int]
    width: Optional[int]
    height: Optional[int]
    camera: Optional[str]
    lens: Optional[str]


class UncertainDetectionResponse(BaseModel):
    id: int
    media_id: int
    detection_type: str
    class_name: Optional[str]
    confidence: Optional[float]


class HidePersonRequest(BaseModel):
    hidden: bool


class NamePersonRequest(BaseModel):
    name: str


class AnimalLabelRequest(BaseModel):
    species: str
    name: Optional[str] = None
    breed: Optional[str] = None


class IndexingRequest(BaseModel):
    path: str
    recursive: bool = True
    includeContent: bool = True
    silo_name: Optional[str] = None  # CRITICAL: Silo context for multi-tenancy


class ResolveDirectoryRequest(BaseModel):
    folderName: str
    sampleFiles: list = []


# Folder API Models
class CreateFolderRequest(BaseModel):
    name: str
    parentId: Optional[int] = None
    description: str = ""


class UpdateFolderRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class AddMediaToFolderRequest(BaseModel):
    mediaIds: List[int]


class FolderResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    parentId: Optional[int]
    createdAt: int
    updatedAt: int
    mediaIds: List[int] = []


class FolderContentsResponse(BaseModel):
    folder: FolderResponse
    media: List[Dict[str, Any]]
    total: int


@app.on_event("startup")
async def startup_event():
    global _indexing_lock
    _indexing_lock = asyncio.Lock()  # Initialize the lock
    cfg = load_config()
    ensure_paths(cfg)
    
    # Initialize databases for all existing silos
    from .silo_manager import SiloManager
    from . import db
    
    silo_manager = SiloManager()
    silos_list = silo_manager.list_silos()
    
    # CRITICAL: Ensure at least one silo exists and set it as active
    if not silos_list:
        print(f"[STARTUP] No silos found, creating default silo", flush=True)
        silo_manager.create_silo("default")
        silos_list = silo_manager.list_silos()
    
    # Set the first silo as active if no active silo is set
    silos_data = SiloManager.load_silos()
    if not silos_data.get("active_silo") and silos_list:
        first_silo = silos_list[0]["name"]
        print(f"[STARTUP] Setting '{first_silo}' as active silo", flush=True)
        SiloManager.switch_silo(first_silo)
    
    for silo_info in silos_list:
        silo_name = silo_info["name"]
        try:
            # Get the db_path for this silo
            db_path = SiloManager.get_silo_db_path(silo_name)
            print(f"[STARTUP] Initializing database for silo '{silo_name}': {db_path}", flush=True)
            db.init_db(db_path)
            print(f"[STARTUP] ✓ Database initialized for silo '{silo_name}'", flush=True)
        except Exception as e:
            print(f"[STARTUP] ERROR initializing database for silo '{silo_name}': {e}", flush=True)
            import traceback
            traceback.print_exc()
    
    print(f"[STARTUP] Backend ready - active silo: {SiloManager.get_active_silo()['name']}", flush=True)
    
    # DISABLED: Do not auto-discover media paths on startup
    # This can cause silos to inherit paths from each other, breaking isolation
    # Users must explicitly configure media paths per-silo via UI
    # try:
    #     for silo_info in silo_manager.list_silos():
    #         silo_name = silo_info["name"]
    #         existing_paths = silo_manager.get_silo_media_paths(silo_name)
    #         if not existing_paths:
    #             silo_manager.discover_and_set_silo_media_paths(silo_name)
    #             print(f"[STARTUP] Discovered media paths for silo '{silo_name}'")
    # except Exception as e:
    #     print(f"[STARTUP] Warning: Could not discover media paths for silos: {e}")
    
    # Background watcher disabled - user should manually trigger indexing via UI
    # asyncio.create_task(watch_directories(process_single))


@app.get("/health")
async def health():
    return {"status": "ok", "time": int(time.time())}

@app.get("/api/system/mode")
async def get_system_mode():
    """Get current system mode (demo or full)."""
    is_demo = SiloManager.is_demo_mode()
    return {
        "demo_mode": is_demo,
        "read_only": is_demo,
        "message": "Demo mode - read only" if is_demo else "Full mode - all features enabled"
    }

@app.get("/api/system/health-extended")
async def health_extended(silo_name: str = Query(None)):
    """Extended health check including crash logs and detection status.
    
    CRITICAL SECURITY: Returns status for specific silo only to prevent data leakage.
    """
    # CRITICAL: Use silo-specific cache directory
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        cache_dir = SiloManager.get_silo_cache_dir(silo_name)
    except Exception as e:
        cache_dir = "./cache"  # Fallback for startup before silos initialized
    
    # Check for crash logs
    crash_log_path = os.path.join(cache_dir, "worker-crashes.log")
    has_crashes = os.path.exists(crash_log_path) and os.path.getsize(crash_log_path) > 0
    
    # Read recent crash if exists
    recent_crash = None
    if has_crashes:
        try:
            with open(crash_log_path, "r") as f:
                lines = f.readlines()
                if lines:
                    recent_crash = lines[-1].strip()
        except:
            pass
    
    # Check progress file
    progress_file = os.path.join(cache_dir, "detection-progress.json")
    progress = None
    if os.path.exists(progress_file):
        try:
            with open(progress_file, "r") as f:
                progress = json.load(f)
        except:
            pass
    
    return {
        "status": "ok",
        "time": int(time.time()),
        "face_detection_running": _face_detection_running,
        "has_crash_logs": has_crashes,
        "recent_crash": recent_crash,
        "progress": progress
    }


@app.get("/api/system/paths")
async def get_common_paths():
    """Get common folder paths for quick selection in file picker."""
    home = os.path.expanduser("~")
    
    common_paths = {
        "Home": home,
        "Documents": os.path.join(home, "Documents"),
        "Pictures": os.path.join(home, "Pictures"),
        "Downloads": os.path.join(home, "Downloads"),
        "Desktop": os.path.join(home, "Desktop"),
    }
    
    # Filter to only existing paths
    filtered_paths = {
        label: path for label, path in common_paths.items()
        if os.path.exists(path)
    }
    
    return {
        "commonPaths": filtered_paths
    }


@app.post("/api/system/resolve-directory")
async def resolve_directory(request: ResolveDirectoryRequest):
    """Resolve the full path of a selected directory by searching for it on the filesystem.
    
    The browser's showDirectoryPicker() API only returns the folder name, not the full path.
    This endpoint searches the filesystem to find the directory and return its full path.
    """
    folder_name = request.folderName
    sample_files = request.sampleFiles
    
    if not folder_name:
        raise HTTPException(status_code=400, detail="folderName is required")
    
    print(f"[RESOLVE] Looking for directory: {folder_name} with sample files: {sample_files}")
    
    home = os.path.expanduser("~")
    
    # Search common starting points for the directory
    search_paths = [
        home,  # Home directory
        "/Volumes",  # External drives on macOS
        "/mnt",  # Mounted drives on Linux
    ]
    
    # Also check common subdirectories
    for subdir in ["Documents", "Downloads", "Desktop", "Pictures"]:
        subpath = os.path.join(home, subdir)
        if os.path.exists(subpath):
            search_paths.append(subpath)
    
    def find_directory(search_root: str, target_name: str, sample_files: list, depth: int = 0, max_depth: int = 4):
        """Recursively search for a directory with the given name.
        
        Returns the full path if found, None otherwise.
        Matches based on directory name and optionally verifies by checking for sample files.
        """
        try:
            for entry in os.scandir(search_root):
                if entry.is_dir(follow_symlinks=False):
                    if entry.name == target_name:
                        print(f"[RESOLVE] Found matching dir: {entry.path}")
                        # Found a matching directory name
                        # Verify it has the sample files if we have them
                        if sample_files:
                            dir_contents = set()
                            try:
                                dir_contents = {f.name for f in os.scandir(entry.path) if os.path.isfile(f)}
                            except (PermissionError, OSError):
                                pass
                            
                            # Check if at least some sample files exist
                            matching_files = sum(1 for f in sample_files if f in dir_contents)
                            if matching_files >= len(sample_files) * 0.5:  # At least 50% match
                                print(f"[RESOLVE] Verified with sample files: {matching_files}/{len(sample_files)} match")
                                return entry.path
                        else:
                            # No sample files to verify, trust the name match
                            print(f"[RESOLVE] No sample files to verify, trusting name match")
                            return entry.path
                    
                    # Recurse into subdirectories (with configurable depth)
                    if depth < max_depth:
                        result = find_directory(entry.path, target_name, sample_files, depth + 1, max_depth)
                        if result:
                            return result
        except (PermissionError, OSError):
            # Skip directories we can't access
            pass
        
        return None
    
    # Search from each starting point
    for search_root in search_paths:
        print(f"[RESOLVE] Searching in: {search_root}")
        if os.path.exists(search_root):
            result = find_directory(search_root, folder_name, sample_files, depth=0, max_depth=4)
            if result:
                print(f"[RESOLVE] SUCCESS: Resolved {folder_name} to {result}")
                return {"path": result, "found": True}
    
    # If not found, return error
    print(f"[RESOLVE] FAILED: Could not find directory {folder_name}")
    raise HTTPException(
        status_code=404, 
        detail=f'Directory "{folder_name}" not found. Please ensure it exists and is accessible.'
    )


@app.get("/api/debug/worker-logs")
async def get_worker_logs(silo_name: str = Query(None)):
    """Fetch worker logs for debugging face detection issues.
    
    CRITICAL SECURITY: Returns logs for specific silo only to prevent data leakage.
    """
    # CRITICAL: Use silo-specific cache directory
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        cache_dir = SiloManager.get_silo_cache_dir(silo_name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid silo: {e}")
    
    logs = {
        "worker_log": None,
        "crash_log": None,
        "progress": None,
        "skipped": None,
        "backend_log": None,
        "silo": silo_name or "active"
    }
    
    # Read worker log from silo-specific cache
    try:
        worker_log = os.path.join(cache_dir, "worker.log")
        if os.path.exists(worker_log):
            with open(worker_log, "r") as f:
                content = f.read()
                # Get last 500 lines for performance
                lines = content.split('\n')
                logs["worker_log"] = '\n'.join(lines[-500:]) if len(lines) > 500 else content
    except:
        pass
    
    # Read crash log
    try:
        crash_log = os.path.join(cache_dir, "worker-crashes.log")
        if os.path.exists(crash_log):
            with open(crash_log, "r") as f:
                content = f.read()
                lines = content.split('\n')
                logs["crash_log"] = '\n'.join(lines[-100:]) if len(lines) > 100 else content
    except:
        pass
    
    # Read progress
    try:
        progress_file = os.path.join(cache_dir, "detection-progress.json")
        if os.path.exists(progress_file):
            with open(progress_file, "r") as f:
                logs["progress"] = json.load(f)
    except:
        pass
    
    # Read skipped images
    try:
        skipped_file = os.path.join(cache_dir, "skipped-images.txt")
        if os.path.exists(skipped_file):
            with open(skipped_file, "r") as f:
                content = f.read()
                lines = content.split('\n')
                logs["skipped"] = '\n'.join(lines[-50:]) if len(lines) > 50 else content
    except:
        pass
    
    # Read backend logs
    try:
        backend_log = os.path.join(root_dir, "backend.log")
        if os.path.exists(backend_log):
            with open(backend_log, "r") as f:
                content = f.read()
                lines = content.split('\n')
                # Get last 1000 lines for backend logs
                logs["backend_log"] = '\n'.join(lines[-1000:]) if len(lines) > 1000 else content
    except:
        pass
    
    return logs


@app.post("/api/indexing/reindex-all")
async def reindex_all(silo_name: str = None):
    """
    Re-index all configured sources (all media, not just photos).
    
    Args:
        silo_name: Optional silo name to ensure we use the correct silo
    
    IMPORTANT: This endpoint DOES NOT delete or overwrite:
    - people.json (user-assigned face labels)
    - animals.json (user-assigned animal labels)
    - personalai.db (all detections and embeddings are preserved)
    
    Existing database records are only updated if the file hash has changed.
    User labels and metadata are always preserved.
    """
    check_read_only()  # Prevent reindexing in demo mode
    # If silo_name is provided, ensure it's set as active and locked for this operation
    if silo_name:
        _set_processing_silo(silo_name)
    
    # Check if indexing is already in progress
    lock = get_indexing_lock()
    if lock.locked():
        return {
            "status": "indexing_in_progress",
            "message": "Indexing is already running. Please wait for it to complete."
        }
    
    # Get current count of files in database BEFORE starting
    total_files_in_db = 0
    try:
        with get_db() as conn:
            cur = conn.execute("SELECT COUNT(*) FROM media_files")
            result = cur.fetchone()
            total_files_in_db = result[0] if result else 0
    except Exception as e:
        print(f"[API] Could not count files in DB: {e}", flush=True)
    
    # Get silo-specific indexing state and reset it
    indexing_state = _get_silo_indexing_state()
    indexing_state.clear()
    indexing_state.update({
        "status": "running",
        "processed": 0,
        "total": 0,
        "current_file": None,
        "percentage": 0,
        "error": None,
        "faces_found": 0,
        "animals_found": 0,
        "is_indexing": True,
        "total_files_in_db": total_files_in_db,  # Store initial DB count
    })
    print(f"[API] Starting reindex with {total_files_in_db} files already in database", flush=True)
    # Run full_reindex in the background with lock
    asyncio.create_task(_reindex_all_with_lock())
    return {"status": "indexing_started", "mode": "all_sources", "existing_files_in_db": total_files_in_db}


async def _reindex_all_with_lock():
    """Wrapper to acquire lock before reindexing."""
    lock = get_indexing_lock()
    async with lock:
        try:
            await full_reindex()
        except Exception as e:
            indexing_state = _get_silo_indexing_state()
            indexing_state["status"] = "error"
            indexing_state["error"] = str(e)
            print(f"Reindex error: {e}")
        finally:
            # Always mark indexing as complete and clear silo context
            global _currently_processing_silo
            indexing_state = _get_silo_indexing_state()
            indexing_state["is_indexing"] = False
            _currently_processing_silo = None  # Clear silo context after reindex
            print(f"[REINDEX] Cleared processing silo context", flush=True)


@app.post("/api/indexing/index-and-detect-faces")
async def index_and_detect_faces(silo_name: str = None):
    """
    Combined endpoint: First indexes all photos, then scans for faces in newly indexed photos.
    This is the main workflow for users wanting to add new photos and detect faces in one go.
    
    Args:
        silo_name: Optional silo name to ensure we use the correct silo
    """
    # If silo_name is provided, ensure it's set as active and locked for this operation
    if silo_name:
        _set_processing_silo(silo_name)
    
    # Check if indexing is already in progress
    lock = get_indexing_lock()
    if lock.locked():
        return {
            "status": "indexing_in_progress",
            "message": "Indexing is already running. Please wait for it to complete."
        }
    
    # Get silo-specific indexing state and reset it
    indexing_state = _get_silo_indexing_state()
    indexing_state.clear()
    indexing_state.update({
        "status": "running",
        "mode": "index_and_detect",  # Flag to indicate combined mode
        "phase": "indexing",  # 'indexing' or 'detecting'
        "processed": 0,
        "total": 0,
        "current_file": None,
        "percentage": 0,
        "error": None,
        "faces_found": 0,
        "animals_found": 0,
        "message": "Starting to index all photos...",
        "is_indexing": True,
    })
    
    # Run combined indexing + face detection in the background
    asyncio.create_task(_index_and_detect_with_lock())
    return {"status": "index_and_detect_started"}


async def _index_and_detect_with_lock():
    """Wrapper to run indexing then face detection sequentially with lock."""
    global _face_detection_running
    lock = get_indexing_lock()
    indexing_state = _get_silo_indexing_state()
    
    async with lock:
        try:
            # Phase 1: Index all photos
            print("[INDEX_DETECT] Phase 1: Starting full reindex...")
            indexing_state["phase"] = "indexing"
            indexing_state["message"] = "Scanning source folders for new photos..."
            
            indexed_count = await full_reindex()
            
            print(f"[INDEX_DETECT] Phase 1 complete: Indexed {indexed_count} files")
            indexing_state["phase"] = "detecting"
            indexing_state["message"] = f"Indexed {indexed_count} photos. Starting face detection on unscanned files..."
            indexing_state["processed"] = 0
            
            # Get total unprocessed files (files without embeddings)
            with get_db() as conn:
                cur = conn.execute(
                    """SELECT COUNT(*) FROM media_files 
                       WHERE type IN ('.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp')
                       AND id NOT IN (SELECT DISTINCT media_id FROM face_embeddings)"""
                )
                total_files = cur.fetchone()[0]
            
            indexing_state["total"] = total_files
            
            print(f"[INDEX_DETECT] Phase 2: Total files to scan: {total_files}")
            
            if total_files > 0:
                _face_detection_running = True
                
                # Run face detection worker
                backend_dir = os.path.dirname(os.path.abspath(__file__))
                worker_script = os.path.join(backend_dir, "..", "face_detection_worker.py")
                
                print(f"[INDEX_DETECT] Starting worker: {worker_script}")
                print(f"[INDEX_DETECT] Worker script exists: {os.path.exists(worker_script)}")
                
                try:
                    # Wait for face detection to complete with output capture
                    print("[INDEX_DETECT] Spawning worker process...")
                    process = await asyncio.create_subprocess_exec(
                        sys.executable, worker_script,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    
                    print(f"[INDEX_DETECT] Worker process spawned (PID: {process.pid})")
                    print("[INDEX_DETECT] Waiting for worker to complete...")
                    
                    # Capture output line-by-line in real-time
                    stdout_lines = []
                    stderr_lines = []
                    
                    try:
                        stdout_data, stderr_data = await process.communicate()
                        stdout_lines = stdout_data.decode('utf-8', errors='ignore').split('\n')
                        stderr_lines = stderr_data.decode('utf-8', errors='ignore').split('\n')
                    except Exception as io_error:
                        print(f"[INDEX_DETECT] Error reading process output: {io_error}")
                    
                    # Log all captured lines with markers
                    print("[WORKER_STDOUT_START]")
                    for line in stdout_lines:
                        if line.strip():
                            print(f"[WORKER_OUT] {line}")
                    print("[WORKER_STDOUT_END]")
                    
                    print("[WORKER_STDERR_START]")
                    for line in stderr_lines:
                        if line.strip():
                            print(f"[WORKER_ERR] {line}")
                    print("[WORKER_STDERR_END]")
                    
                    print(f"[INDEX_DETECT] Worker process completed with return code: {process.returncode}")
                    
                    if process.returncode == 0:
                        print("[INDEX_DETECT] ✓ face detection completed successfully")
                        indexing_state["status"] = "complete"
                        indexing_state["message"] = f"✓ Complete! Detected faces in {total_files} photos."
                    else:
                        error_msg = '\n'.join(stderr_lines[-10:]) if stderr_lines else f"Exit code: {process.returncode}"
                        print(f"[INDEX_DETECT] ✗ face detection failed with exit code {process.returncode}")
                        print(f"[INDEX_DETECT] Error output: {error_msg[:500]}")
                        indexing_state["status"] = "error"
                        indexing_state["error"] = error_msg[:200]
                        indexing_state["message"] = f"Error: {error_msg[:100]}"
                    
                    _face_detection_running = False
                    
                except Exception as e:
                    print(f"[INDEX_DETECT] Exception while running worker: {e}")
                    import traceback
                    print(traceback.format_exc())
                    indexing_state["status"] = "error"
                    indexing_state["error"] = str(e)[:200]
                    indexing_state["message"] = f"Worker error: {str(e)[:100]}"
                    _face_detection_running = False
            else:
                indexing_state["status"] = "complete"
                indexing_state["message"] = "No photos found to scan"
                print("[INDEX_DETECT] No photos indexed yet")
            
        except Exception as e:
            print(f"[INDEX_DETECT] Error in face detection workflow: {e}")
            import traceback
            print(traceback.format_exc())
            indexing_state["status"] = "error"
            indexing_state["error"] = str(e)[:200]
            indexing_state["message"] = f"Error: {str(e)[:100]}"
            _face_detection_running = False
            _face_detection_running = False
        finally:
            # Clear silo context after index+detect completes
            global _currently_processing_silo
            _currently_processing_silo = None
            print(f"[INDEX_DETECT] Cleared processing silo context", flush=True)


@app.post("/api/indexing/detect-faces-only")
async def detect_faces_only(silo_name: str = None):
    """
    ⚡️ FAST: Detect faces in already-indexed images WITHOUT reindexing files.
    
    Args:
        silo_name: Optional silo name to ensure we use the correct silo
    
    This endpoint SKIPS the indexing phase entirely and only runs face detection on
    the already-indexed photos. No re-indexing, no file scanning, just pure face detection.
    
    Use this after you've already run a full index to quickly scan for faces.
    """
    # If silo_name is provided, ensure it's set as active and locked for this operation
    if silo_name:
        _set_processing_silo(silo_name)
    
    global _face_detection_running
    indexing_state = _get_silo_indexing_state()
    
    # Check if face detection is already running
    if _face_detection_running:
        return {
            "status": "face_detection_in_progress",
            "message": "face detection is already running."
        }
    
    # Set flag to prevent concurrent runs
    _face_detection_running = True
    
    print("[DETECT_ONLY] Starting face detection (NO RE-INDEXING)")
    
    indexing_state.clear()
    indexing_state.update({
        "status": "running",
        "phase": "detecting",  # Skip indexing phase
        "processed": 0,
        "total": 0,
        "current_file": "Starting face detection...",
        "percentage": 0,
        "error": None,
        "faces_found": 0,
        "animals_found": 0,
    })
    
    # Run face detection as a subprocess to avoid blocking the async loop - PASS SILO NAME
    asyncio.create_task(_run_face_detection_worker(silo_name))
    print("[DETECT_ONLY] face detection worker spawned - polling available via /api/indexing")
    return {"status": "face_detection_started", "mode": "detect_only_no_reindex"}


async def _run_face_detection_worker(silo_name: str = None):
    """Run face detection worker as a subprocess."""
    # CRITICAL: Restore silo context for async task
    if silo_name:
        _set_processing_silo(silo_name)
    
    global _face_detection_running, _face_clusters_cache
    indexing_state = _get_silo_indexing_state()
    
    try:
        # Get the path to the worker script
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        worker_script = os.path.join(backend_dir, "..", "face_detection_worker.py")
        
        print(f"[API] Face detection worker script path: {worker_script}", flush=True)
        print(f"[API] Worker script exists: {os.path.exists(worker_script)}", flush=True)
        
        # Get the database path for the current silo to pass to worker
        from .db import get_db_path
        from .silo_manager import SiloManager
        db_path = get_db_path()
        print(f"[API] Using database: {db_path}", flush=True)
        
        # Also get the silo-specific cache directory for cluster cache
        cache_dir = SiloManager.get_silo_cache_dir()
        cluster_cache_path = os.path.join(cache_dir, "people_cluster_cache.json")
        print(f"[API] Using cluster cache: {cluster_cache_path}", flush=True)
        
        indexing_state["status"] = "running"
        indexing_state["current_file"] = "Starting face detection..."
        
        # Get unprocessed file count for UI feedback
        with get_db() as conn:
            cur = conn.execute(
                """SELECT COUNT(*) FROM media_files 
                   WHERE id NOT IN (SELECT DISTINCT media_id FROM face_embeddings) 
                   AND type IN ('.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp')"""
            )
            total_files = cur.fetchone()[0]
        
        indexing_state["total"] = total_files
        
        if total_files == 0:
            indexing_state["status"] = "complete"
            indexing_state["current_file"] = "No files to process"
            print(f"[API] No unprocessed files for face detection", flush=True)
            return
        
        print(f"[API] Starting face detection worker subprocess for {total_files} images...", flush=True)
        
        # Run subprocess in a thread to avoid deadlock
        def run_worker():
            import subprocess
            global _face_detection_running
            max_restarts = 100  # Allow many restarts to process all files
            restart_count = 0
            
            # Setup environment for worker with silo DB path and cluster cache path
            worker_env = os.environ.copy()
            worker_env["PAI_DB"] = db_path
            worker_env["PAI_CLUSTER_CACHE"] = cluster_cache_path
            
            while restart_count < max_restarts:
                # Ensure flag stays set during restarts
                _face_detection_running = True
                
                result = subprocess.run(
                    [sys.executable, worker_script],
                    cwd=backend_dir,
                    capture_output=True,
                    timeout=3600,  # 1 hour timeout
                    text=True,
                    env=worker_env  # Pass silo DB path to worker
                )
                
                # Log worker output for debugging
                if result.stdout:
                    print(f"[WORKER-STDOUT] {result.stdout[:500]}", flush=True)
                if result.stderr:
                    print(f"[WORKER-STDERR] {result.stderr[:500]}", flush=True)
                print(f"[WORKER] Exit code: {result.returncode}", flush=True)
                
                # Check if any unprocessed files remain (regardless of exit code)
                try:
                    with get_db() as conn:
                        cur = conn.execute(
                            """SELECT COUNT(*) FROM media_files 
                               WHERE face_detection_attempted = 0
                               AND type IN ('.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp')"""
                        )
                        remaining = cur.fetchone()[0] or 0
                except Exception as e:
                    print(f"[API] Error checking remaining files: {e}", flush=True)
                    remaining = 0
                
                # If exit code was 0 or there are still files to process, check what to do
                if result.returncode == 0 or remaining > 0:
                    if remaining == 0:
                        print(f"[API] ✅ face detection COMPLETE - all {restart_count + 1} batches processed", flush=True)
                        _face_detection_running = False
                        return 0
                    else:
                        # More files to process, restart worker (even if previous batch had errors)
                        restart_count += 1
                        if result.returncode != 0:
                            print(f"[API] ⚠️ Worker batch #{restart_count} failed with exit code {result.returncode}, but files remain - restarting...", flush=True)
                        else:
                            print(f"[API] 🔄 Worker batch #{restart_count} complete - restarting ({remaining} files remaining)...", flush=True)
                        time.sleep(0.5)  # Brief pause between restarts
                        continue
                else:
                    # Worker crashed and no files remain (or error checking files)
                    print(f"[API] ❌ Worker batch #{restart_count + 1} exited with code {result.returncode}, no files remaining", flush=True)
                    if result.stderr:
                        print(f"[API] STDERR: {result.stderr[:500]}", flush=True)
                    _face_detection_running = False
                    return result.returncode
            
            print(f"[API] ⚠️  Maximum restart limit ({max_restarts}) reached", flush=True)
            _face_detection_running = False
            return 0
        
        loop = asyncio.get_event_loop()
        returncode = await loop.run_in_executor(None, run_worker)
        
        if returncode == 0:
            # Query final face count
            with get_db() as conn:
                cur = conn.execute(
                    "SELECT COUNT(*) FROM face_embeddings"
                )
                total_faces = cur.fetchone()[0]
            
            # Clear face clusters cache now that new faces have been detected
            _face_clusters_cache["data"] = None
            _face_clusters_cache["timestamp"] = 0
            print(f"[API] Cleared face clusters cache after detecting {total_faces} total faces", flush=True)
            
            indexing_state["faces_found"] = total_faces
            indexing_state["status"] = "complete"
            indexing_state["percentage"] = 100
            indexing_state["current_file"] = f"Complete: {total_faces} faces detected"
            print(f"[API] face detection worker completed successfully - {total_faces} total faces", flush=True)
        else:
            indexing_state["status"] = "error"
            indexing_state["error"] = f"Worker process exited with code {returncode}"
            print(f"[API] face detection worker failed with exit code {returncode}", flush=True)
        
    except Exception as e:
        print(f"[API] ✗ face detection error: {e}", flush=True)
        import traceback
        traceback.print_exc()
        indexing_state["status"] = "error"
        indexing_state["error"] = str(e)
    finally:
        # Clear the running flag and silo context when done
        global _currently_processing_silo
        _face_detection_running = False
        _currently_processing_silo = None
        print(f"[API] Cleared processing silo context and face detection flag", flush=True)
        print(f"[API] face detection task completed, flag cleared", flush=True)


# Global indexing state for progress tracking
indexing_state = {
    "status": "idle",
    "processed": 0,
    "total": 0,
    "current_file": None,
    "percentage": 0,
    "error": None,
    "faces_found": 0,
    "animals_found": 0,
}

# Cache for face clustering to avoid recalculating every request
_face_clusters_cache = {
    "data": None,
    "timestamp": 0,
    "cache_duration": 60,  # Cache for 60 seconds to prevent constant re-clustering
}


@app.post("/api/indexing")
async def start_indexing(req: IndexingRequest):
    """Start indexing a specific path with real progress tracking."""
    # CRITICAL: Set silo context from request
    silo_name = req.silo_name
    if silo_name:
        _set_processing_silo(silo_name)
    
    # CRITICAL: Ensure the silo's database exists before indexing
    if silo_name:
        try:
            from .silo_manager import SiloManager
            db_path = SiloManager.get_silo_db_path(silo_name)
            print(f"[INDEXING] Ensuring database exists for silo '{silo_name}': {db_path}", flush=True)
            init_db(db_path)
            print(f"[INDEXING] ✓ Database ready for silo '{silo_name}'", flush=True)
        except Exception as e:
            print(f"[INDEXING] ERROR initializing database for silo '{silo_name}': {e}", flush=True)
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Failed to initialize database for silo: {e}")
    
    indexing_state = _get_silo_indexing_state()

    # Check if indexing is already in progress
    lock = get_indexing_lock()
    if lock.locked():
        return {
            "status": "indexing_in_progress",
            "message": "Indexing is already running. Please wait for it to complete."
        }

    path = req.path
    recursive = req.recursive

    if not path:
        raise HTTPException(status_code=400, detail="Path required")

    # Normalize path
    path = os.path.abspath(os.path.expanduser(path))

    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"Path does not exist: {path}")

    # Reset state
    indexing_state.clear()
    indexing_state.update({
        "status": "running",
        "processed": 0,
        "total": 0,
        "current_file": None,
        "percentage": 0,
        "error": None,
        "faces_found": 0,
        "animals_found": 0,
    })

    # Start indexing in background with lock - PASS SILO NAME THROUGH
    asyncio.create_task(_index_path_with_progress_locked(path, recursive, silo_name))

    return {"status": "indexing_started", "path": path}


async def _index_path_with_progress_locked(root_path: str, recursive: bool = True, silo_name: str = None):
    """Wrapper to acquire lock before indexing path."""
    global _currently_processing_silo
    # CRITICAL: Restore silo context for async task
    if silo_name:
        _set_processing_silo(silo_name)
    
    lock = get_indexing_lock()
    indexing_state = _get_silo_indexing_state()
    async with lock:
        try:
            await _index_path_with_progress(root_path, recursive)
        except Exception as e:
            indexing_state["status"] = "error"
            indexing_state["error"] = str(e)
            print(f"Indexing error: {e}")
        finally:
            # CRITICAL: Always clear processing silo when indexing completes
            _currently_processing_silo = None
            print(f"[INDEXING] Cleared processing silo context")



async def _index_path_with_progress(root_path: str, recursive: bool = True):
    """Index files in a path with progress tracking - memory efficient, single file at a time."""
    indexing_state = _get_silo_indexing_state()
    
    print(f"[INDEXING_START] Currently processing silo: {_currently_processing_silo}")
    
    try:
        animals_found = 0
        # Count total files first
        file_list = []
        print(f"[INDEXING] Starting indexing for path: {root_path}, recursive={recursive}")
        print(f"[INDEXING] Path exists: {os.path.exists(root_path)}")
        print(f"[INDEXING] Path is directory: {os.path.isdir(root_path)}")
        
        file_count_scanned = 0
        for dirpath, dirnames, filenames in os.walk(root_path):
            for name in filenames:
                file_count_scanned += 1
                full_path = os.path.join(dirpath, name)
                if is_media(full_path, skip_videos=False):
                    file_list.append(full_path)
            if not recursive:
                break
        
        print(f"[INDEXING] Found {len(file_list)} media files to index")
        indexing_state["total"] = len(file_list)
        
        if len(file_list) == 0:
            print(f"[INDEXING] no media filesfound in {root_path}, marking as complete")
            indexing_state["status"] = "complete"
            return
        
        # Index each file one at a time with memory management
        # Process 1 file at a time with delay between each to reduce CPU/GPU load
        print(f"[INDEXING] Starting to process {len(file_list)} media files (strictly sequential)")
        for idx, file_path in enumerate(file_list):
            try:
                indexing_state["current_file"] = file_path

                # Skip already indexed files
                with get_db() as conn:
                    cur = conn.execute("SELECT id FROM media_files WHERE path = ?", (file_path,))
                    existing = cur.fetchone()
                    if existing:
                        print(f"[INDEXING_SKIP] File already in DB: {file_path}")
                        indexing_state["processed"] += 1
                        indexing_state["percentage"] = int((indexing_state["processed"] / indexing_state["total"]) * 100)
                        print(f"[INDEXING] Skipping ({idx + 1}/{len(file_list)}): {os.path.basename(file_path)} (already indexed)")
                        await asyncio.sleep(0.1)  # Small delay even for skipped files
                        continue
                    else:
                        print(f"[INDEXING_NEW] File not in DB: {file_path}")

                print(f"[INDEXING] Processing ({idx + 1}/{len(file_list)}): {os.path.basename(file_path)}")
                await process_single(file_path)

                # Count animals recorded for reporting
                with get_db() as conn:
                    cur = conn.execute("SELECT animals FROM media_files WHERE path = ?", (file_path,))
                    row = cur.fetchone()
                    if row and row[0]:
                        try:
                            animals_found += len(json.loads(row[0]))
                        except Exception:
                            pass

                indexing_state["processed"] += 1
                indexing_state["percentage"] = int((indexing_state["processed"] / indexing_state["total"]) * 100)
                
                print(f"[INDEXING] ✓ Successfully indexed ({idx + 1}/{len(file_list)})")
                
                # Aggressive memory cleanup after EVERY file
                gc.collect()
                
                # Longer delay between files to prevent blocking and ensure cleanup
                print(f"[INDEXING] Waiting 1 second before next file...")
                await asyncio.sleep(1.0)

            except Exception as e:
                print(f"[INDEXING] ✗ Error indexing {file_path}: {e}")
                import traceback
                traceback.print_exc()
                indexing_state["processed"] += 1
                indexing_state["percentage"] = int((indexing_state["processed"] / indexing_state["total"]) * 100)
                # Still delay on errors to reduce load
                gc.collect()
                await asyncio.sleep(1.0)
                continue
        
        # Run face detection on ALL newly indexed files with memory efficiency and throttling
        indexing_state["current_file"] = "Detecting faces in all indexed images..."
        print(f"[INDEXING] Starting batch face detection for all unprocessed files...")
        print(f"[INDEXING] Using throttled face detection with 3-second delay every 3 images for system stability")
        try:
            total_faces_detected = 0
            batch_size = 10  # Reduced batch size from 50 to 10 for better throttling
            processed_count = 0
            
            # Keep processing batches until no more files without face embeddings
            while True:
                with get_db() as conn:
                    # Find files without face embeddings (using embeddings table, not faces JSON)
                    cur = conn.execute(
                        """SELECT COUNT(*) FROM media_files 
                           WHERE id NOT IN (SELECT DISTINCT media_id FROM face_embeddings) 
                           AND type IN ('.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp')"""
                    )
                    remaining = cur.fetchone()[0]
                    
                    if remaining == 0:
                        print(f"[INDEXING] ✓ face detection complete! All {processed_count} files processed.")
                        break
                    
                    # Get next batch of files without face embeddings
                    cur = conn.execute(
                        """SELECT id, path FROM media_files 
                           WHERE id NOT IN (SELECT DISTINCT media_id FROM face_embeddings) 
                           AND type IN ('.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp')
                           LIMIT ?""",
                        (batch_size,)
                    )
                    unindexed_faces = cur.fetchall()
                
                if not unindexed_faces:
                    break
                
                print(f"[INDEXING] Processing face detection batch: {len(unindexed_faces)} files ({remaining} remaining)...")
                
                for batch_idx, (media_id, path) in enumerate(unindexed_faces):
                    try:
                        indexing_state["current_file"] = f"Detecting faces: {path.split('/')[-1]}"
                        print(f"[INDEXING] [{processed_count + 1}/{processed_count + len(unindexed_faces)}] Processing {path.split('/')[-1]}...")
                        
                        # Process one image at a time through detect_faces
                        # (detect_faces now handles internal throttling)
                        faces = detect_faces([path])
                        
                        if faces:
                            with get_db() as conn:
                                store_face_embeddings(
                                    conn,
                                    media_id,
                                    [
                                        {
                                            "embedding": f.embedding,
                                            "bbox": f.bbox,
                                            "score": f.score,
                                        }
                                        for f in faces
                                    ],
                                )
                            total_faces_detected += len(faces)
                            print(f"[INDEXING] • Found {len(faces)} face(s)")
                        
                        processed_count += 1
                    except Exception as e:
                        print(f"[INDEXING] ✗ face detection error for {path}: {e}")
                        import traceback
                        traceback.print_exc()
                        processed_count += 1
                    
                    # Throttle: Every 3 images, do aggressive memory cleanup
                    if (processed_count % 3) == 0:
                        print(f"[INDEXING] Memory cleanup checkpoint ({processed_count} images processed)...")
                        gc.collect()
                        # Try to clean CUDA cache if available
                        try:
                            import torch
                            if torch.cuda.is_available():
                                torch.cuda.empty_cache()
                        except:
                            pass
                        # Minimal delay between batches
                        await asyncio.sleep(0.5)
                    else:
                        # No delay between consecutive images to speed up
                        pass
            
            print(f"[INDEXING] ✓ face detection phase complete: {total_faces_detected} total faces found")
            indexing_state["faces_found"] = total_faces_detected
            
            # Now cluster the detected faces
            print(f"[INDEXING] Clustering detected faces...")
            faces = load_faces_from_db()
            if faces:  # Only cluster if we have faces
                clusters = cluster_faces(faces)
                print(f"[INDEXING] ✓ Face clustering complete: {len(clusters)} person clusters found")
            del faces  # Explicitly delete to free memory
        except Exception as e:
            print(f"[INDEXING] ✗ face detection error: {e}")
            import traceback
            traceback.print_exc()
        
        indexing_state["animals_found"] = animals_found
        
        print(f"[INDEXING] ✓ Indexing complete! Processed {indexing_state['processed']} files")
        indexing_state["status"] = "complete"
        gc.collect()  # Final cleanup
        
    except Exception as e:
        indexing_state["status"] = "error"
        indexing_state["error"] = str(e)
        print(f"[INDEXING] ✗ Indexing error: {e}")
        import traceback
        traceback.print_exc()


@app.get("/api/indexing")
async def get_indexing_status(silo_name: str = None):
    """Get current indexing progress for the specified or current silo.
    
    Args:
        silo_name: Optional silo name to get status for specific silo
    """
    # If silo_name is provided, ensure it's set as active (for consistent state retrieval)
    if silo_name:
        _set_processing_silo(silo_name)
    
    indexing_state = _get_silo_indexing_state()
    
    # If face detection is running, try to read progress from the worker's progress file
    if _face_detection_running:
        try:
            from .silo_manager import SiloManager
            cache_dir = SiloManager.get_silo_cache_dir()
            progress_file = os.path.join(cache_dir, "detection-progress.json")
            if os.path.exists(progress_file):
                with open(progress_file, "r") as f:
                    progress_data = json.load(f)
                    if progress_data.get("total", 0) > 0:
                        # Get count of already-attempted files from database
                        try:
                            with get_db() as conn:
                                cur = conn.execute("SELECT COUNT(*) FROM media_files WHERE face_detection_attempted = 1")
                                already_attempted = cur.fetchone()[0] or 0
                        except:
                            already_attempted = 0
                        
                        # Calculate cumulative progress
                        current_processed = progress_data.get("processed", 0)
                        remaining_total = progress_data.get("total", 0)
                        cumulative_processed = already_attempted + current_processed
                        cumulative_total = already_attempted + remaining_total
                        
                        indexing_state["processed"] = cumulative_processed
                        indexing_state["total"] = cumulative_total
                        indexing_state["faces_found"] = progress_data.get("faces_found", 0)
                        indexing_state["current_file"] = progress_data.get("current_file", "")
                        pct = int((cumulative_processed / cumulative_total) * 100) if cumulative_total > 0 else 0
                        indexing_state["percentage"] = min(pct, 99)  # Cap at 99 until truly done
        except Exception as e:
            print(f"[API] Could not read progress file: {e}", flush=True)
    
    return {
        "progress": indexing_state,
        "entities": {
            "faces": [{"label": "faces", "count": indexing_state.get("faces_found", 0)}],
            "animals": [{"label": "animals", "count": indexing_state.get("animals_found", 0)}],
        }
    }


@app.post("/api/indexing/pause")
async def pause_processing():
    """Pause indexing and face detection operations."""
    global _processing_paused
    _processing_paused = True
    print("[API] ⏸️  Processing paused")
    return {"status": "paused", "message": "Indexing and face detection have been paused."}


@app.post("/api/indexing/resume")
async def resume_processing():
    """Resume indexing and face detection operations."""
    global _processing_paused
    _processing_paused = False
    print("[API] ▶️  Processing resumed")
    return {"status": "resumed", "message": "Indexing and face detection have been resumed."}


@app.get("/api/indexing/pause-status")
async def get_pause_status():
    """Check if processing is paused."""
    return {"paused": _processing_paused}


@app.post("/api/indexing/check-new-files")
async def check_new_files(request: dict):
    """Check for new files in the given paths that are not yet in the database."""
    import os
    from .indexer import SUPPORTED_IMAGE_TYPES, SUPPORTED_VIDEO_TYPES, SUPPORTED_AUDIO_TYPES, SUPPORTED_TEXT_TYPES
    paths = request.get("paths", [])
    if not paths:
        return {"new_count": 0, "paths": []}
    
    new_files = []
    with get_db() as conn:
        # Get all existing file paths in database
        cur = conn.execute("SELECT path FROM media_files")
        existing_paths = {row[0] for row in cur.fetchall()}
    
    # Check for new files in each path - include ALL supported file types
    supported_exts = SUPPORTED_IMAGE_TYPES | SUPPORTED_VIDEO_TYPES | SUPPORTED_AUDIO_TYPES | SUPPORTED_TEXT_TYPES
    
    for path in paths:
        if not os.path.isdir(path):
            continue
        
        for root, dirs, files in os.walk(path):
            for filename in files:
                file_path = os.path.join(root, filename)
                _, ext = os.path.splitext(filename)
                
                if ext.lower() in supported_exts and file_path not in existing_paths:
                    new_files.append(file_path)
    
    return {
        "new_count": len(new_files),
        "paths": new_files[:100],  # Return first 100 new files
    }


@app.post("/api/indexing/count-files")
async def count_files(request: dict):
    """Count media files in the given paths."""
    import os
    from .indexer import SUPPORTED_IMAGE_TYPES, SUPPORTED_VIDEO_TYPES, SUPPORTED_AUDIO_TYPES, SUPPORTED_TEXT_TYPES
    paths = request.get("paths", [])
    if not paths:
        return {"total_count": 0}
    
    # Media file extensions - include ALL supported types
    supported_exts = SUPPORTED_IMAGE_TYPES | SUPPORTED_VIDEO_TYPES | SUPPORTED_AUDIO_TYPES | SUPPORTED_TEXT_TYPES
    
    total_count = 0
    for path in paths:
        if not os.path.isdir(path):
            continue
        
        for root, dirs, files in os.walk(path):
            for filename in files:
                _, ext = os.path.splitext(filename)
                if ext.lower() in supported_exts:
                    total_count += 1
    
    return {"total_count": total_count}


@app.post("/api/index/rebuild")
async def rebuild_index(silo_name: Optional[str] = Query(None)):
    """Rebuild FAISS search index from existing CLIP embeddings in database."""
    # Set silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    # Rebuild FAISS index from existing embeddings in database
    total = await rebuild_faiss_index_from_db(silo_name=silo_name)
    return {"indexed": total, "silo": silo_name}


@app.post("/api/cache/rebuild-people-clusters")
async def rebuild_people_cluster_cache(silo_name: Optional[str] = None):
    """Build a simple cache mapping cluster names to file paths for fast search."""
    try:
        from .silo_manager import SiloManager
        
        # If no silo_name provided, use active silo
        if not silo_name:
            silo = SiloManager.get_active_silo()
            silo_name = silo.get("name") if silo else None
        
        print(f"[CACHE] Building people cluster cache for silo: {silo_name}...")
        
        # Load labels (cluster names and confirmed photos)
        labels = load_labels()
        if not labels:
            return {"status": "success", "clusters": 0, "message": "No people clusters to cache"}
        
        cache = {}
        
        # Get all file paths in one query
        with get_db() as conn:
            cur = conn.execute("SELECT id, path FROM media_files")
            media_map = {row[0]: row[1] for row in cur.fetchall()}
        
        # Build cache from labels
        for cluster_id, label_data in labels.items():
            if isinstance(label_data, dict):
                label = label_data.get('label', '').lower()
                confirmed_photos = label_data.get('confirmed_photos', [])
                
                # Get file paths for confirmed photos (using the map we built)
                file_paths = [media_map[media_id] for media_id in confirmed_photos if media_id in media_map]
                
                if file_paths:  # Only cache if there are actual files
                    cache[cluster_id] = {
                        'label': label,
                        'files': file_paths,
                        'last_updated': int(time.time())
                    }
                    print(f"[CACHE]   {cluster_id}: '{label}' - {len(file_paths)} files")
        
        # Write cache to silo-specific directory
        cache_dir = SiloManager.get_silo_cache_dir(silo_name) if silo_name else os.path.join(os.path.dirname(__file__), '..', 'cache')
        os.makedirs(cache_dir, exist_ok=True)
        cache_file = os.path.join(cache_dir, 'people_cluster_cache.json')
        
        with open(cache_file, 'w') as f:
            json.dump(cache, f, indent=2)
        
        print(f"[CACHE] Cache saved to {cache_file}: {len(cache)} clusters")
        
        return {
            "status": "success",
            "clusters": len(cache),
            "cache_file": cache_file,
            "message": f"Built cache for {len(cache)} people clusters"
        }
        
    except Exception as e:
        print(f"[CACHE] ERROR: {e}")
        import traceback
        print(traceback.format_exc())
        return {"status": "error", "message": str(e)}


@app.get("/api/media", response_model=List[MediaResponse])
async def list_media(limit: int = 100, offset: int = 0, silo_name: str = Query(None)):
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    with get_db() as conn:
        cur = conn.execute(
            "SELECT id, path, type, date_taken, size, width, height, camera, lens FROM media_files ORDER BY date_taken DESC NULLS LAST LIMIT ? OFFSET ?",
            (limit, offset),
        )
        rows = cur.fetchall()
        return [MediaResponse(**{
            "id": r[0],
            "path": r[1],
            "type": r[2],
            "date_taken": r[3],
            "size": r[4],
            "width": r[5],
            "height": r[6],
            "camera": r[7],
            "lens": r[8],
        }) for r in rows]


@app.get("/api/media/by-date")
async def media_by_date(silo_name: str = Query(None)):
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    with get_db() as conn:
        # Check if rotation column exists - handle old databases
        cursor = conn.execute("PRAGMA table_info(media_files)")
        columns = {row[1] for row in cursor.fetchall()}
        has_rotation = 'rotation' in columns
        
        # Build dynamic query based on available columns
        if has_rotation:
            query = "SELECT date_taken, json_group_array(json_object('id', id, 'path', path, 'type', type, 'size', size, 'width', width, 'height', height, 'rotation', rotation)) AS items FROM media_files WHERE is_hidden = 0 GROUP BY date_taken ORDER BY date_taken DESC"
        else:
            query = "SELECT date_taken, json_group_array(json_object('id', id, 'path', path, 'type', type, 'size', size, 'width', width, 'height', height, 'rotation', 0)) AS items FROM media_files WHERE is_hidden = 0 GROUP BY date_taken ORDER BY date_taken DESC"
        
        cur = conn.execute(query)
        result = []
        for row in cur.fetchall():
            # Parse items - rotation is now included from database or defaulted to 0
            items = json.loads(row[1])
            for item in items:
                # Ensure rotation has a default value if NULL
                if item['rotation'] is None:
                    item['rotation'] = 0
            result.append({"date_taken": row[0], "items": json.dumps(items)})
        return result


@app.get("/api/media/file/{media_id}")
async def serve_media_file(media_id: int):
    """Serve media file by ID. AIF files automatically converted to WAV on-the-fly if needed."""
    with get_db() as conn:
        cur = conn.execute("SELECT path FROM media_files WHERE id = ?", (media_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Media not found")
        
        file_path = row[0]
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found on disk")
        
        # Check if it's an AIF file that needs conversion
        file_ext = os.path.splitext(file_path)[1].lower()
        if file_ext in ['.aif', '.aiff']:
            # Convert to WAV on-the-fly
            from .indexer import convert_aif_to_wav
            converted_path = convert_aif_to_wav(file_path)
            if converted_path != file_path and os.path.exists(converted_path):
                file_path = converted_path
        
        return FileResponse(file_path)


@app.get("/api/media/thumbnail/{media_id}")
async def serve_thumbnail(media_id: int, size: int = 300, square: bool = False):
    """Serve compressed thumbnail directly from the file."""
    from PIL import Image
    import io
    
    with get_db() as conn:
        cur = conn.execute("SELECT path, rotation FROM media_files WHERE id = ?", (media_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Media not found")
        
        file_path = row[0]
        rotation = row[1] if row[1] else 0
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
        
        # Check if it's an image file
        image_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff'}
        if not any(file_path.lower().endswith(ext) for ext in image_extensions):
            return FileResponse(file_path, headers={"Cache-Control": "public, max-age=86400"})
        
        try:
            # Open image directly from the file
            img = Image.open(file_path)
            
            # Apply rotation if needed
            if rotation and rotation != 0:
                img = img.rotate(-rotation, expand=False, fillcolor='white')
            
            # Convert RGBA to RGB
            if img.mode in ('RGBA', 'LA'):
                rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = rgb_img
            
            if square:
                # Crop to square from center
                width, height = img.size
                square_size = min(width, height)
                left = (width - square_size) // 2
                top = (height - square_size) // 2
                img = img.crop((left, top, left + square_size, top + square_size))
                img.thumbnail((size, size), Image.Resampling.LANCZOS)
            else:
                # Resize maintaining aspect ratio
                img.thumbnail((size, size), Image.Resampling.LANCZOS)
            
            # Return compressed JPEG directly from memory
            img_bytes = io.BytesIO()
            img.save(img_bytes, "JPEG", quality=80, optimize=True)
            img_bytes.seek(0)
            
            return Response(content=img_bytes.getvalue(), media_type="image/jpeg")
        except Exception as e:
            print(f"[THUMBNAIL] Error generating thumbnail: {str(e)}")
            return FileResponse(file_path)


@app.get("/api/media/audio")
async def list_audio(limit: int = 1000, offset: int = 0):
    """Get all audio files from the database."""
    # Define audio types inline to ensure they're available
    audio_types = {".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg", ".wma", ".opus", ".alac", ".aif", ".aiff"}
    
    with get_db() as conn:
        # Get all non-hidden files first
        cur = conn.execute(
            """SELECT id, path, type, date_taken, size 
               FROM media_files 
               WHERE is_hidden = 0
               ORDER BY date_taken DESC NULLS LAST"""
        )
        all_rows = cur.fetchall()
        
        print(f"[AUDIO] Total non-hidden files in database: {len(all_rows)}")
        
        # Count file types to understand what's being stored
        type_counts = {}
        aif_in_db = 0
        wav_in_db = 0
        
        for row in all_rows:
            media_id, path, file_type, date_taken, size = row
            
            # Get file extension from path
            _, ext = os.path.splitext(path.lower())
            type_counts[ext] = type_counts.get(ext, 0) + 1
            
            if ext == '.aif' or ext == '.aiff':
                aif_in_db += 1
                print(f"[AUDIO] ⚠️  AIF in database: {path}")
            elif ext == '.wav':
                wav_in_db += 1
        
        print(f"[AUDIO] File type summary: {type_counts}")
        print(f"[AUDIO] AIF files in DB: {aif_in_db}, WAV files in DB: {wav_in_db}")
        
        # Filter to audio files only by checking file extension
        audio_files = []
        for row in all_rows:
            media_id, path, file_type, date_taken, size = row
            
            # Get file extension from path
            _, ext = os.path.splitext(path.lower())
            
            # Check if it's an audio file
            if ext in audio_types:
                audio_files.append({
                    "id": media_id,
                    "path": path,
                    "type": file_type,
                    "date_taken": date_taken,
                    "size": size,
                })
                if ext in ['.aif', '.aiff', '.wav']:
                    print(f"[AUDIO] Including audio file: {os.path.basename(path)} (ext: {ext}, is_wav: {ext == '.wav'})")
        
        print(f"[AUDIO] Total audio files found: {len(audio_files)} out of {len(all_rows)} non-hidden files")
        return audio_files


@app.get("/api/debug/database-file-types")
async def debug_file_types():
    """Debug endpoint to see what file types are in the database."""
    with get_db() as conn:
        cur = conn.execute(
            """SELECT type, COUNT(*) as count 
               FROM media_files 
               GROUP BY type 
               ORDER BY count DESC"""
        )
        rows = cur.fetchall()
        
        result = {}
        for file_type, count in rows:
            result[file_type or "null"] = count
        
        print(f"[DEBUG] File types in database: {result}")
        return {"file_types": result}


@app.get("/api/media/count/total")
async def get_total_media_count():
    """Get total count of eligible media files (images only) from database."""
    try:
        with get_db() as conn:
            # Count eligible image files
            cur = conn.execute(
                """SELECT COUNT(*) FROM media_files 
                   WHERE type IN ('.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp')"""
            )
            total = cur.fetchone()[0] or 0
            
            # Also return processed count for reference
            processed_cur = conn.execute(
                """SELECT COUNT(*) FROM media_files 
                   WHERE face_detection_attempted = 1
                   AND type IN ('.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp')"""
            )
            processed = processed_cur.fetchone()[0] or 0
            
            return {
                "total": total,
                "processed": processed,
                "remaining": total - processed
            }
    except Exception as e:
        print(f"[API_ERROR] Failed to get media count: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/media/{media_id}/metadata")
async def get_media_metadata(media_id: int):
    """Get metadata for a media file (dimensions, rotation, etc)."""
    try:
        with get_db() as conn:
            cur = conn.execute(
                "SELECT id, width, height, rotation FROM media_files WHERE id = ?",
                (media_id,)
            )
            row = cur.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="Media not found")
            
            # Read rotation directly from database
            return {
                "id": row[0],
                "width": row[1] or 1000,
                "height": row[2] or 1000,
                "rotation": row[3] or 0,
            }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to get media metadata: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/media/{media_id}/clusters")
async def get_media_clusters(media_id: int):
    """Get all clusters (people) that contain this media file."""
    try:
        from .face_cluster import load_labels
        
        # Load all labels to find which clusters contain this media
        labels = load_labels()
        cluster_ids = []
        
        # Check each cluster's confirmed_photos
        for cluster_id, cluster_data in labels.items():
            confirmed_photos = cluster_data.get("confirmed_photos", [])
            if media_id in confirmed_photos:
                cluster_ids.append(cluster_id)
        
        print(f"[DEBUG] Media {media_id} found in clusters: {cluster_ids}")
        return cluster_ids
    except Exception as e:
        print(f"[API_ERROR] Failed to get media clusters: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/media/{media_id}/faces")
async def get_media_faces(media_id: int):
    """Get detected faces for a media file with bounding boxes in normalized 0-1 coordinates."""
    try:
        with get_db() as conn:
            # Get image dimensions
            cur = conn.execute(
                "SELECT width, height FROM media_files WHERE id = ?",
                (media_id,)
            )
            dims = cur.fetchone()
            width, height = (dims[0], dims[1]) if dims and dims[0] and dims[1] else (1000, 1000)
            
            # Get all face embeddings for this media
            cur = conn.execute(
                "SELECT bbox, confidence FROM face_embeddings WHERE media_id = ? AND confidence > 0 ORDER BY confidence DESC",
                (media_id,)
            )
            rows = cur.fetchall()
            
            faces = []
            for idx, row in enumerate(rows):
                bbox_json = row[0]
                confidence = row[1] or 0.9
                
                try:
                    bbox = json.loads(bbox_json) if bbox_json else None
                except:
                    bbox = None
                
                if not bbox or len(bbox) != 4:
                    continue
                
                # bbox is in pixel coordinates [x1, y1, x2, y2]
                # Convert to normalized coordinates [0, 1]
                x1, y1, x2, y2 = bbox
                norm_bbox = [
                    max(0.0, min(1.0, x1 / width)),
                    max(0.0, min(1.0, y1 / height)),
                    max(0.0, min(1.0, x2 / width)),
                    max(0.0, min(1.0, y2 / height)),
                ]
                
                faces.append({
                    "bbox": norm_bbox,
                    "confidence": float(confidence),
                    "index": idx,
                })
            
            return faces
    except Exception as e:
        print(f"[API_ERROR] Failed to get media faces: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/media/face-crop/{media_id}")
async def serve_face_crop(media_id: int):
    """Serve a cropped face image from a media file using its bounding box."""
    from PIL import Image
    
    with get_db() as conn:
        # Get the media file path
        cur = conn.execute("SELECT path FROM media_files WHERE id = ?", (media_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Media not found")
        
        file_path = row[0]
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found on disk")
        
        # Get the face bbox for this media
        cur = conn.execute("SELECT bbox FROM face_embeddings WHERE media_id = ? LIMIT 1", (media_id,))
        bbox_row = cur.fetchone()
        if not bbox_row or not bbox_row[0]:
            # No face found, serve thumbnail instead
            return await serve_thumbnail(media_id, size=300)
        
        try:
            bbox = json.loads(bbox_row[0])
            if not bbox or len(bbox) < 4:
                # Invalid bbox, serve thumbnail instead
                return await serve_thumbnail(media_id, size=300)
            
            # Open image and crop to face
            img = Image.open(file_path)
            width, height = img.size
            
            # bbox is [x1, y1, x2, y2] in normalized coordinates (0-1)
            x1 = int(bbox[0] * width)
            y1 = int(bbox[1] * height)
            x2 = int(bbox[2] * width)
            y2 = int(bbox[3] * height)
            
            # Add padding around face (20% expansion)
            pad_x = int((x2 - x1) * 0.2)
            pad_y = int((y2 - y1) * 0.2)
            x1 = max(0, x1 - pad_x)
            y1 = max(0, y1 - pad_y)
            x2 = min(width, x2 + pad_x)
            y2 = min(height, y2 + pad_y)
            
            # Crop to square (for circular display)
            crop_size = min(x2 - x1, y2 - y1)
            center_x = (x1 + x2) // 2
            center_y = (y1 + y2) // 2
            x1 = max(0, center_x - crop_size // 2)
            y1 = max(0, center_y - crop_size // 2)
            x2 = min(width, x1 + crop_size)
            y2 = min(height, y1 + crop_size)
            
            cropped = img.crop((x1, y1, x2, y2))
            
            # Convert RGBA to RGB if needed
            if cropped.mode in ('RGBA', 'LA'):
                rgb_img = Image.new('RGB', cropped.size, (255, 255, 255))
                rgb_img.paste(cropped, mask=cropped.split()[-1] if cropped.mode == 'RGBA' else None)
                cropped = rgb_img
            
            # Resize to 256x256 for consistent face thumbnails
            cropped.thumbnail((256, 256), Image.Resampling.LANCZOS)
            
            # Return as in-memory JPEG
            from io import BytesIO
            img_bytes = BytesIO()
            cropped.save(img_bytes, format='JPEG', quality=85, optimize=True)
            img_bytes.seek(0)
            
            return FileResponse(img_bytes, media_type="image/jpeg")
        except Exception as e:
            print(f"[FACE_CROP] Failed to crop face for media {media_id}: {str(e)}")
            # Fallback: serve thumbnail
            return await serve_thumbnail(media_id, size=300)


@app.post("/api/media/upload")
async def upload_media_file(file: UploadFile = File(...)):
    """
    Upload a media file and add it to the database.
    Processes the image for face detection and adds to the search index.
    """
    check_read_only()  # Prevent uploads in demo mode
    import tempfile
    import shutil
    from PIL import Image
    
    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Only image files are supported")
        
        # Get upload directory
        cfg = load_config()
        upload_dir = os.path.join(cfg.get('cache_dir', './cache'), 'uploads')
        os.makedirs(upload_dir, exist_ok=True)
        
        # Save uploaded file with timestamp
        timestamp = int(time.time() * 1000)
        file_ext = os.path.splitext(file.filename)[1] or '.jpg'
        file_path = os.path.join(upload_dir, f"uploaded_{timestamp}{file_ext}")
        
        # Write file to disk
        with open(file_path, 'wb') as f:
            content = await file.read()
            f.write(content)
        
        # Extract basic image info
        try:
            img = Image.open(file_path)
            width, height = img.size
        except:
            width = height = None
        
        # Process file and add to database
        result = await process_single(
            file_path, 
            is_symlink=False, 
            root_path=upload_dir
        )
        
        # Get the media ID that was created
        with get_db() as conn:
            cur = conn.execute(
                "SELECT id FROM media_files WHERE path = ? ORDER BY id DESC LIMIT 1",
                (file_path,)
            )
            row = cur.fetchone()
            media_id = row[0] if row else None
        
        if not media_id:
            raise HTTPException(status_code=500, detail="Failed to create media record")
        
        # Generate thumbnail
        thumb_dir = os.path.join(cfg.get('cache_dir', './cache'), 'thumbnails')
        os.makedirs(thumb_dir, exist_ok=True)
        thumb_path = os.path.join(thumb_dir, f'{media_id}.jpg')
        os.makedirs(os.path.dirname(thumb_path), exist_ok=True)
        
        try:
            img = Image.open(file_path)
            img.thumbnail((300, 300), Image.Resampling.LANCZOS)
            img.save(thumb_path, 'JPEG', quality=85)
        except:
            thumb_path = None
        
        return {
            "success": True,
            "media_id": media_id,
            "file_path": file_path,
            "thumbnail": f"/api/media/file/{media_id}" if thumb_path else None,
            "width": width,
            "height": height
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[UPLOAD_ERROR] Failed to upload file {file.filename}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.get("/api/search")
async def search_media(
    q: str = Query(""),
    confidence: float = 0.15,
    offset: int = Query(0),
    limit: int = Query(50),
    top_k: int = Query(None),  # Backwards compatibility with old API
    file_types: str = Query(""),  # Comma-separated file types, e.g. ".jpg,.png,.pdf"
    silo_name: str = Query(None),  # CRITICAL: Silo must be explicitly specified to prevent data bleeding
):
    """Search for media with QUERY-SPECIFIC feedback tracking.
    Returns confirmed results first for THIS query, then other results, excluding rejected.
    Pagination with offset/limit for loading more results.
    
    SECURITY: silo_name parameter is CRITICAL to ensure queries stay within a single silo.
    
    Args:
        file_types: Comma-separated list of file extensions to include in search (e.g. ".jpg,.png,.pdf")
                   Empty string means include all types
        silo_name: The silo to search within (uses active silo if not provided)
        limit: Number of results to return (default 50), or use 'top_k' for backwards compatibility
    """
    # Support both 'limit' and 'top_k' for backwards compatibility
    actual_limit = top_k if top_k is not None else limit
    
    # CRITICAL SECURITY: Validate and set silo context
    if not silo_name:
        # Fall back to active silo if not provided
        from .silo_manager import SiloManager
        active_silo = SiloManager.get_active_silo()
        if active_silo:
            silo_name = active_silo.get('name', 'default')
        else:
            silo_name = 'default'
    
    _set_processing_silo(silo_name)
    print(f"[SEARCH] Silo: {silo_name}, Query: '{q}', confidence threshold: {confidence}, offset: {offset}, limit: {actual_limit}, file_types: '{file_types}'")
    if not q.strip():
        print("[SEARCH] Empty query string, returning []")
        return []

    # Parse file_types filter
    file_type_filter = set()
    if file_types.strip():
        file_type_filter = {ft.strip().lower() for ft in file_types.split(',')}
        print(f"[SEARCH] File type filter: {file_type_filter}")

    # Load query-specific feedback from search_feedback table
    # This ensures confirmations only apply to the query they were made for
    with get_db() as conn:
        # Get IDs confirmed for THIS specific query
        confirmed_cur = conn.execute(
            "SELECT DISTINCT media_id FROM search_feedback WHERE query = ? AND feedback = 'confirmed'",
            (q,),
        )
        confirmed_ids = {row[0] for row in confirmed_cur.fetchall()}

        # Get IDs rejected for THIS specific query
        rejected_cur = conn.execute(
            "SELECT DISTINCT media_id FROM search_feedback WHERE query = ? AND feedback = 'rejected'",
            (q,),
        )
        rejected_ids = {row[0] for row in rejected_cur.fetchall()}

    # Load rotation data - no longer needed from cache since reading from database
    query_vec = get_text_embedding(q)
    
    # If CLIP model failed to load (e.g. OOM on low-memory deployments), return error
    if query_vec is None:
        raise HTTPException(
            status_code=503,
            detail="Search temporarily unavailable - unable to encode query text"
        )
    
    confirmed_results = []
    semantic_results = []
    keyword_results = []
    seen_ids = set()
    seen_paths = set()

    # PHASE 1: CLIP-based semantic search
    if query_vec:
        index, ids = load_index(len(query_vec), silo_name=silo_name)
        
        # If FAISS not available, do manual cosine similarity search from database
        if index is None:
            print("[SEARCH] FAISS not available, using database cosine similarity")
            with get_db() as conn:
                # Fetch all embeddings from database
                cur = conn.execute(
                    "SELECT id, path, type, date_taken, size, width, height, camera, lens, rotation, embedding FROM media_files WHERE embedding IS NOT NULL"
                )
                rows = cur.fetchall()
                
                # Compute cosine similarity manually
                query_array = np.array(query_vec, dtype=np.float32)
                query_norm = query_array / (np.linalg.norm(query_array) + 1e-12)
                
                scores = []
                for row in rows:
                    mid = row[0]
                    embedding_blob = row[10]
                    if embedding_blob:
                        # Deserialize embedding
                        import pickle
                        embedding = pickle.loads(embedding_blob)
                        emb_array = np.array(embedding, dtype=np.float32)
                        emb_norm = emb_array / (np.linalg.norm(emb_array) + 1e-12)
                        
                        # Cosine similarity
                        similarity = np.dot(query_norm, emb_norm)
                        scores.append((mid, float(similarity), row))
                
                # Sort by similarity descending
                scores.sort(key=lambda x: x[1], reverse=True)
                
                # Take top results
                for mid, score, row in scores[:len(ids) if ids else 100]:
                    # Skip if rejected for THIS query
                    if mid in rejected_ids:
                        continue
                    
                    if score < confidence:
                        continue
                    
                    if mid in seen_ids:
                        continue
                    seen_ids.add(mid)
                    
                    path = row[1]
                    if path in seen_paths:
                        continue
                    seen_paths.add(path)
                    
                    result = {
                        "id": mid,
                        "path": path,
                        "type": row[2],
                        "date_taken": row[3],
                        "size": row[4],
                        "width": row[5],
                        "height": row[6],
                        "camera": row[7],
                        "lens": row[8],
                        "rotation": row[9] or 0,
                        "score": score,
                        "confirmed": mid in confirmed_ids,
                    }
                    
                    if mid in confirmed_ids:
                        confirmed_results.append(result)
                    else:
                        semantic_results.append(result)
        else:
            # Use FAISS index
            results = search(index, ids, query_vec, top_k=len(ids))
            if results:
                id_set = tuple(r[0] for r in results)
                with get_db() as conn:
                    placeholders = ','.join('?' * len(id_set))
                    cur = conn.execute(
                        f"SELECT id, path, type, date_taken, size, width, height, camera, lens, rotation FROM media_files WHERE id IN ({placeholders})",
                        id_set,
                    )
                    rows = cur.fetchall()
                    rows_map = {r[0]: r for r in rows}
                
                for mid, score in results:
                    # Skip if rejected for THIS query
                    if mid in rejected_ids:
                        continue
                    
                    if score < confidence:
                        continue
                    
                    if mid in seen_ids:
                        continue
                    
                    if mid in rows_map:
                        r = rows_map[mid]
                        is_confirmed = mid in confirmed_ids
                        result_obj = {
                            "id": r[0],
                            "path": r[1],
                            "type": r[2],
                            "date_taken": r[3],
                            "size": r[4],
                            "width": r[5],
                            "height": r[6],
                            "camera": r[7],
                            "lens": r[8],
                            "score": score,
                            "similarity": score,
                            "confirmed_for_query": is_confirmed,
                            "rotation": r[9] or 0,
                        }
                        
                        # Apply file type filter
                        if file_type_filter and r[2].lower() not in file_type_filter:
                            continue
                        
                        # Separate confirmed results to show first
                        if is_confirmed:
                            confirmed_results.append(result_obj)
                        else:
                            semantic_results.append(result_obj)
                        
                        seen_ids.add(mid)

    # PHASE 2: Fallback / hybrid search via SQL (objects, OCR, filename, document text content)
    like_term = f"%{q}%"
    with get_db() as conn:
        cur = conn.execute(
            """
            SELECT DISTINCT media_files.id, media_files.path, media_files.type, media_files.date_taken,
                   media_files.size, media_files.width, media_files.height, media_files.camera, media_files.lens, media_files.rotation
            FROM media_files
            LEFT JOIN ocr_results ON ocr_results.media_id = media_files.id
            LEFT JOIN object_detections od ON od.media_id = media_files.id
            WHERE media_files.path LIKE ?
               OR media_files.objects LIKE ?
               OR media_files.animals LIKE ?
               OR media_files.text_content LIKE ?
               OR ocr_results.text LIKE ?
               OR od.class_name LIKE ?
            ORDER BY media_files.date_taken DESC
            """,
            (like_term, like_term, like_term, like_term, like_term, like_term),
        )
        rows = cur.fetchall()

    for r in rows:
        if r[0] in rejected_ids:
            continue
        if r[0] in seen_ids:
            continue
        
        # Apply file type filter
        if file_type_filter and r[2].lower() not in file_type_filter:
            continue
        
        is_confirmed = r[0] in confirmed_ids
        result_obj = {
            "id": r[0],
            "path": r[1],
            "type": r[2],
            "date_taken": r[3],
            "size": r[4],
            "width": r[5],
            "height": r[6],
            "camera": r[7],
            "lens": r[8],
            "score": 0.0,
            "similarity": 0.0,
            "confirmed_for_query": is_confirmed,
            "rotation": r[9] or 0,
        }
        
        # Separate confirmed results to show first
        if is_confirmed:
            confirmed_results.append(result_obj)
        else:
            keyword_results.append(result_obj)
        
        seen_ids.add(r[0])

    # PHASE 3: Search by cluster names - check if query matches any named people/clusters
    people_results = []
    try:
        from .face_cluster import load_faces_from_db, cluster_faces, apply_labels
        
        # Get clustered faces with labels applied (gives us cluster names)
        faces = load_faces_from_db()
        clusters = cluster_faces(faces)
        clusters = apply_labels(clusters)
        
        query_lower = q.lower().strip()
        print(f"[SEARCH] PHASE 3 - People search for '{q}' (checking {len(clusters)} clusters)")
        
        # Debug: Print all cluster names for comparison
        for i, c in enumerate(clusters[:5]):  # First 5 clusters
            print(f"[SEARCH]   Cluster {i}: label='{c.get('label', 'UNNAMED')}' id={c.get('id', 'NO_ID')} photos={len(c.get('photos', []))}")
        
        # Check if query matches any cluster label (user-assigned name)
        for cluster in clusters:
            cluster_label = cluster.get('label', '').lower()
            cluster_id = cluster.get('id', '')
            
            # Match if query is substring of cluster label (case-insensitive)
            if cluster_label and query_lower and query_lower in cluster_label:
                print(f"[SEARCH]   MATCH! Cluster '{cluster.get('label')}' ({cluster_id}) matches query")
                
                # Get all photos in this cluster (from embeddings)
                # This is the primary source - all faces detected in this cluster's photos
                embedding_photo_ids = set(p.get('media_id') for p in cluster.get('photos', []) if p.get('media_id'))
                
                # Get confirmed_photos if any were manually added
                confirmed_photos = set(cluster.get('confirmed_photos', []))
                
                # Combine all photos from the cluster
                all_photo_ids = embedding_photo_ids | confirmed_photos
                
                print(f"[SEARCH]     Cluster has {len(cluster.get('photos', []))} total entries in photos array")
                print(f"[SEARCH]     Extracted IDs: {len(embedding_photo_ids)} embeddings + {len(confirmed_photos)} confirmed = {len(all_photo_ids)} total")
                
                # Get media file data for these photos
                with get_db() as conn:
                    if all_photo_ids:
                        placeholders = ','.join('?' * len(all_photo_ids))
                        cur = conn.execute(
                            f"SELECT id, path, type, date_taken, size, width, height, camera, lens, rotation FROM media_files WHERE id IN ({placeholders})",
                            tuple(all_photo_ids)
                        )
                        rows = cur.fetchall()
                        
                        print(f"[SEARCH]     Query found {len(rows)} media files from {len(all_photo_ids)} IDs")
                        if rows:
                            print(f"[SEARCH]     First result: id={rows[0][0]} path={rows[0][1]}")
                        
                        for row in rows:
                            if row[0] in seen_ids:
                                print(f"[SEARCH]     Skipping {row[0]} - already seen")
                                continue
                            
                            result_obj = {
                                "id": row[0],
                                "path": row[1],
                                "type": row[2],
                                "date_taken": row[3],
                                "size": row[4],
                                "width": row[5],
                                "height": row[6],
                                "camera": row[7],
                                "lens": row[8],
                                "score": 0.95,  # High score for exact cluster name match
                                "similarity": 0.95,
                                "confirmed_for_query": True,
                                "rotation": row[9] or 0,
                            }
                            people_results.append(result_obj)
                            seen_ids.add(row[0])
    except Exception as e:
        print(f"[SEARCH] Error in people search phase: {e}")
        import traceback
        traceback.print_exc()

    # PHASE 4: Reorder - confirmed first, then people (cluster matches), then semantic, then keywords
    # People/cluster matches should appear before semantic results so named clusters are prioritized
    all_results = confirmed_results + people_results + semantic_results + keyword_results
    paginated_results = all_results[offset : offset + actual_limit]

    result_count = len(paginated_results)
    total_count = len(all_results)
    print(
        f"[SEARCH] Query '{q}': {result_count} results (offset {offset}, total {total_count})"
    )
    
    # Return results with pagination metadata
    return {
        "results": paginated_results,
        "total": total_count,
        "offset": offset,
        "limit": actual_limit,
        "has_more": (offset + actual_limit) < total_count,
    }


@app.get("/api/search/file-types")
async def get_file_types():
    """Get available file type categories for search filtering (all lowercase)."""
    from .indexer import FILE_TYPE_CATEGORIES
    
    return {
        "categories": {
            category: [t.lower() for t in types]
            for category, types in FILE_TYPE_CATEGORIES.items()
        }
    }


@app.post("/api/detect-faces-batch")
async def detect_faces_batch(limit: int = 100, silo_name: str = "bighouse"):
    """Detect and store faces for media files that don't have face data yet.
    Returns count of files processed and faces found."""
    from .face_cluster import detect_faces
    from .indexer import to_blob
    
    global _face_clusters_cache
    
    processed = 0
    faces_found = 0
    
    if silo_name:
        _set_processing_silo(silo_name)
    
    with get_db() as conn:
        # Find images that don't have face_embeddings entries yet (truly unprocessed)
        cur = conn.execute(
            """SELECT mf.id, mf.path FROM media_files mf
               WHERE mf.type IN ('.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp') 
               AND NOT EXISTS (
                   SELECT 1 FROM face_embeddings fe WHERE fe.media_id = mf.id
               )
               LIMIT ?""",
            (limit,)
        )
        rows = cur.fetchall()
        
        for media_id, path in rows:
            try:
                faces = detect_faces([path])
                faces_json = json.dumps([
                    {"bbox": f.bbox, "score": f.score}
                    for f in faces
                ])
                
                # Update faces JSON in media_files
                conn.execute(
                    "UPDATE media_files SET faces = ? WHERE id = ?",
                    (faces_json, media_id)
                )
                
                # Store embeddings in face_embeddings table
                for face in faces:
                    embedding_blob = to_blob(face.embedding)
                    bbox_json = json.dumps(face.bbox)
                    conn.execute(
                        """INSERT OR REPLACE INTO face_embeddings 
                           (media_id, embedding, bbox, confidence, created_at, updated_at)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        (media_id, embedding_blob, bbox_json, face.score, int(time.time()), int(time.time()))
                    )
                
                conn.commit()
                
                processed += 1
                faces_found += len(faces)
            except Exception as e:
                print(f"Error detecting faces in {path}: {e}")
                continue
    
    # Invalidate face clusters cache so new faces are clustered on next request
    if faces_found > 0:
        _face_clusters_cache["data"] = None
        _face_clusters_cache["timestamp"] = 0
        print(f"[FACE_DETECTION] Cleared face clusters cache after detecting {faces_found} new faces")
    
    return {
        "processed": processed,
        "faces_found": faces_found,
        "message": f"Processed {processed} files, found {faces_found} faces"
    }


@app.post("/api/cache/clear-face-clusters")
async def clear_face_clusters_cache(silo_name: Optional[str] = None):
    """Explicitly clear the face clusters cache to force re-clustering on next request."""
    global _face_clusters_cache
    try:
        from .silo_manager import SiloManager
        
        # If no silo_name provided, use active silo
        if not silo_name:
            silo = SiloManager.get_active_silo()
            silo_name = silo.get("name") if silo else None
        
        _face_clusters_cache["data"] = None
        _face_clusters_cache["timestamp"] = 0
        print(f"[CACHE] Face clusters cache cleared for silo: {silo_name}")
        return {"status": "success", "message": "Face clusters cache cleared", "silo": silo_name}
    except Exception as e:
        print(f"[CACHE] Error clearing cache: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/api/people")
async def list_people():
    # Try to load from cache first (populated by worker)
    from app.face_cluster import load_cluster_cache
    cached = load_cluster_cache()
    if cached:
        print(f"[PEOPLE] Loaded {len(cached)} clusters from cache")
        # Filter out hidden people only
        visible_clusters = [c for c in cached if not c.get('hidden', False)]
        print(f"[PEOPLE] Showing {len(visible_clusters)} visible clusters (filtered out {len(cached) - len(visible_clusters)} hidden)")
        return visible_clusters
    
    # Fallback: cluster on-demand if cache doesn't exist
    print(f"[PEOPLE] No cache found, clustering on-demand...")
    faces = load_faces_from_db()
    print(f"[PEOPLE] Loaded {len(faces)} faces from database")
    clusters = cluster_faces(faces)
    print(f"[PEOPLE] Created {len(clusters)} clusters")
    clusters = apply_labels(clusters)
    
    # Filter out hidden people only
    visible_clusters = [c for c in clusters if not c.get('hidden', False)]
    print(f"[PEOPLE] Showing {len(visible_clusters)} visible clusters (filtered out {len(clusters) - len(visible_clusters)} hidden)")
    
    for i, c in enumerate(visible_clusters[:3]):  # Log first 3 clusters
        print(f"[PEOPLE] Cluster {i}: id={c.get('id')}, label={c.get('label')}, sample_media_id={c.get('sample_media_id')}, photos_count={len(c.get('photos', []))}")
    
    return visible_clusters


@app.post("/api/people/{person_id}/name")
async def name_person(person_id: str, request_body: NamePersonRequest = Body(...)):
    # Allow naming people in demo mode to set up demo data
    # check_read_only()
    set_label(person_id, name=request_body.name)
    return {"id": person_id, "name": request_body.name}


@app.post("/api/people/{person_id}/confirm")
async def confirm_person(person_id: str):
    """Mark a person as confirmed (verified by user)."""
    try:
        set_label(person_id, confirmed=True)
        return {"id": person_id, "confirmed": True}
    except Exception as e:
        print(f"Error confirming person {person_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/people/{person_id}/reject")
async def reject_person(person_id: str):
    """Mark a person as rejected (remove from face recognition)."""
    try:
        set_label(person_id, confirmed=False)
        return {"id": person_id, "confirmed": False}
    except Exception as e:
        print(f"Error rejecting person {person_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/people/{person_id}/hide")
async def hide_person(person_id: str, request_body: HidePersonRequest = Body(...)):
    """Hide or unhide a person from the people list."""
    try:
        set_label(person_id, hidden=request_body.hidden)
        return {"id": person_id, "hidden": request_body.hidden}
    except Exception as e:
        print(f"Error hiding/unhiding person {person_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search/{search_query}/approve")
async def approve_search_result(search_query: str, file_id: int = Query(...)):
    """Mark a search result as approved for a SPECIFIC search query.
    This ensures the image is trained to appear first for THIS query,
    but not necessarily for unrelated queries."""
    with get_db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO search_feedback (media_id, query, feedback, created_at)
               VALUES (?, ?, ?, ?)""",
            (file_id, search_query, "confirmed", int(time.time())),
        )
        conn.commit()
    return {"file_id": file_id, "query": search_query, "feedback": "confirmed"}


@app.post("/api/search/{search_query}/reject")
async def reject_search_result(search_query: str, file_id: int = Query(...)):
    """Mark a search result as rejected for a SPECIFIC search query.
    This ensures the image does NOT appear for THIS query,
    but may still appear for other relevant queries."""
    with get_db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO search_feedback (media_id, query, feedback, created_at)
               VALUES (?, ?, ?, ?)""",
            (file_id, search_query, "rejected", int(time.time())),
        )
        conn.commit()
    return {"file_id": file_id, "query": search_query, "feedback": "rejected"}


@app.post("/api/retrain-embeddings")
async def retrain_embeddings():
    """DEPRECATED: Use /api/retraining/full instead."""
    try:
        from .face_cluster import load_faces_from_db, cluster_faces, apply_labels, load_labels
        
        print("[RETRAIN] Starting embedding retraining...")
        faces = load_faces_from_db()
        labels = load_labels()
        clusters = cluster_faces(faces)
        clusters = apply_labels(clusters)
        
        confirmed_people = {
            person_id: label_data for person_id, label_data in labels.items()
            if label_data.get('confirmed', False)
        }
        
        print(f"[RETRAIN] Found {len(confirmed_people)} confirmed people")
        print(f"[RETRAIN] Recomputed {len(clusters)} face clusters")
        
        return {
            "status": "success",
            "clusters_count": len(clusters),
            "confirmed_people": len(confirmed_people),
            "message": "Embeddings retrained and clusters recomputed based on user feedback"
        }
    except Exception as e:
        print(f"[RETRAIN] Error: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}


# === NEW RETRAINING ENDPOINTS ===

@app.get("/api/retraining/status")
async def get_retraining_status():
    """Get retraining system status and model version history."""
    try:
        from .face_retraining import get_retraining_status
        return get_retraining_status()
    except Exception as e:
        print(f"[RETRAIN] Error getting status: {e}")
        return {
            "status": "error",
            "message": str(e),
            "total_versions": 0,
            "current_version": 0
        }


@app.post("/api/retraining/full")
async def start_full_retraining(background_tasks: BackgroundTasks):
    """
    Start complete model retraining pipeline in the background.
    
    This endpoint returns immediately and starts the retraining as a background task.
    Use /api/retraining/progress to check progress.
    
    Process:
    1. Extract face crops from confirmed clusters
    2. Compute clustering quality metrics
    3. Regenerate embeddings for all media
    4. Recalculate face clusters
    5. Save new model version
    
    This is a long-running operation (10-30 minutes for large photo libraries).
    """
    # Check if retraining is already running
    if _retraining_state["is_running"]:
        raise HTTPException(status_code=400, detail="Retraining is already in progress")
    
    # Add the retraining task to background tasks
    background_tasks.add_task(_run_retraining_background)
    
    return {
        "status": "queued",
        "message": "Retraining started in background. Check /api/retraining/progress for status."
    }


def _update_progress(progress: int, message: str):
    """Update retraining progress state"""
    global _retraining_state
    _retraining_state["progress"] = progress
    _retraining_state["message"] = message
    print(f"[RETRAIN] {progress}% - {message}")


def _run_retraining_background():
    """Run retraining in background with progress tracking"""
    global _retraining_state
    
    _retraining_state["is_running"] = True
    _retraining_state["progress"] = 0
    _retraining_state["message"] = "Starting retraining..."
    _retraining_state["error"] = None
    _retraining_state["start_time"] = time.time()
    
    try:
        from .face_retraining import run_full_retraining
        
        print("[RETRAIN] Starting full retraining pipeline in background...")
        
        # Define progress callback
        def progress_callback(message: str, progress: int):
            _update_progress(progress, message)
        
        # Run the retraining
        success, metrics = run_full_retraining(progress_callback=progress_callback)
        
        if success and metrics:
            _retraining_state["progress"] = 100
            _retraining_state["message"] = "Retraining completed successfully!"
            _retraining_state["metrics"] = {
                "model_version": metrics.model_version,
                "training_samples": metrics.num_training_samples,
                "confirmed_people": metrics.num_confirmed_people,
                "cluster_count": metrics.cluster_count,
                "embeddings_regenerated": metrics.embeddings_regenerated,
                "avg_intra_cluster_distance": metrics.avg_intra_cluster_distance,
                "avg_inter_cluster_distance": metrics.avg_inter_cluster_distance,
                "timestamp": metrics.timestamp
            }
            print("[RETRAIN] Retraining completed successfully!")
        else:
            _retraining_state["error"] = "Retraining failed - check logs for details"
            _retraining_state["message"] = "Retraining failed"
            print("[RETRAIN] Retraining failed")
    
    except Exception as e:
        print(f"[RETRAIN] Error during background retraining: {e}")
        import traceback
        traceback.print_exc()
        _retraining_state["error"] = str(e)
        _retraining_state["message"] = f"Error: {str(e)}"
    
    finally:
        _retraining_state["is_running"] = False


@app.get("/api/retraining/progress")
async def get_retraining_progress():
    """Get current retraining progress"""
    return {
        "is_running": _retraining_state["is_running"],
        "progress": _retraining_state["progress"],
        "message": _retraining_state["message"],
        "error": _retraining_state["error"],
        "metrics": _retraining_state["metrics"],
        "elapsed_time": time.time() - _retraining_state["start_time"] if _retraining_state["start_time"] else None
    }


@app.get("/api/retraining/faces-for-training")
async def get_faces_for_training():
    """
    Preview faces that will be used for retraining.
    Returns confirmed person clusters and their face counts.
    """
    try:
        from .face_retraining import extract_face_crops
        from .face_cluster import apply_labels, cluster_faces, load_faces_from_db, load_labels
        
        # Get confirmed clusters
        faces = load_faces_from_db()
        clusters = cluster_faces(faces)
        clusters = apply_labels(clusters)
        
        labels = load_labels()
        confirmed_ids = {
            person_id for person_id, label_data in labels.items()
            if label_data.get('confirmed', False)
        }
        
        training_data = []
        for cluster in clusters:
            if cluster['id'] in confirmed_ids:
                training_data.append({
                    "person_id": cluster['id'],
                    "person_label": cluster.get('label', 'unknown'),
                    "face_count": len(cluster.get('photos', [])),
                    "sample_media_id": cluster.get('sample_media_id'),
                    "avg_confidence": sum(
                        p.get('confidence', 0) for p in cluster.get('photos', [])
                    ) / len(cluster.get('photos', [])) if cluster.get('photos') else 0
                })
        
        total_samples = sum(t['face_count'] for t in training_data)
        
        return {
            "status": "success",
            "ready_for_training": len(training_data) > 0,
            "confirmed_people_count": len(training_data),
            "total_training_samples": total_samples,
            "minimum_required_samples": 5,
            "people": sorted(training_data, key=lambda x: x['face_count'], reverse=True)
        }
    except Exception as e:
        print(f"[RETRAIN] Error getting training data preview: {e}")
        return {
            "status": "error",
            "message": str(e),
            "ready_for_training": False
        }


@app.get("/api/retraining/quality-metrics")
async def get_cluster_quality_metrics():
    """
    Get clustering quality metrics from the most recent model.
    Shows how well face clusters are separated.
    """
    try:
        from .face_retraining import get_retraining_status
        
        status = get_retraining_status()
        versions = status.get('versions', [])
        
        if not versions:
            return {
                "status": "no_data",
                "message": "No retraining has been performed yet"
            }
        
        latest = versions[-1]
        metrics = latest.get('metrics', {})
        
        return {
            "status": "success",
            "model_version": latest.get('version'),
            "timestamp": latest.get('timestamp'),
            "quality_metrics": {
                "intra_cluster_distance": metrics.get('intra_cluster_distance'),
                "inter_cluster_distance": metrics.get('inter_cluster_distance'),
                "silhouette_score": metrics.get('silhouette_score'),
                "training_samples": latest.get('training_samples'),
                "confirmed_people": latest.get('confirmed_people')
            },
            "interpretation": {
                "lower_intra_cluster_distance_is_better": True,
                "higher_inter_cluster_distance_is_better": True,
                "higher_silhouette_score_is_better": True
            }
        }
    except Exception as e:
        print(f"[RETRAIN] Error getting quality metrics: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


@app.get("/api/people/{person_id}/photos")
async def get_person_photos(person_id: str):
    """Get all photos for a specific person with confidence scores."""
    faces = load_faces_from_db()
    clusters = cluster_faces(faces)
    clusters = apply_labels(clusters)
    
    for cluster in clusters:
        if cluster["id"] == person_id:
            return {
                "id": person_id,
                "label": cluster.get("label", "unknown"),
                "photos": cluster.get("photos", []),
                "count": cluster.get("count", 0),
            }
    
    return {"id": person_id, "label": "unknown", "photos": [], "count": 0}


@app.post("/api/media/{media_id}/face-match")
async def set_face_match(media_id: int, person_id: str, include: bool = True):
    """Mark a photo as matching or not matching a person."""
    with get_db() as conn:
        # For now, this is a simple implementation
        # In a full system, you'd track this relationship in the database
        # This could be used to refine clustering or mark false positives
        conn.execute(
            """
            INSERT OR REPLACE INTO search_feedback (media_id, query, feedback, label, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            """,
            (
                media_id,
                f"face_match:{person_id}",
                "confirmed" if include else "denied",
                person_id,
            ),
        )
        conn.commit()
    
    return {"media_id": media_id, "person_id": person_id, "included": include}


@app.get("/api/animals")
async def list_animals():
    from .face_cluster import load_animals_from_db, cluster_animals, apply_animal_labels
    animals = load_animals_from_db()
    clusters = cluster_animals(animals)
    clusters = apply_animal_labels(clusters)
    return clusters


@app.post("/api/animals/{animal_id}/name")
async def name_animal(animal_id: str, request: NamePersonRequest = Body(...)):
    check_read_only()  # Prevent naming animals in demo mode
    from .face_cluster import set_animal_label
    try:
        set_animal_label(animal_id, name=request.name)
        return {"id": animal_id, "name": request.name, "success": True}
    except Exception as e:
        import traceback
        print(f"[API_ERROR] Failed to rename animal {animal_id}: {e}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "success": False}
        )


@app.post("/api/animals/{animal_id}/hide")
async def hide_animal(animal_id: str, request: HidePersonRequest = Body(...)):
    from .face_cluster import set_animal_label
    try:
        set_animal_label(animal_id, hidden=request.hidden)
        return {"id": animal_id, "hidden": request.hidden, "success": True}
    except Exception as e:
        import traceback
        print(f"[API_ERROR] Failed to hide animal {animal_id}: {e}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "success": False}
        )


@app.get("/api/uncertain-detections")
async def list_uncertain_detections(
    detection_type: Optional[str] = None,
    reviewed: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
):
    """
    List uncertain detections that need user review.
    Users should confirm whether these detections are correct.
    """
    with get_db() as conn:
        query = "SELECT id, media_id, detection_type, class_name, confidence, bbox, reviewed, approved, user_label FROM uncertain_detections"
        params = []
        
        if detection_type:
            query += " AND detection_type = ?"
            params.append(detection_type)
        
        if reviewed is not None:
            query += " AND reviewed = ?"
            params.append(1 if reviewed else 0)
        else:
            query += " AND reviewed = 0"  # Default: show unreviewed only
        
        query += " ORDER BY confidence ASC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        cur = conn.execute(query, params)
        rows = cur.fetchall()
        
        result = []
        for r in rows:
            # Get media path
            media_cur = conn.execute("SELECT path FROM media_files WHERE id = ?", (r[1],))
            media_row = media_cur.fetchone()
            media_path = media_row[0] if media_row else None
            
            bbox = json.loads(r[5]) if r[5] else None
            result.append({
                "id": r[0],
                "media_id": r[1],
                "detection_type": r[2],
                "class_name": r[3],
                "confidence": r[4],
                "bbox": bbox,
                "reviewed": bool(r[6]),
                "approved": bool(r[7]) if r[7] is not None else None,
                "user_label": r[8],
                "media_path": media_path,
            })
        return result


@app.post("/api/uncertain-detections/{detection_id}/review")
async def review_detection(
    detection_id: int,
    approved: bool,
    user_label: Optional[str] = None,
):
    """
    Review an uncertain detection.
    
    Args:
        detection_id: ID of the uncertain detection
        approved: Whether the detection should be approved
        user_label: Optional custom label from the user
    """
    with get_db() as conn:
        conn.execute(
            """
            UPDATE uncertain_detections 
            SET reviewed = 1, approved = ?, user_label = ?, updated_at = ?
            WHERE id = ?
            """,
            (1 if approved else 0, user_label, int(time.time()), detection_id),
        )
        conn.commit()
        
        # Get the updated detection
        cur = conn.execute(
            "SELECT id, media_id, detection_type, class_name, confidence, bbox, reviewed, approved, user_label FROM uncertain_detections WHERE id = ?",
            (detection_id,),
        )
        r = cur.fetchone()
        
        media_cur = conn.execute("SELECT path FROM media_files WHERE id = ?", (r[1],))
        media_row = media_cur.fetchone()
        
        bbox = json.loads(r[5]) if r[5] else None
        return {
            "id": r[0],
            "media_id": r[1],
            "detection_type": r[2],
            "class_name": r[3],
            "confidence": r[4],
            "bbox": bbox,
            "reviewed": bool(r[6]),
            "approved": bool(r[7]) if r[7] is not None else None,
            "user_label": r[8],
            "media_path": media_row[0] if media_row else None,
        }


@app.post("/api/uncertain-detections/batch-review")
async def batch_review_detections(detections: List[dict]):
    """
    Review multiple detections at once.
    
    Args:
        detections: List of {id, approved, user_label}
    """
    with get_db() as conn:
        for det in detections:
            conn.execute(
                """
                UPDATE uncertain_detections 
                SET reviewed = 1, approved = ?, user_label = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    1 if det.get("approved") else 0,
                    det.get("user_label"),
                    int(time.time()),
                    det["id"],
                ),
            )
        conn.commit()
    
    return {"reviewed": len(detections)}


@app.get("/api/uncertain-detections/count")
async def count_uncertain_detections():
    """Get count of unreviewed detections by type."""
    with get_db() as conn:
        # Get count by detection type
        cur = conn.execute(
            """
            SELECT detection_type, COUNT(*) as count 
            FROM uncertain_detections 
            WHERE reviewed = 0 
            GROUP BY detection_type
            """
        )
        result = {row[0]: row[1] for row in cur.fetchall()}
        
        # Get total unreviewed count
        total_cur = conn.execute(
            "SELECT COUNT(*) FROM uncertain_detections WHERE reviewed = 0"
        )
        total = total_cur.fetchone()[0]
        
        return {
            "total": total,
            "by_type": result,
        }


# ============================================================================
# User Configuration & Metadata Management
# ============================================================================

@app.get("/api/config")
async def get_user_config(silo_name: str = Query(None)):
    """Get current user configuration.
    
    CRITICAL SECURITY: Returns config for specific silo only.
    """
    if silo_name:
        _set_processing_silo(silo_name)
    
    config_mgr = get_config_manager(silo_name)
    return {
        "sort_by": config_mgr.config.sort_by,
        "sort_order": config_mgr.config.sort_order,
        "items_per_page": config_mgr.config.items_per_page,
        "auto_tag_confidence": config_mgr.config.auto_tag_confidence,
        "require_review_below": config_mgr.config.require_review_below,
    }


@app.post("/api/config")
async def update_user_config(settings: Dict[str, Any], silo_name: str = Query(None)):
    """Update user configuration.
    
    CRITICAL SECURITY: Updates config for specific silo only.
    """
    check_read_only()  # Prevent config changes in demo mode
    if silo_name:
        _set_processing_silo(silo_name)
    
    config_mgr = get_config_manager(silo_name)
    
    if "sort_by" in settings:
        config_mgr.config.sort_by = settings["sort_by"]
    if "sort_order" in settings:
        config_mgr.config.sort_order = settings["sort_order"]
    if "items_per_page" in settings:
        config_mgr.config.items_per_page = settings["items_per_page"]
    if "auto_tag_confidence" in settings:
        config_mgr.config.auto_tag_confidence = settings["auto_tag_confidence"]
    
    config_mgr.save()
    return {"status": "ok"}


# ============================================================================
# Face Label Management
# ============================================================================

@app.post("/api/labels/face/{person_id}")
async def set_face_label(person_id: str, name: str, aliases: List[str] = None, silo_name: str = Query(None)):
    """Set or update face label.
    
    CRITICAL SECURITY: Sets label in specific silo only.
    """
    if silo_name:
        _set_processing_silo(silo_name)
    
    config_mgr = get_config_manager(silo_name)
    label = config_mgr.add_face_label(person_id, name, aliases or [])
    return {
        "id": label.id,
        "name": label.name,
        "aliases": label.aliases,
    }


@app.get("/api/labels/face/{person_id}")
async def get_face_label(person_id: str, silo_name: str = Query(None)):
    """Get face label.
    
    CRITICAL SECURITY: Gets label from specific silo only.
    """
    if silo_name:
        _set_processing_silo(silo_name)
    
    config_mgr = get_config_manager(silo_name)
    label = config_mgr.get_face_label(person_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    return {
        "id": label.id,
        "name": label.name,
        "aliases": label.aliases,
    }


@app.get("/api/labels/face")
async def search_face_labels(q: str = Query(""), silo_name: str = Query(None)):
    """Search face labels.
    
    CRITICAL SECURITY: Searches labels in specific silo only.
    """
    if silo_name:
        _set_processing_silo(silo_name)
    
    config_mgr = get_config_manager(silo_name)
    if not q.strip():
        labels = list(config_mgr.config.face_labels.values())
    else:
        labels = config_mgr.search_face_label(q)
    
    return [
        {
            "id": label.id,
            "name": label.name,
            "aliases": label.aliases,
        }
        for label in labels
    ]


# ============================================================================
# Animal Label Management
# ============================================================================

@app.post("/api/labels/animal/{animal_id}")
async def set_animal_label_endpoint(
    animal_id: str,
    request: AnimalLabelRequest = Body(...),
    silo_name: str = Query(None),
):
    """Set or update animal label.
    
    CRITICAL SECURITY: Sets label in specific silo only.
    """
    try:
        if silo_name:
            _set_processing_silo(silo_name)
        
        config_mgr = get_config_manager(silo_name)
        label = config_mgr.add_animal_label(
            animal_id, request.species, request.name, request.breed
        )
        return {
            "id": label.id,
            "species": label.species,
            "name": label.name,
            "breed": label.breed,
            "success": True,
        }
    except Exception as e:
        import traceback
        print(f"[API_ERROR] Failed to set animal label {animal_id}: {e}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "success": False}
        )


@app.get("/api/labels/animal")
async def search_animal_labels(q: str = Query(""), silo_name: str = Query(None)):
    """Search animal labels.
    
    CRITICAL SECURITY: Searches labels in specific silo only.
    """
    if silo_name:
        _set_processing_silo(silo_name)
    
    config_mgr = get_config_manager(silo_name)
    if not q.strip():
        labels = list(config_mgr.config.animal_labels.values())
    else:
        labels = config_mgr.search_animal_label(q)
    
    return [
        {
            "id": label.id,
            "species": label.species,
            "name": label.name,
            "breed": label.breed,
        }
        for label in labels
    ]


# ============================================================================
# Advanced Search & Filtering
# ============================================================================

@app.get("/api/media/search")
async def advanced_search(
    q: str = Query(""),
    file_type: Optional[str] = None,
    min_size: Optional[int] = None,
    max_size: Optional[int] = None,
    date_from: Optional[int] = None,
    date_to: Optional[int] = None,
    contains_person: Optional[str] = None,
    contains_animal: Optional[str] = None,
    sort_by: str = "date_taken",
    sort_order: str = "desc",
    limit: int = 100,
    offset: int = 0,
):
    """
    Advanced search with multiple filters.
    Search by: filename, text content, people, animals, size, date, type.
    """
    with get_db() as conn:
        query = "SELECT id, path, type, date_taken, size, width, height, camera, lens FROM media_files WHERE 1=1"
        params = []
        
        # Full-text search on filename
        if q.strip():
            config_mgr = get_config_manager(None)  # Search prefs can use active silo
            config_mgr.add_recent_search(q)
            
            query += " AND (path LIKE ? OR path LIKE ?)"
            params.extend([f"%{q}%", f"%{q.lower()}%"])
        
        # File type filter
        if file_type:
            query += " AND type = ?"
            params.append(file_type)
        
        # Size filter
        if min_size is not None:
            query += " AND size >= ?"
            params.append(min_size)
        if max_size is not None:
            query += " AND size <= ?"
            params.append(max_size)
        
        # Date range filter
        if date_from is not None:
            query += " AND date_taken >= ?"
            params.append(date_from)
        if date_to is not None:
            query += " AND date_taken <= ?"
            params.append(date_to)
        
        # Person filter (from user labels)
        if contains_person:
            config_mgr = get_config_manager(None)  # Use active silo
            label = config_mgr.get_face_label(contains_person)
            if label:
                # Would need additional logic to link faces to media
                pass
        
        # Animal filter
        if contains_animal:
            query += " AND animals LIKE ?"
            params.append(f"%{contains_animal}%")
        
        # Sorting
        sort_column = "date_taken" if sort_by == "date_taken" else sort_by
        if sort_column in ["date_taken", "size", "path"]:
            sort_direction = "DESC" if sort_order == "desc" else "ASC"
            query += f" ORDER BY {sort_column} {sort_direction}"
        
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        cur = conn.execute(query, params)
        rows = cur.fetchall()
        
        results = [
            {
                "id": r[0],
                "path": r[1],
                "type": r[2],
                "date_taken": r[3],
                "size": r[4],
                "width": r[5],
                "height": r[6],
                "camera": r[7],
                "lens": r[8],
            }
            for r in rows
        ]
        
        return results


@app.get("/api/media/filter-options")
async def get_filter_options(silo_name: str = Query(None)):
    """Get available filter options.
    
    CRITICAL SECURITY: Returns options for specific silo only.
    """
    if silo_name:
        _set_processing_silo(silo_name)
    
    with get_db() as conn:
        # Get available file types
        cur = conn.execute(
            "SELECT DISTINCT type FROM media_files WHERE type IS NOT NULL"
        )
        types = [row[0] for row in cur.fetchall()]
        
        # Get date range
        cur = conn.execute(
            "SELECT MIN(date_taken), MAX(date_taken) FROM media_files WHERE date_taken IS NOT NULL"
        )
        date_range = cur.fetchone()
        
        # Get size range
        cur = conn.execute(
            "SELECT MIN(size), MAX(size) FROM media_files WHERE size IS NOT NULL"
        )
        size_range = cur.fetchone()
    
    config_mgr = get_config_manager(silo_name)
    face_labels = [
        {"id": l.id, "name": l.name}
        for l in config_mgr.config.face_labels.values()
    ]
    animal_labels = [
        {"id": l.id, "species": l.species, "name": l.name}
        for l in config_mgr.config.animal_labels.values()
    ]
    
    return {
        "file_types": types,
        "date_range": {
            "min": date_range[0],
            "max": date_range[1],
        } if date_range[0] else None,
        "size_range": {
            "min": size_range[0],
            "max": size_range[1],
        } if size_range[0] else None,
        "people": face_labels,
        "animals": animal_labels,
    }


# ============================================================================
# File Organization & Management
# ============================================================================

@app.post("/api/media/{media_id}/move")
async def move_file(media_id: int, destination: str):
    """Move a file to a new location."""
    with get_db() as conn:
        cur = conn.execute("SELECT path FROM media_files WHERE id = ?", (media_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="File not found")
        
        source_path = row[0]
        
        # Prevent directory traversal
        if ".." in destination:
            raise HTTPException(status_code=400, detail="Invalid destination")
        
        try:
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            os.rename(source_path, destination)
            
            # Update database
            conn.execute(
                "UPDATE media_files SET path = ?, updated_at = ? WHERE id = ?",
                (destination, int(time.time()), media_id)
            )
            conn.commit()
            
            return {"status": "ok", "new_path": destination}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/media/{media_id}")
async def delete_file(media_id: int):
    """Delete a file (moves to trash or deletes)."""
    check_read_only()  # Prevent deletions in demo mode
    with get_db() as conn:
        cur = conn.execute("SELECT path FROM media_files WHERE id = ?", (media_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_path = row[0]
        
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
            
            # Remove from database
            conn.execute("DELETE FROM media_files WHERE id = ?", (media_id,))
            conn.execute("DELETE FROM uncertain_detections WHERE media_id = ?", (media_id,))
            conn.commit()
            
            return {"status": "deleted"}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/search/feedback")
async def submit_search_feedback(media_id: int, query: str, feedback: str, label: Optional[str] = None):
    """
    Submit feedback on search results to improve model training.
    
    feedback: "confirmed" (image matches query), "denied" (image doesn't match), "uncertain"
    label: Optional custom label for the image
    """
    with get_db() as conn:
        # Store feedback for future model training
        conn.execute(
            """INSERT INTO search_feedback (media_id, query, feedback, label, created_at)
               VALUES (?, ?, ?, ?, datetime('now'))""",
            (media_id, query, feedback, label)
        )
        conn.commit()
    return {"status": "feedback_recorded", "media_id": media_id, "feedback": feedback}


@app.get("/api/status/has-indexed-files")
async def has_indexed_files():
    """Check if the database has any indexed files (used to determine if setup wizard should show)."""
    with get_db() as conn:
        count_cur = conn.execute("SELECT COUNT(*) FROM media_files")
        count = count_cur.fetchone()[0]
    return {"has_indexed_files": count > 0, "file_count": count}


@app.get("/api/media/stats")
async def get_media_stats(silo_name: str = Query(None)):
    """Get statistics about the media library.
    
    CRITICAL SECURITY: silo_name parameter ensures stats are from the correct silo only.
    """
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
        print(f"[STATS] Set silo context to: {silo_name}", flush=True)
    else:
        print(f"[STATS] No silo_name provided, using current silo", flush=True)
    
    # Verify which database we're using
    from .db import get_db_path
    db_path = get_db_path()
    print(f"[STATS] Using database: {db_path}", flush=True)
    
    with get_db() as conn:
        # Total files
        total_cur = conn.execute("SELECT COUNT(*) FROM media_files")
        total = total_cur.fetchone()[0]
        print(f"[STATS] Total files found: {total}", flush=True)
        
        # By type
        type_cur = conn.execute(
            "SELECT type, COUNT(*) FROM media_files GROUP BY type"
        )
        by_type = {row[0]: row[1] for row in type_cur.fetchall()}
        
        # Total size
        size_cur = conn.execute("SELECT SUM(size) FROM media_files")
        total_size = size_cur.fetchone()[0] or 0
        
        # With people - count distinct media that have face embeddings with actual embedding data (not no-faces markers)
        people_cur = conn.execute(
            "SELECT COUNT(DISTINCT media_id) FROM face_embeddings WHERE embedding IS NOT NULL AND LENGTH(embedding) > 0"
        )
        with_people = people_cur.fetchone()[0]
        print(f"[STATS] People found: {with_people}", flush=True)
        
        # With animals
        animals_cur = conn.execute(
            "SELECT COUNT(*) FROM media_files WHERE animals IS NOT NULL AND animals != '[]'"
        )
        with_animals = animals_cur.fetchone()[0]
        print(f"[STATS] Animals found: {with_animals}", flush=True)
    
    return {
        "total_files": total,
        "by_type": by_type,
        "total_size_bytes": total_size,
        "with_people": with_people,
        "with_animals": with_animals,
    }


# ============================================================================
# NEW FACE CLUSTER API ENDPOINTS FOR GOOGLE PHOTOS-STYLE PEOPLE TAB
# ============================================================================

class FaceClusterResponse(BaseModel):
    id: str
    name: str
    primary_thumbnail: str
    photo_count: int
    confidence_score: float
    is_hidden: bool
    last_updated: int
    rotation_override: int = 0  # 0, 90, 180, 270


class ClusterPhotoResponse(BaseModel):
    id: str
    image_path: str
    thumbnail: str
    date_taken: Optional[int]
    similarity_score: float
    is_confirmed: bool


class MergeRequest(BaseModel):
    cluster_id_1: str
    cluster_id_2: str
    name_to_keep: Optional[str] = None


class SetProfilePicRequest(BaseModel):
    media_id: int


class MovePhotoRequest(BaseModel):
    media_id: int
    from_cluster_id: str
    to_cluster_id: Optional[str] = None


class AddToMultipleClustersRequest(BaseModel):
    media_id: int
    source_cluster_id: str
    target_clusters: List[str]


# Global state for clustering progress tracking
_clustering_state = {
    "is_running": False,
    "progress": 0,
    "total": 0,
    "logs": [],
    "current_status": "idle",
}


def _add_cluster_log(message: str):
    """Add a log message to the clustering progress."""
    global _clustering_state
    timestamp = time.strftime("%H:%M:%S")
    log_entry = f"[{timestamp}] {message}"
    _clustering_state["logs"].append(log_entry)
    # Keep only last 50 logs to avoid memory bloat
    if len(_clustering_state["logs"]) > 50:
        _clustering_state["logs"] = _clustering_state["logs"][-50:]
    print(log_entry)


@app.post("/api/faces/recluster")
async def recluster_faces():
    """
    Re-cluster all faces with validation.
    Includes:
    - Validation of all embeddings (checks for missing/corrupted/incomplete)
    - Re-clustering of all faces
    - Merging new faces with existing clusters based on embedding similarity
    - Only displaying clusters with 3+ photos
    """
    global _clustering_state, _face_clusters_cache
    
    # Prevent concurrent clustering
    if _clustering_state["is_running"]:
        raise HTTPException(status_code=409, detail="Clustering already in progress")
    
    try:
        _clustering_state["is_running"] = True
        _clustering_state["progress"] = 0
        _clustering_state["logs"] = []
        _clustering_state["current_status"] = "validating"
        
        _add_cluster_log("Starting face cluster validation and re-clustering...")
        
        # Step 1: Validate all face embeddings in database
        _add_cluster_log("Step 1: Validating face embeddings in database...")
        with get_db() as conn:
            # Get all face embeddings
            cur = conn.execute("""
                SELECT 
                    face_embeddings.id, 
                    media_files.path, 
                    face_embeddings.embedding,
                    face_embeddings.bbox,
                    face_embeddings.confidence
                FROM face_embeddings
                JOIN media_files ON media_files.id = face_embeddings.media_id
            """)
            rows = cur.fetchall()
            total_embeddings = len(rows)
            
            _add_cluster_log(f"Found {total_embeddings} total face embedding records")
            
            # Validate embeddings
            valid_count = 0
            invalid_count = 0
            corrupted_count = 0
            incomplete_count = 0
            
            for idx, (emb_id, path, emb_blob, bbox_json, conf) in enumerate(rows):
                if idx % max(1, total_embeddings // 10) == 0:
                    _clustering_state["progress"] = int((idx / total_embeddings) * 25)
                
                # Check if embedding exists
                if emb_blob is None:
                    incomplete_count += 1
                    _add_cluster_log(f"  ⚠ [{path}] Missing embedding blob")
                    continue
                
                try:
                    # Try to deserialize embedding
                    emb = np.frombuffer(emb_blob, dtype=np.float32)
                    
                    # Validate size
                    if len(emb) == 0:
                        incomplete_count += 1
                        _add_cluster_log(f"  ⚠ [{path}] Empty embedding array")
                        continue
                    
                    # Check for NaN or Inf
                    if np.any(np.isnan(emb)) or np.any(np.isinf(emb)):
                        corrupted_count += 1
                        _add_cluster_log(f"  ✗ [{path}] Corrupted embedding (contains NaN/Inf)")
                        continue
                    
                    # Validate bbox
                    if bbox_json:
                        bbox = json.loads(bbox_json)
                        if not isinstance(bbox, list) or len(bbox) != 4:
                            incomplete_count += 1
                            _add_cluster_log(f"  ⚠ [{path}] Invalid bounding box")
                            continue
                    
                    valid_count += 1
                    
                except (ValueError, TypeError) as e:
                    corrupted_count += 1
                    _add_cluster_log(f"  ✗ [{path}] Failed to deserialize: {e}")
                    continue
                except Exception as e:
                    invalid_count += 1
                    _add_cluster_log(f"  ✗ [{path}] Validation error: {e}")
                    continue
            
            _add_cluster_log(f"Validation complete: {valid_count} valid, {incomplete_count} incomplete, {corrupted_count} corrupted, {invalid_count} errors")
        
        # Step 2: Load valid faces from database
        _clustering_state["current_status"] = "loading"
        _clustering_state["progress"] = 25
        _add_cluster_log("Step 2: Loading valid face embeddings...")
        
        faces = load_faces_from_db()
        _add_cluster_log(f"Loaded {len(faces)} valid face instances")
        
        if not faces:
            _add_cluster_log("⚠ No valid faces to cluster")
            _clustering_state["is_running"] = False
            _clustering_state["current_status"] = "complete"
            return {
                "success": True,
                "clusters_created": 0,
                "faces_clustered": 0,
                "clusters_with_3plus": 0,
                "logs": _clustering_state["logs"]
            }
        
        # Step 3: Perform clustering
        _clustering_state["current_status"] = "clustering"
        _clustering_state["progress"] = 50
        _add_cluster_log("Step 3: Clustering faces...")
        
        clusters = cluster_faces(faces)
        _add_cluster_log(f"Initial clustering produced {len(clusters)} clusters")
        
        # Step 4: Apply existing labels
        _clustering_state["progress"] = 75
        _add_cluster_log("Step 4: Applying existing labels...")
        
        clusters = apply_labels(clusters)
        
        # Step 4b: Automatically assign new faces to confirmed clusters
        _add_cluster_log("Step 4b: Auto-assigning new faces to confirmed clusters...")
        from .face_cluster import assign_new_faces_to_confirmed_clusters
        clusters = assign_new_faces_to_confirmed_clusters(clusters)
        
        # Step 5: Filter clusters with 3+ photos and get statistics
        _clustering_state["current_status"] = "filtering"
        _clustering_state["progress"] = 85
        _add_cluster_log("Step 5: Filtering clusters by photo count...")
        
        cluster_stats = {}
        clusters_3plus = 0
        total_photos = 0
        
        with get_db() as conn:
            labels = load_labels()
            
            for cluster in clusters:
                # Get cluster photo count
                photos = cluster.get("photos", [])
                embedding_photo_ids = set(p.get("media_id") for p in photos if p.get("media_id"))
                confirmed_photos = set(int(pid) for pid in labels.get(cluster["id"], {}).get("confirmed_photos", []) if pid is not None)
                all_photo_ids = embedding_photo_ids | confirmed_photos
                
                cluster_stats[cluster["id"]] = len(all_photo_ids)
                total_photos += len(all_photo_ids)
                
                if len(all_photo_ids) >= 3:
                    clusters_3plus += 1
        
        _add_cluster_log(f"Clustering complete: {clusters_3plus} clusters with 3+ photos (out of {len(clusters)} total)")
        _add_cluster_log(f"Total photos in clusters: {total_photos}")
        
        # Clear cache to force reload with new clusters
        _face_clusters_cache["data"] = None
        _face_clusters_cache["timestamp"] = 0
        _add_cluster_log("✓ Cache cleared, ready for new queries")
        
        _clustering_state["progress"] = 100
        _clustering_state["current_status"] = "complete"
        
        return {
            "success": True,
            "clusters_created": len(clusters),
            "clusters_with_3plus": clusters_3plus,
            "faces_clustered": len(faces),
            "total_photos": total_photos,
            "logs": _clustering_state["logs"]
        }
        
    except Exception as e:
        _add_cluster_log(f"✗ Error during clustering: {e}")
        print(f"[API_ERROR] Clustering failed: {e}")
        import traceback
        traceback.print_exc()
        _clustering_state["is_running"] = False
        _clustering_state["current_status"] = "error"
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        _clustering_state["is_running"] = False


@app.get("/api/faces/recluster/status")
async def get_recluster_status():
    """Get the current status of face re-clustering operation."""
    global _clustering_state
    return {
        "is_running": _clustering_state["is_running"],
        "progress": _clustering_state["progress"],
        "status": _clustering_state["current_status"],
        "logs": _clustering_state["logs"]
    }


@app.get("/api/faces/clusters", response_model=List[FaceClusterResponse])
async def list_face_clusters(include_hidden: bool = False, min_photos: int = 1, silo_name: str = Query(None)):
    """Get ALL face clusters - both labeled and embedding-based.
    
    CRITICAL SECURITY: silo_name parameter ensures clusters are retrieved from the correct silo only.
    """
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        # Load labels (user's confirmed clusters)
        labels = load_labels()
        print(f"[API] Loaded labels.json with {len(labels)} entries for silo")
        
        result = []
        
        with get_db() as conn:
            # Load embedding-based clusters and apply labels to them
            faces = load_faces_from_db()
            clusters = cluster_faces(faces)
            clusters = apply_labels(clusters)
            # Don't auto-assign - let user manually confirm/reject photos
            # clusters = assign_new_faces_to_confirmed_clusters(clusters)
            
            for cluster in clusters:
                cluster_id = cluster.get("id")
                
                photos = cluster.get("photos", [])
                
                # Get exclusions for this cluster
                excluded_ids = set()
                cur = conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='face_cluster_exclusions'"
                )
                if cur.fetchone():
                    cur = conn.execute(
                        "SELECT media_id FROM face_cluster_exclusions WHERE cluster_id = ?",
                        (cluster_id,)
                    )
                    excluded_ids = {row[0] for row in cur.fetchall()}
                
                # Filter out excluded photos
                photos = [p for p in photos if p.get("media_id") not in excluded_ids]
                photo_count = len(photos)
                
                # Check if cluster is hidden
                cluster_label_data = labels.get(cluster_id, {})
                is_hidden = cluster_label_data.get("hidden", False) if isinstance(cluster_label_data, dict) else False
                
                # Auto-hide if no photos remain (after exclusions)
                if photo_count == 0 and not is_hidden:
                    if cluster_id not in labels:
                        labels[cluster_id] = {}
                    labels[cluster_id]["hidden"] = True
                    save_labels(labels)
                    is_hidden = True
                    print(f"[API] Auto-hiding empty cluster {cluster_id}")
                
                # Skip hidden clusters unless explicitly requested
                if is_hidden and not include_hidden:
                    continue
                
                # Only show if has photos AND meets minimum size
                if photo_count < min_photos:
                    continue
                
                # Get thumbnail from first photo
                thumbnail_url = ""
                if photos:
                    first_photo_id = photos[0].get("media_id")
                    if first_photo_id:
                        thumbnail_url = f"http://127.0.0.1:8000/api/media/file/{first_photo_id}"
                
                # Get timestamp
                last_updated = int(time.time())
                if photos:
                    photo_ids = [p.get("media_id") for p in photos if p.get("media_id")]
                    if photo_ids:
                        try:
                            placeholders = ','.join(['?' for _ in photo_ids])
                            cur = conn.execute(
                                f"SELECT MAX(date_taken) FROM media_files WHERE id IN ({placeholders})",
                                photo_ids
                            )
                            row = cur.fetchone()
                            last_updated = row[0] if row and row[0] else int(time.time())
                        except Exception as e:
                            pass
                
                # Get confidence score from cluster
                confidence_score = 0.0
                if photos:
                    try:
                        photo_ids = [p.get("media_id") for p in photos if p.get("media_id")]
                        if photo_ids:
                            placeholders = ','.join(['?' for _ in photo_ids])
                            cur = conn.execute(
                                f"SELECT AVG(confidence) FROM face_embeddings WHERE media_id IN ({placeholders})",
                                photo_ids
                            )
                            row = cur.fetchone()
                            confidence_score = float(row[0]) if row and row[0] else 0.0
                    except:
                        confidence_score = 0.0
                
                # Get name from cluster (apply_labels already added it)
                # Check both "name" and "label" fields for backwards compatibility
                cluster_name = cluster.get("name") or cluster.get("label") or "unknown"
                
                result.append(FaceClusterResponse(
                    id=cluster_id,
                    name=cluster_name,
                    primary_thumbnail=thumbnail_url,
                    photo_count=photo_count,
                    confidence_score=confidence_score,
                    is_hidden=is_hidden,
                    last_updated=last_updated,
                    rotation_override=0
                ))
                print(f"[API] Cluster: {cluster_id} ({cluster_name}) - {photo_count} photos")
            
            # Sort by name (labeled first, then unknown)
            result.sort(key=lambda c: (c.name == "unknown", c.name))
            print(f"[API] Returning {len(result)} total clusters (labeled + embedding-based)")
            return result
    
    except Exception as e:
        print(f"[API_ERROR] Failed to load clusters: {e}")
        import traceback
        traceback.print_exc()
        return []
    
    except Exception as e:
        print(f"[API_ERROR] Failed to list face clusters: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/faces/{cluster_id}", response_model=List[ClusterPhotoResponse])
async def get_cluster_photos(cluster_id: str, silo_name: str = Query(None)):
    """Get all photos in a specific face cluster.
    
    CRITICAL SECURITY: silo_name parameter ensures photos are from the correct silo only.
    """
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        # Load labels to check for confirmed photos
        labels = load_labels()
        label_data = labels.get(cluster_id, {})
        confirmed_photo_ids = set(label_data.get("confirmed_photos", []))
        
        # Always load all photos from embedding-based clustering
        faces = load_faces_from_db()
        clusters = cluster_faces(faces)
        clusters = apply_labels(clusters)
        # Don't auto-assign - let user manually confirm/reject photos
        # (auto-assignment only runs during bulk reclustering)
        
        # Find the requested cluster in embedding-based results
        cluster = None
        for c in clusters:
            if c["id"] == cluster_id:
                cluster = c
                break
        
        # If not found, cluster doesn't exist
        if not cluster:
            raise HTTPException(status_code=404, detail=f"Cluster {cluster_id} not found")
        
        # Get exclusions for this cluster
        excluded_ids = set()
        with get_db() as conn:
            # Check if exclusions table exists
            cur = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='face_cluster_exclusions'"
            )
            if cur.fetchone():
                cur = conn.execute(
                    "SELECT media_id FROM face_cluster_exclusions WHERE cluster_id = ?",
                    (cluster_id,)
                )
                excluded_ids = {row[0] for row in cur.fetchall()}
        
        # Load confirmed photos from labels
        confirmed_photo_ids = set(labels.get(cluster_id, {}).get("confirmed_photos", []))

        
        # Track which media_ids we've already added to avoid duplicates
        added_media_ids = set()
        confirmed_results = []
        unconfirmed_results = []
        
        # Return photos with thumbnails, excluding removed ones
        with get_db() as conn:
            # First, add photos from the embedding-based cluster
            for i, photo in enumerate(cluster.get("photos", [])):
                media_id = photo.get("media_id")
                if not media_id:
                    continue
                
                # Skip excluded photos
                if media_id in excluded_ids:
                    continue
                
                added_media_ids.add(media_id)
                
                # Get photo metadata
                cur = conn.execute(
                    "SELECT date_taken FROM media_files WHERE id = ?",
                    (media_id,)
                )
                row = cur.fetchone()
                date_taken = row[0] if row else None
                
                photo_response = ClusterPhotoResponse(
                    id=str(media_id),
                    image_path=photo.get("path", ""),
                    thumbnail=f"http://127.0.0.1:8000/api/media/file/{media_id}",
                    date_taken=date_taken,
                    similarity_score=photo.get("confidence", 0.5),
                    is_confirmed=media_id in confirmed_photo_ids
                )
                
                # Put confirmed photos first
                if media_id in confirmed_photo_ids:
                    confirmed_results.append(photo_response)
                else:
                    unconfirmed_results.append(photo_response)
            
            # Now add confirmed photos that aren't already in the cluster
            for media_id in confirmed_photo_ids:
                if media_id in added_media_ids or media_id in excluded_ids:
                    continue
                
                added_media_ids.add(media_id)
                
                # Get photo path and metadata
                cur = conn.execute(
                    "SELECT path, date_taken FROM media_files WHERE id = ?",
                    (media_id,)
                )
                row = cur.fetchone()
                if row:
                    image_path, date_taken = row
                    confirmed_results.append(ClusterPhotoResponse(
                        id=str(media_id),
                        image_path=image_path,
                        thumbnail=f"http://127.0.0.1:8000/api/media/file/{media_id}",
                        date_taken=date_taken,
                        similarity_score=0.0,  # Manually added photo has no embedding confidence
                        is_confirmed=True
                    ))
        
        # Combine confirmed photos first, then unconfirmed
        result = confirmed_results + unconfirmed_results
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to get cluster photos: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/faces/{cluster_id}/name")
async def rename_cluster(cluster_id: str, request: NamePersonRequest = Body(...)):
    """Rename a face cluster."""
    global _face_clusters_cache
    try:
        set_label(cluster_id, name=request.name)
        # Invalidate cache since data changed
        _face_clusters_cache["data"] = None
        return {
            "id": cluster_id,
            "name": request.name,
            "success": True
        }
    except Exception as e:
        import traceback
        print(f"[API_ERROR] Failed to rename cluster {cluster_id}: {e}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "success": False}
        )
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/faces/{cluster_id}/hide")
async def hide_cluster(cluster_id: str, request: HidePersonRequest = Body(...)):
    """Hide or unhide a face cluster."""
    global _face_clusters_cache
    try:
        set_label(cluster_id, hidden=request.hidden)
        # Invalidate cache since data changed
        _face_clusters_cache["data"] = None
        return {
            "id": cluster_id,
            "hidden": request.hidden,
            "success": True
        }
    except Exception as e:
        print(f"[API_ERROR] Failed to hide cluster {cluster_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class RotateClusterRequest(BaseModel):
    rotation: int  # 0, 90, 180, 270


@app.post("/api/faces/{cluster_id}/rotate")
async def rotate_cluster_thumbnail(cluster_id: str, request: RotateClusterRequest = Body(...)):
    """Set the rotation for a cluster thumbnail view (0, 90, 180, 270 degrees)."""
    global _face_clusters_cache
    try:
        # Validate rotation value
        if request.rotation not in [0, 90, 180, 270]:
            raise HTTPException(status_code=400, detail="Rotation must be 0, 90, 180, or 270")
        
        # Store rotation in labels
        set_label(cluster_id, rotation_override=request.rotation)
        
        # Invalidate cache since data changed
        _face_clusters_cache["data"] = None
        
        print(f"[DEBUG] Set cluster {cluster_id} rotation to {request.rotation}°")
        
        return {
            "id": cluster_id,
            "rotation": request.rotation,
            "success": True,
            "message": f"Cluster thumbnail rotated to {request.rotation}°"
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[API_ERROR] Failed to rotate cluster {cluster_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/faces/{cluster_id}/add")
async def add_photo_to_cluster(cluster_id: str, media_id: int = Query(...)):
    """Add a photo to a face cluster (manual assignment)."""
    try:
        # For now, this is a placeholder that tracks the association
        # In a full implementation, you'd update a user_clusters table
        with get_db() as conn:
            # Create user_cluster_assignments table if it doesn't exist
            conn.execute("""
                CREATE TABLE IF NOT EXISTS user_cluster_assignments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cluster_id TEXT NOT NULL,
                    media_id INTEGER NOT NULL,
                    added_by_user BOOLEAN DEFAULT 1,
                    created_at INTEGER,
                    UNIQUE(cluster_id, media_id)
                )
            """)
            
            # Add the assignment
            import time
            conn.execute(
                "INSERT OR IGNORE INTO user_cluster_assignments (cluster_id, media_id, created_at) VALUES (?, ?, ?)",
                (cluster_id, media_id, int(time.time()))
            )
            conn.commit()
        
        return {
            "cluster_id": cluster_id,
            "media_id": media_id,
            "success": True
        }
    except Exception as e:
        print(f"[API_ERROR] Failed to add photo to cluster: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/faces/{cluster_id}/confirm")
async def confirm_photo_in_cluster(cluster_id: str, media_id: int = Query(...)):
    """Confirm a photo as belonging to a face cluster."""
    global _face_clusters_cache
    try:
        print(f"[DEBUG] Confirming media_id {media_id} in cluster {cluster_id}")
        
        # Load labels and add to confirmed_photos
        labels = load_labels()
        if cluster_id not in labels:
            labels[cluster_id] = {}
        
        if "confirmed_photos" not in labels[cluster_id]:
            labels[cluster_id]["confirmed_photos"] = []
        
        media_id_int = int(media_id)
        if media_id_int not in labels[cluster_id]["confirmed_photos"]:
            labels[cluster_id]["confirmed_photos"].append(media_id_int)
            print(f"[DEBUG] Added media_id {media_id} to confirmed_photos in {cluster_id}")
        
        # Save labels
        save_labels(labels)
        
        # Clear the clusters cache
        _face_clusters_cache["data"] = None
        print(f"[DEBUG] Cleared face clusters cache")
        
        return {
            "cluster_id": cluster_id,
            "media_id": media_id,
            "success": True,
            "message": "Photo confirmed"
        }
    except Exception as e:
        print(f"[API_ERROR] Failed to confirm photo: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def check_and_hide_empty_cluster(cluster_id: str, labels: dict) -> bool:
    """Check if a cluster has any remaining photos. If not, hide it.
    Returns True if cluster was hidden."""
    # Load current cluster state
    faces = load_faces_from_db()
    clusters = cluster_faces(faces)
    cluster_map = {c["id"]: c for c in clusters}
    
    if cluster_id not in cluster_map:
        return False
    
    cluster = cluster_map[cluster_id]
    
    # Get all photo IDs from embeddings
    embedding_photo_ids = set(p.get('media_id') for p in cluster.get('photos', []) if p.get('media_id'))
    
    # Get confirmed photos
    confirmed_photos = set(cluster.get('confirmed_photos', []))
    
    # Get excluded photo IDs
    excluded_ids = set()
    with get_db() as conn:
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='face_cluster_exclusions'"
        )
        if cur.fetchone():
            cur = conn.execute(
                "SELECT media_id FROM face_cluster_exclusions WHERE cluster_id = ?",
                (cluster_id,)
            )
            excluded_ids = {row[0] for row in cur.fetchall()}
    
    # Calculate remaining valid photos
    all_photos = embedding_photo_ids | confirmed_photos
    remaining_photos = all_photos - excluded_ids
    
    # If no photos remain, hide the cluster
    if not remaining_photos:
        print(f"[DEBUG] Cluster {cluster_id} has no remaining photos - hiding it")
        if cluster_id not in labels:
            labels[cluster_id] = {}
        labels[cluster_id]["hidden"] = True
        save_labels(labels)
        return True
    
    return False


@app.post("/api/faces/{cluster_id}/remove")
async def remove_photo_from_cluster(cluster_id: str, media_id: int = Query(...)):
    """Remove a photo from a face cluster (mark as not belonging)."""
    global _face_clusters_cache
    try:
        print(f"[DEBUG] Removing media_id {media_id} from cluster {cluster_id}")
        
        # Load labels to check if this is the profile pic
        labels = load_labels()
        cluster_labels = labels.get(cluster_id, {})
        profile_media_id = cluster_labels.get("profile_media_id")
        
        with get_db() as conn:
            # Create exclusion table if needed
            conn.execute("""
                CREATE TABLE IF NOT EXISTS face_cluster_exclusions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cluster_id TEXT NOT NULL,
                    media_id INTEGER NOT NULL,
                    created_at INTEGER,
                    UNIQUE(cluster_id, media_id)
                )
            """)
            
            import time
            # Delete if exists, then insert
            conn.execute(
                "DELETE FROM face_cluster_exclusions WHERE cluster_id = ? AND media_id = ?",
                (cluster_id, media_id)
            )
            conn.execute(
                "INSERT INTO face_cluster_exclusions (cluster_id, media_id, created_at) VALUES (?, ?, ?)",
                (cluster_id, media_id, int(time.time()))
            )
            conn.commit()
            
        print(f"[DEBUG] Successfully removed media_id {media_id} from cluster {cluster_id}")
        
        # If this was the profile picture, update it to another remaining photo
        if profile_media_id == media_id:
            print(f"[DEBUG] Removed photo was profile pic, finding replacement...")
            
            # Get all remaining photos in cluster (embedding-based + confirmed, minus excluded)
            faces = load_faces_from_db()
            clusters = cluster_faces(faces)
            clusters = apply_labels(clusters)
            
            remaining_photo_ids = set()
            for cluster in clusters:
                if cluster["id"] == cluster_id:
                    # Get embedding-based photos
                    for photo in cluster.get("photos", []):
                        photo_id = photo.get("media_id")
                        if photo_id and photo_id != media_id:
                            remaining_photo_ids.add(photo_id)
                    break
            
            # Also get confirmed photos that aren't excluded
            confirmed_photos = cluster_labels.get("confirmed_photos", [])
            for pid in confirmed_photos:
                if pid and pid != media_id:
                    remaining_photo_ids.add(int(pid))
            
            # Check which ones aren't excluded
            excluded_ids = set()
            cur = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='face_cluster_exclusions'"
            )
            if cur.fetchone():
                cur = conn.execute(
                    "SELECT media_id FROM face_cluster_exclusions WHERE cluster_id = ?",
                    (cluster_id,)
                )
                excluded_ids = {row[0] for row in cur.fetchall()}
            
            valid_photo_ids = remaining_photo_ids - excluded_ids
            
            if valid_photo_ids:
                # Pick the first remaining photo (or most recent)
                # Try to get the most recent one
                valid_list = list(valid_photo_ids)
                with get_db() as conn:
                    placeholders = ','.join('?' * len(valid_list))
                    cur = conn.execute(
                        f"SELECT id, date_taken FROM media_files WHERE id IN ({placeholders}) ORDER BY date_taken DESC LIMIT 1",
                        valid_list
                    )
                    row = cur.fetchone()
                    if row:
                        new_pfp_id = row[0]
                        print(f"[DEBUG] Setting new profile pic: {new_pfp_id}")
                        
                        # Update labels
                        if cluster_id not in labels:
                            labels[cluster_id] = {}
                        labels[cluster_id]["profile_media_id"] = new_pfp_id
                        save_labels(labels)
                        print(f"[DEBUG] Profile pic updated to {new_pfp_id}")
            else:
                print(f"[DEBUG] No remaining photos in cluster, hiding cluster and removing profile pic")
                if cluster_id in labels:
                    labels[cluster_id]["hidden"] = True
                    if "profile_media_id" in labels[cluster_id]:
                        del labels[cluster_id]["profile_media_id"]
                    save_labels(labels)
                    print(f"[DEBUG] Cluster {cluster_id} is now hidden")
        
        # Clear the clusters cache so fresh data is fetched next time
        # Clear the clusters cache
        _face_clusters_cache["data"] = None
        print(f"[DEBUG] Cleared face clusters cache")
        
        # Additionally, remove this photo from any duplicate unnamed clusters it might appear in
        # This ensures a confirmed photo only appears in one cluster
        if cluster_id.startswith("cluster_"):  # Only for embedding-based clusters
            print(f"[DEBUG] Checking for duplicates of media_id {media_id} in other clusters...")
            
            # Load all clusters to find others containing this photo
            faces = load_faces_from_db()
            clusters = cluster_faces(faces)
            
            for other_cluster in clusters:
                other_cluster_id = other_cluster["id"]
                if other_cluster_id == cluster_id:
                    continue
                
                # Check if this other cluster also contains the photo
                for photo in other_cluster.get("photos", []):
                    if photo.get("media_id") == media_id:
                        # Mark as excluded in this cluster too
                        print(f"[DEBUG] Found duplicate in {other_cluster_id}, excluding...")
                        with get_db() as conn:
                            conn.execute(
                                "INSERT OR IGNORE INTO face_cluster_exclusions (cluster_id, media_id, created_at) VALUES (?, ?, ?)",
                                (other_cluster_id, media_id, int(time.time()))
                            )
                            conn.commit()
                        break
        
        return {
            "cluster_id": cluster_id,
            "media_id": media_id,
            "success": True,
            "message": "Photo removed from cluster"
        }
    except Exception as e:
        print(f"[API_ERROR] Failed to remove photo from cluster: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/faces/merge")
async def merge_clusters(request: MergeRequest = Body(...)):
    """Merge two face clusters into one."""
    global _face_clusters_cache
    try:
        cluster_id_1 = request.cluster_id_1
        cluster_id_2 = request.cluster_id_2
        name_to_keep = request.name_to_keep
        
        # Load current labels
        from .face_cluster import load_labels, save_labels
        labels = load_labels()
        
        # Get cluster data
        cluster1_data = labels.get(cluster_id_1, {})
        cluster2_data = labels.get(cluster_id_2, {})
        
        cluster1_name = cluster1_data.get("label") or cluster1_data.get("name", "unknown")
        cluster2_name = cluster2_data.get("label") or cluster2_data.get("name", "unknown")
        
        # Determine which name to keep
        if name_to_keep:
            final_name = name_to_keep
        elif cluster1_name != "unknown":
            final_name = cluster1_name
        elif cluster2_name != "unknown":
            final_name = cluster2_name
        else:
            final_name = "unknown"
        
        # Get photos from both clusters
        cluster1_confirmed = set(cluster1_data.get("confirmed_photos", []))
        cluster2_confirmed = set(cluster2_data.get("confirmed_photos", []))
        
        # Get all photos from cluster 2's embedding cluster
        faces = load_faces_from_db()
        clusters = cluster_faces(faces)
        
        cluster2_embedding_photos = set()
        for cluster in clusters:
            if cluster.get("id") == cluster_id_2:
                for photo in cluster.get("photos", []):
                    media_id = photo.get("media_id")
                    if media_id:
                        cluster2_embedding_photos.add(media_id)
                break
        
        # Merge all photos into cluster 1
        all_cluster2_photos = cluster2_confirmed | cluster2_embedding_photos
        merged_photos = cluster1_confirmed | all_cluster2_photos
        
        # Update cluster 1
        if cluster_id_1 not in labels:
            labels[cluster_id_1] = {}
        labels[cluster_id_1]["label"] = final_name
        labels[cluster_id_1]["confirmed_photos"] = list(merged_photos)
        
        # Hide cluster 2
        if cluster_id_2 not in labels:
            labels[cluster_id_2] = {}
        labels[cluster_id_2]["hidden"] = True
        labels[cluster_id_2]["merged_into"] = cluster_id_1
        
        save_labels(labels)
        
        # Clear cache
        _face_clusters_cache["data"] = None
        
        print(f"[MERGE] Merged {len(all_cluster2_photos)} photos from {cluster_id_2} into {cluster_id_1}. Total: {len(merged_photos)} photos")
        
        return {
            "success": True,
            "merged_cluster_id": cluster_id_1,
            "removed_cluster_id": cluster_id_2,
            "name": final_name,
            "photos_moved": len(all_cluster2_photos),
            "total_photos": len(merged_photos)
        }
    except Exception as e:
        print(f"[API_ERROR] Failed to merge clusters: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# Image rotation and metadata endpoints

@app.post("/api/media/{media_id}/rotate")
async def rotate_image(media_id: int, request: RotateClusterRequest, type: str = "image"):
    """Rotate image and save orientation override to database and silo-agnostic cache.
    
    Stores a single rotation value in:
    1. Database (per-silo persistent storage)
    2. Silo-agnostic cache (rotations.json)
    3. Clears thumbnail cache for immediate re-render
    """
    try:
        rotation = request.rotation  # degrees: 0, 90, 180, 270
        
        print(f"[DEBUG] rotate_image called with media_id={media_id}, rotation={rotation}")
        
        # Validate rotation value
        if rotation not in [0, 90, 180, 270]:
            print(f"[ERROR] Invalid rotation value: {rotation}")
            raise HTTPException(status_code=400, detail="Rotation must be 0, 90, 180, or 270")
        
        # Store rotation in database - persistent per-silo storage
        with get_db() as conn:
            conn.execute(
                "UPDATE media_files SET rotation = ? WHERE id = ?",
                (rotation, media_id)
            )
            conn.commit()
            print(f"[ROTATION] Stored rotation {rotation}° for media_id {media_id} in database")
        
        # Store rotation in silo-agnostic cache file (rotations.json)
        from .face_cluster import set_media_rotation
        set_media_rotation(media_id, rotation, type="image")
        print(f"[ROTATION] Stored rotation {rotation}° for media_id {media_id} in silo-agnostic cache")
        
        # Clear thumbnail cache for this media - forces regeneration with new rotation
        from .silo_manager import SiloManager
        silo_cache_dir = SiloManager.get_silo_cache_dir()
        cache_dir = os.path.join(silo_cache_dir, "thumbnails")
        import glob
        thumbnail_patterns = [
            os.path.join(cache_dir, f"{media_id}_*.jpg"),
            os.path.join(cache_dir, f"{media_id}.jpg"),
        ]
        for pattern in thumbnail_patterns:
            for cached_file in glob.glob(pattern):
                try:
                    os.remove(cached_file)
                    print(f"[ROTATION] Cleared thumbnail cache: {cached_file}")
                except Exception as e:
                    print(f"[ROTATION] Failed to clear cache {cached_file}: {e}")
        
        print(f"[DEBUG] Set media {media_id} rotation to {rotation}° (database + cache) and cleared thumbnail cache")
        
        return {"success": True, "media_id": media_id, "rotation": rotation}
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[API_ERROR] Failed to rotate image: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/media/{media_id}/bookmark")
async def bookmark_image(media_id: int):
    """Toggle bookmark/heart status for an image."""
    try:
        with get_db() as conn:
            # Check current status
            cur = conn.execute("SELECT is_bookmarked FROM media_files WHERE id = ?", (media_id,))
            row = cur.fetchone()
            current_status = row[0] if row else False
            new_status = not current_status
            
            # Update status
            conn.execute(
                "UPDATE media_files SET is_bookmarked = ? WHERE id = ?",
                (new_status, media_id)
            )
            conn.commit()
        
        return {"success": True, "media_id": media_id, "is_bookmarked": new_status}
    except Exception as e:
        print(f"[API_ERROR] Failed to bookmark image: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/media/{media_id}/keywords")
async def set_keywords(media_id: int, request: dict = Body(...)):
    """Set search keywords for an image from search results."""
    try:
        keywords = request.get("keywords", [])
        
        with get_db() as conn:
            # Store keywords as JSON string
            import json
            keywords_json = json.dumps(keywords)
            conn.execute(
                "UPDATE media_files SET search_keywords = ? WHERE id = ?",
                (keywords_json, media_id)
            )
            conn.commit()
        
        return {"success": True, "media_id": media_id, "keywords": keywords}
    except Exception as e:
        print(f"[API_ERROR] Failed to set keywords: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/media/hide")
async def hide_media(request: dict = Body(...)):
    """Hide media from the root directory (user library)."""
    try:
        media_ids = request.get("mediaIds", [])
        
        if not media_ids:
            raise HTTPException(status_code=400, detail="No media IDs provided")
        
        with get_db() as conn:
            # Update all provided media IDs to be hidden
            placeholders = ','.join('?' * len(media_ids))
            conn.execute(
                f"UPDATE media_files SET is_hidden = 1 WHERE id IN ({placeholders})",
                media_ids
            )
            conn.commit()
        
        return {"success": True, "hidden_count": len(media_ids)}
    except Exception as e:
        print(f"[API_ERROR] Failed to hide media: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/faces/{cluster_id}/profile-pic")
async def set_cluster_profile_pic(cluster_id: str, request: SetProfilePicRequest):
    """Set the profile picture for a face cluster."""
    try:
        media_id = request.media_id
        
        if not media_id:
            raise HTTPException(status_code=400, detail="Missing media_id")
        
        # Update the cluster's primary photo in labels
        labels = load_labels()
        if cluster_id not in labels:
            labels[cluster_id] = {}
        
        labels[cluster_id]["profile_media_id"] = int(media_id)
        save_labels(labels)
        
        return {
            "success": True,
            "cluster_id": cluster_id,
            "media_id": media_id
        }
    except Exception as e:
        print(f"[API_ERROR] Failed to set profile picture: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/faces/{cluster_id}/move-photo")
async def move_photo_to_cluster(cluster_id: str, request: MovePhotoRequest):
    """Move a photo from one cluster to another by updating face embedding assignments."""
    global _face_clusters_cache
    try:
        media_id = request.media_id
        from_cluster_id = request.from_cluster_id
        to_cluster_id = request.to_cluster_id or cluster_id
        
        print(f"[DEBUG] move_photo_to_cluster called: media_id={media_id}, from={from_cluster_id}, to={to_cluster_id}, cluster_id={cluster_id}")
        
        if not media_id or not from_cluster_id:
            raise HTTPException(status_code=400, detail="Missing media_id or from_cluster_id")
        
        # Load and validate clusters exist
        faces = load_faces_from_db()
        clusters = cluster_faces(faces)
        cluster_ids = {c["id"]: c for c in clusters}
        
        if to_cluster_id not in cluster_ids:
            raise HTTPException(status_code=404, detail=f"Target cluster {to_cluster_id} not found")
        if from_cluster_id not in cluster_ids:
            raise HTTPException(status_code=404, detail=f"Source cluster {from_cluster_id} not found")
        
        print(f"[DEBUG] Clusters validated: {to_cluster_id} and {from_cluster_id} exist")
        
        # Store user's intent in labels
        labels = load_labels()
        
        # Add to target cluster confirmed photos
        if to_cluster_id not in labels:
            labels[to_cluster_id] = {}
        
        if "confirmed_photos" not in labels[to_cluster_id]:
            labels[to_cluster_id]["confirmed_photos"] = []
        
        if int(media_id) not in labels[to_cluster_id]["confirmed_photos"]:
            labels[to_cluster_id]["confirmed_photos"].append(int(media_id))
            print(f"[DEBUG] Added media_id {media_id} to confirmed_photos in {to_cluster_id}")
        
        # Remove from source cluster confirmed photos
        if from_cluster_id in labels and "confirmed_photos" in labels[from_cluster_id]:
            if int(media_id) in labels[from_cluster_id]["confirmed_photos"]:
                labels[from_cluster_id]["confirmed_photos"].remove(int(media_id))
                print(f"[DEBUG] Removed media_id {media_id} from confirmed_photos in {from_cluster_id}")
        
        # Create an exclusion in the from_cluster so it doesn't show there
        with get_db() as conn:
            # Ensure exclusion table exists
            conn.execute("""
                CREATE TABLE IF NOT EXISTS face_cluster_exclusions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cluster_id TEXT NOT NULL,
                    media_id INTEGER NOT NULL,
                    created_at INTEGER,
                    UNIQUE(cluster_id, media_id)
                )
            """)
            
            import time
            # Remove any existing exclusion first
            conn.execute(
                "DELETE FROM face_cluster_exclusions WHERE cluster_id = ? AND media_id = ?",
                (from_cluster_id, int(media_id))
            )
            # Create new exclusion
            conn.execute(
                "INSERT INTO face_cluster_exclusions (cluster_id, media_id, created_at) VALUES (?, ?, ?)",
                (from_cluster_id, int(media_id), int(time.time()))
            )
            conn.commit()
            print(f"[DEBUG] Exclusion created in database for {from_cluster_id}:{media_id}")
        
        # Save labels
        save_labels(labels)
        print(f"[DEBUG] Labels saved")
        
        # Check if source cluster is now empty and hide it if so
        check_and_hide_empty_cluster(from_cluster_id, labels)
        
        # Clear the clusters cache so fresh data is fetched next time
        _face_clusters_cache["data"] = None
        print(f"[DEBUG] Cleared face clusters cache")
        
        return {
            "success": True,
            "media_id": media_id,
            "from_cluster_id": from_cluster_id,
            "to_cluster_id": to_cluster_id,
            "message": "Photo moved successfully"
        }
    except HTTPException as he:
        print(f"[API_ERROR] HTTP Exception in move_photo_to_cluster: {he.detail}")
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to move photo: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Move failed: {str(e)}")


@app.post("/api/faces/add-to-multiple-clusters")
async def add_photo_to_multiple_clusters(request: AddToMultipleClustersRequest):
    """Add a photo to multiple face clusters with automatic confirmation."""
    global _face_clusters_cache
    try:
        media_id = request.media_id
        source_cluster_id = request.source_cluster_id
        target_clusters = request.target_clusters
        
        print(f"[DEBUG] Adding media_id {media_id} to clusters: {target_clusters}")
        
        # Load labels (includes user-created clusters and embedding-based clusters)
        labels = load_labels()
        
        # Validate all target clusters exist (either in labels or embedding-based)
        faces = load_faces_from_db()
        clusters = cluster_faces(faces)
        cluster_ids = {c["id"]: c for c in clusters}
        
        # Only validate source cluster if it's not a placeholder/virtual cluster (search, browse, etc)
        if source_cluster_id not in ('search', 'browse', 'unknown') and source_cluster_id not in cluster_ids and source_cluster_id not in labels:
            raise HTTPException(status_code=404, detail=f"Source cluster {source_cluster_id} not found")
        
        # Check each target cluster exists in either labels (user-created) or cluster_ids (embedding-based)
        for cluster_id in target_clusters:
            if cluster_id not in cluster_ids and cluster_id not in labels:
                raise HTTPException(status_code=404, detail=f"Target cluster {cluster_id} not found")
        
        print(f"[DEBUG] All clusters validated")
        
        # Check if source cluster is "unnamed" (has no name or generic name)
        source_cluster_data = labels.get(source_cluster_id, {})
        source_name = source_cluster_data.get("name", "")
        is_unnamed_source = (
            source_name == "" or 
            source_name.lower() in ["unnamed", "unknown", "unassigned"]
        )
        
        print(f"[DEBUG] Source cluster '{source_name}' - unnamed: {is_unnamed_source}")
        
        # Add photo to confirmed_photos for each target cluster
        for cluster_id in target_clusters:
            if cluster_id not in labels:
                labels[cluster_id] = {}
            
            if "confirmed_photos" not in labels[cluster_id]:
                labels[cluster_id]["confirmed_photos"] = []
            
            media_id_int = int(media_id)
            if media_id_int not in labels[cluster_id]["confirmed_photos"]:
                labels[cluster_id]["confirmed_photos"].append(media_id_int)
                print(f"[DEBUG] Added media_id {media_id} to confirmed_photos in {cluster_id}")
        
        # If source cluster is unnamed, remove photo from source cluster (move instead of add to multiple)
        if is_unnamed_source and source_cluster_id not in ('search', 'browse', 'unknown'):
            print(f"[DEBUG] Source cluster is unnamed - removing photo from source cluster")
            
            # Remove from source cluster confirmed photos
            if source_cluster_id in labels and "confirmed_photos" in labels[source_cluster_id]:
                if media_id_int in labels[source_cluster_id]["confirmed_photos"]:
                    labels[source_cluster_id]["confirmed_photos"].remove(media_id_int)
                    print(f"[DEBUG] Removed media_id {media_id} from confirmed_photos in {source_cluster_id}")
            
            # Create exclusion in source cluster so it doesn't appear there
            with get_db() as conn:
                # Ensure exclusion table exists
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS face_cluster_exclusions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        cluster_id TEXT NOT NULL,
                        media_id INTEGER NOT NULL,
                        created_at INTEGER,
                        UNIQUE(cluster_id, media_id)
                    )
                """)
                
                import time
                # Remove any existing exclusion first
                conn.execute(
                    "DELETE FROM face_cluster_exclusions WHERE cluster_id = ? AND media_id = ?",
                    (source_cluster_id, media_id_int)
                )
                # Create new exclusion
                conn.execute(
                    "INSERT INTO face_cluster_exclusions (cluster_id, media_id, created_at) VALUES (?, ?, ?)",
                    (source_cluster_id, media_id_int, int(time.time()))
                )
                conn.commit()
                print(f"[DEBUG] Exclusion created in database for {source_cluster_id}:{media_id}")
            
            # Save labels before checking if cluster is empty
            save_labels(labels)
            
            # Check if source cluster is now empty and hide it if so
            check_and_hide_empty_cluster(source_cluster_id, labels)
        
        # Save labels
        save_labels(labels)
        print(f"[DEBUG] Labels saved")
        
        # Clear the clusters cache so fresh data is fetched next time
        _face_clusters_cache["data"] = None
        print(f"[DEBUG] Cleared face clusters cache")
        
        return {
            "success": True,
            "media_id": media_id,
            "source_cluster_id": source_cluster_id,
            "target_clusters": target_clusters,
            "message": "Photo added to multiple clusters successfully"
        }
    except HTTPException as he:
        print(f"[API_ERROR] HTTP Exception in add_photo_to_multiple_clusters: {he.detail}")
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to add photo to multiple clusters: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed: {str(e)}")


class CreateClusterRequest(BaseModel):
    name: str


class MergeClusterRequest(BaseModel):
    source_cluster_id: str
    target_cluster_id: str


@app.post("/api/faces/check-duplicate-name")
async def check_duplicate_cluster_name(request: CreateClusterRequest):
    """Check if a cluster name already exists (case-insensitive).
    
    Returns:
    {
        "exists": bool,
        "cluster_id": str (if exists),
        "cluster_name": str (if exists)
    }
    """
    try:
        cluster_name = request.name.strip().lower()
        if not cluster_name:
            raise HTTPException(status_code=400, detail="Cluster name cannot be empty")
        
        labels = load_labels()
        
        # Check for case-insensitive match
        for cluster_id, cluster_data in labels.items():
            if isinstance(cluster_data, dict) and cluster_data.get("name", "").lower() == cluster_name:
                return {
                    "exists": True,
                    "cluster_id": cluster_id,
                    "cluster_name": cluster_data.get("name", ""),
                    "photo_count": len(cluster_data.get("confirmed_photos", []))
                }
        
        return {"exists": False}
    except Exception as e:
        print(f"[API_ERROR] Failed to check duplicate name: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/faces/merge-clusters")
async def merge_clusters(request: MergeClusterRequest):
    """Merge source cluster into target cluster.
    
    Moves ALL photos (confirmed + embedding-based) from source to target and deletes source.
    """
    try:
        source_id = request.source_cluster_id.strip()
        target_id = request.target_cluster_id.strip()
        
        if not source_id or not target_id:
            raise HTTPException(status_code=400, detail="Cluster IDs cannot be empty")
        
        if source_id == target_id:
            raise HTTPException(status_code=400, detail="Cannot merge cluster into itself")
        
        labels = load_labels()
        
        if source_id not in labels:
            raise HTTPException(status_code=404, detail=f"Source cluster not found: {source_id}")
        if target_id not in labels:
            raise HTTPException(status_code=404, detail=f"Target cluster not found: {target_id}")
        
        source_cluster = labels[source_id]
        target_cluster = labels[target_id]
        
        if not isinstance(source_cluster, dict) or not isinstance(target_cluster, dict):
            raise HTTPException(status_code=400, detail="Invalid cluster data")
        
        # Get source cluster name before deletion (for logging)
        source_name = source_cluster.get("name", "Unknown")
        target_name = target_cluster.get("name", "Unknown")
        
        # Get ALL photos from source cluster (confirmed + embedding-based)
        source_confirmed = source_cluster.get("confirmed_photos", [])
        target_confirmed = target_cluster.get("confirmed_photos", [])
        
        # Get ALL media_ids with this source label from face_embeddings
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT DISTINCT media_id FROM face_embeddings WHERE label = ?",
                (source_id,)
            )
            embedding_based_media = [row[0] for row in cursor.fetchall()]
        
        # Combine confirmed and embedding-based photos (avoid duplicates)
        all_source_photos = list(set(source_confirmed + embedding_based_media))
        
        # Merge confirmed photos - add source photos to target
        merged_confirmed = list(set(target_confirmed + source_confirmed))
        target_cluster["confirmed_photos"] = merged_confirmed
        
        # Update ALL face embeddings with source label to target label
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE face_embeddings SET label = ? WHERE label = ?",
                (target_id, source_id)
            )
            conn.commit()
            print(f"[DEBUG] Updated {cursor.rowcount} face embeddings from label {source_id} to {target_id}")
        
        # Delete source cluster from labels
        del labels[source_id]
        
        # Save labels
        save_labels(labels)
        print(f"[DEBUG] Merged cluster '{source_name}' ({source_id}) into '{target_name}' ({target_id}). Moved {len(all_source_photos)} total photos ({len(source_confirmed)} confirmed, {len(embedding_based_media)} embedding-based).")
        
        # Clear cache
        global _face_clusters_cache
        _face_clusters_cache["data"] = None
        
        return {
            "success": True,
            "target_cluster_id": target_id,
            "target_cluster_name": target_name,
            "source_cluster_name": source_name,
            "photos_moved": len(all_source_photos),
            "confirmed_photos_moved": len(source_confirmed),
            "embedding_photos_moved": len(embedding_based_media),
            "total_in_target": len(merged_confirmed),
            "message": f"Merged {len(all_source_photos)} photos from '{source_name}' into '{target_name}' (confirmed: {len(source_confirmed)}, detected: {len(embedding_based_media)})"
        }
    except HTTPException as he:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to merge clusters: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/faces/create-cluster")
async def create_new_cluster(request: CreateClusterRequest):
    """Create a new empty face cluster with the given name."""
    global _face_clusters_cache
    try:
        cluster_name = request.name.strip()
        if not cluster_name:
            raise HTTPException(status_code=400, detail="Cluster name cannot be empty")
        
        # Generate a unique cluster ID
        import uuid
        cluster_id = f"user_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        
        print(f"[DEBUG] Creating new cluster: {cluster_id} with name: {cluster_name}")
        
        # Load labels and create new cluster entry
        labels = load_labels()
        
        if cluster_id in labels:
            # Extremely unlikely, but handle collision
            cluster_id = f"user_{int(time.time())}_{uuid.uuid4().hex[:16]}"
        
        labels[cluster_id] = {
            "name": cluster_name,
            "confirmed_photos": [],
            "hidden": False,
            "created_at": int(time.time())
        }
        
        # Save labels
        save_labels(labels)
        print(f"[DEBUG] New cluster saved to labels")
        
        # Clear the clusters cache
        _face_clusters_cache["data"] = None
        
        return {
            "success": True,
            "id": cluster_id,
            "name": cluster_name,
            "message": f"Cluster '{cluster_name}' created successfully"
        }
    except HTTPException as he:
        print(f"[API_ERROR] HTTP Exception in create_new_cluster: {he.detail}")
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to create cluster: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed: {str(e)}")


# ==================== FOLDER MANAGEMENT ENDPOINTS ====================

class FolderDownloadRequest(BaseModel):
    """Request to download folder contents as ZIP."""
    pass


@app.post("/api/folders/{folder_id}/zip")
async def download_folder_as_zip(folder_id: str):
    """
    Download folder contents as ZIP file.
    NOTE: This endpoint requires folder data from frontend (since folders are client-side).
    Frontend must provide folder contents.
    """
    import zipfile
    import io
    from pathlib import Path
    
    try:
        # For now, return a message that this needs to be called with folder data
        # In a real implementation, the frontend would POST the media IDs
        raise HTTPException(
            status_code=400,
            detail="This endpoint needs to be called via POST with folder data"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create ZIP: {str(e)}")


class FolderZipDownloadRequest(BaseModel):
    """Request body for downloading folder as ZIP."""
    mediaIds: List[int]
    folderName: str


@app.post("/api/folders/download-zip")
async def download_folder_zip(request: FolderZipDownloadRequest):
    """
    Download folder contents as ZIP file.
    Takes media IDs from the folder and creates a ZIP.
    """
    import zipfile
    import io
    from pathlib import Path
    
    print(f"[DEBUG] download_folder_zip called with mediaIds: {request.mediaIds}, folderName: {request.folderName}")
    
    try:
        if not request.mediaIds:
            raise HTTPException(status_code=400, detail="No media to download")
        
        if len(request.mediaIds) > 1000:
            raise HTTPException(status_code=400, detail="Too many files (max 1000)")
        
        # Get database connection using context manager
        with get_db() as db:
            cursor = db.cursor()
            
            # Get all media file paths for the given IDs
            placeholders = ",".join("?" * len(request.mediaIds))
            cursor.execute(
                f"SELECT id, path FROM media_files WHERE id IN ({placeholders})",
                request.mediaIds
            )
            rows = cursor.fetchall()
        
        if not rows:
            raise HTTPException(status_code=404, detail="No media found")
        
        # Create ZIP in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for media_id, file_path in rows:
                path_obj = Path(file_path)
                
                if not path_obj.exists():
                    print(f"[WARNING] File not found: {file_path}")
                    continue
                
                # Use original filename
                arcname = path_obj.name
                
                # Handle duplicate filenames by adding media ID
                counter = 1
                base_name = path_obj.stem
                suffix = path_obj.suffix
                original_arcname = arcname
                
                while arcname in zip_file.namelist():
                    arcname = f"{base_name}_{media_id}{suffix}"
                    counter += 1
                
                try:
                    zip_file.write(file_path, arcname=arcname)
                except Exception as e:
                    print(f"[WARNING] Failed to add {file_path} to ZIP: {e}")
                    continue
        
        zip_buffer.seek(0)
        
        # Create a safe filename for the ZIP
        safe_folder_name = "".join(c for c in request.folderName if c.isalnum() or c in (' ', '-', '_')).rstrip()
        if not safe_folder_name:
            safe_folder_name = "folder"
        
        zip_filename = f"{safe_folder_name}.zip"
        
        # Return the ZIP as a StreamingResponse
        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            iter([zip_buffer.getvalue()]),
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={zip_filename}"}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to create folder ZIP: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed: {str(e)}")


# ============================================================================
# Virtual Folders API
# ============================================================================

@app.post("/api/folders", response_model=FolderResponse)
async def create_folder(request: CreateFolderRequest, silo_name: str = Query(None)):
    """Create a new virtual folder.
    
    CRITICAL SECURITY: silo_name parameter ensures folders are created in the correct silo only.
    """
    check_read_only()  # Prevent folder creation in demo mode
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        from .silo_manager import SiloManager
        # CRITICAL: Use silo_name parameter directly if provided, otherwise get active silo
        current_silo_name = silo_name
        if not current_silo_name:
            current_silo = SiloManager.get_active_silo()
            current_silo_name = current_silo.get("name", "default") if current_silo else "default"
        
        print(f"[API] create_folder for silo: {current_silo_name}, name: {request.name}, parentId: {request.parentId}", flush=True)
        with get_db() as db:
            service = FolderService(db, silo_id=current_silo_name)
            folder = service.create_folder(
                name=request.name,
                parent_id=request.parentId,
                description=request.description
            )
            print(f"[API] ✓ Created folder: {folder}", flush=True)
            return folder
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[API_ERROR] Failed to create folder: {e}", flush=True)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/folders", response_model=List[FolderResponse])
async def list_folders(parent_id: Optional[int] = None, silo_name: str = Query(None)):
    """List folders. If parent_id is None, returns root folders.
    
    CRITICAL SECURITY: silo_name parameter ensures folders are from the correct silo only.
    """
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        from .silo_manager import SiloManager
        # CRITICAL: Use silo_name parameter directly if provided, otherwise get active silo
        current_silo_name = silo_name
        if not current_silo_name:
            current_silo = SiloManager.get_active_silo()
            current_silo_name = current_silo.get("name", "default") if current_silo else "default"
        
        print(f"[API] list_folders for silo: {current_silo_name}", flush=True)
        with get_db() as db:
            service = FolderService(db, silo_id=current_silo_name)
            
            # CRITICAL: Migrate folders from 'default' silo on first access
            # This handles legacy folders created before per-silo database support
            migrated = service.migrate_folders_from_default()
            if migrated > 0:
                print(f"[API] Migrated {migrated} folders to silo '{current_silo_name}'", flush=True)
            
            folders = service.list_folders(parent_id=parent_id)
            return folders
    except Exception as e:
        print(f"[API_ERROR] Failed to list folders: {e}", flush=True)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/folders/{folder_id}", response_model=FolderResponse)
async def get_folder(folder_id: int, silo_name: str = Query(None)):
    """Get a specific folder by ID.
    
    CRITICAL SECURITY: silo_name parameter ensures folder is from the correct silo only.
    """
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        from .silo_manager import SiloManager
        # CRITICAL: Use silo_name parameter directly if provided, otherwise get active silo
        current_silo_name = silo_name
        if not current_silo_name:
            current_silo = SiloManager.get_active_silo()
            current_silo_name = current_silo.get("name", "default") if current_silo else "default"
        
        with get_db() as db:
            service = FolderService(db, silo_id=current_silo_name)
            folder = service.get_folder(folder_id)
            if not folder:
                raise HTTPException(status_code=404, detail=f"Folder {folder_id} not found")
            return folder
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to get folder: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(folder_id: int, request: UpdateFolderRequest, silo_name: str = Query(None)):
    """Update folder name and/or description.
    
    CRITICAL SECURITY: silo_name parameter ensures folder is updated in the correct silo only.
    """
    check_read_only()  # Prevent folder updates in demo mode
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        from .silo_manager import SiloManager
        # CRITICAL: Use silo_name parameter directly if provided, otherwise get active silo
        current_silo_name = silo_name
        if not current_silo_name:
            current_silo = SiloManager.get_active_silo()
            current_silo_name = current_silo.get("name", "default") if current_silo else "default"
        
        print(f"[API] update_folder for silo: {current_silo_name}", flush=True)
        with get_db() as db:
            service = FolderService(db, silo_id=current_silo_name)
            folder = service.update_folder(
                folder_id=folder_id,
                name=request.name,
                description=request.description
            )
            return folder
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"[API_ERROR] Failed to update folder: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/folders/{folder_id}")
async def delete_folder(folder_id: int, recursive: bool = False, silo_name: str = Query(None)):
    """Delete a folder.
    
    CRITICAL SECURITY: silo_name parameter ensures folder is deleted from the correct silo only.
    """
    check_read_only()  # Prevent folder deletion in demo mode
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        from .silo_manager import SiloManager
        # CRITICAL: Use silo_name parameter directly if provided, otherwise get active silo
        current_silo_name = silo_name
        if not current_silo_name:
            current_silo = SiloManager.get_active_silo()
            current_silo_name = current_silo.get("name", "default") if current_silo else "default"
        
        print(f"[API] delete_folder for silo: {current_silo_name}", flush=True)
        with get_db() as db:
            service = FolderService(db, silo_id=current_silo_name)
            deleted = service.delete_folder(folder_id=folder_id, recursive=recursive)
            if not deleted:
                raise HTTPException(status_code=404, detail=f"Folder {folder_id} not found")
            return {"success": True, "message": f"Folder {folder_id} deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to delete folder: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/folders/{folder_id}/contents", response_model=FolderContentsResponse)
async def get_folder_contents(folder_id: int, limit: int = 1000, offset: int = 0, silo_name: str = Query(None)):
    """Get media files in a folder with pagination.
    
    CRITICAL SECURITY: silo_name parameter ensures folder contents are from the correct silo only.
    """
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        from .silo_manager import SiloManager
        # CRITICAL: Use silo_name parameter directly if provided, otherwise get active silo
        current_silo_name = silo_name
        if not current_silo_name:
            current_silo = SiloManager.get_active_silo()
            current_silo_name = current_silo.get("name", "default") if current_silo else "default"
        
        print(f"[API] get_folder_contents for silo: {current_silo_name}, folder_id: {folder_id}", flush=True)
        with get_db() as db:
            service = FolderService(db, silo_id=current_silo_name)
            contents = service.get_folder_contents(
                folder_id=folder_id,
                limit=limit,
                offset=offset
            )
            return contents
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"[API_ERROR] Failed to get folder contents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/folders/{folder_id}/add-media", response_model=Dict[str, Any])
async def add_media_to_folder(folder_id: int, request: AddMediaToFolderRequest, silo_name: str = Query(None)):
    """Add media to folder."""
    check_read_only()  # Prevent adding media in demo mode
    check_read_only()  # Prevent adding media to folders in demo mode
    """Add one or more media files to a folder - HIGHLY OPTIMIZED for speed.
    
    CRITICAL SECURITY: silo_name parameter ensures media is added to folder in the correct silo only.
    """
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        from .silo_manager import SiloManager
        # CRITICAL: Use silo_name parameter directly if provided, otherwise get active silo
        current_silo_name = silo_name
        if not current_silo_name:
            current_silo = SiloManager.get_active_silo()
            current_silo_name = current_silo.get("name", "default") if current_silo else "default"
        
        print(f"[API] add_media_to_folder for silo: {current_silo_name}, folder_id: {folder_id}", flush=True)
        with get_db() as db:
            service = FolderService(db, silo_id=current_silo_name)
            added_ids = service.add_media_to_folder(
                folder_id=folder_id,
                media_ids=request.mediaIds
            )
            
            # Return immediately with minimal response
            return {
                "success": True,
                "folderId": folder_id,
                "addedCount": len(added_ids),
                "addedMediaIds": added_ids,
                "timestamp": int(time.time() * 1000)
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[API_ERROR] Failed to add media to folder: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/folders/{folder_id}/remove-media", response_model=Dict[str, Any])
async def remove_media_from_folder(folder_id: int, request: AddMediaToFolderRequest, silo_name: str = Query(None)):
    """Remove media from folder."""
    check_read_only()  # Prevent removing media in demo mode
    check_read_only()  # Prevent removing media from folders in demo mode
    """Remove media files from a folder.
    
    CRITICAL SECURITY: silo_name parameter ensures media is removed from folder in the correct silo only.
    """
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        from .silo_manager import SiloManager
        # CRITICAL: Use silo_name parameter directly if provided, otherwise get active silo
        current_silo_name = silo_name
        if not current_silo_name:
            current_silo = SiloManager.get_active_silo()
            current_silo_name = current_silo.get("name", "default") if current_silo else "default"
        
        print(f"[API] remove_media_from_folder for silo: {current_silo_name}, folder_id: {folder_id}", flush=True)
        with get_db() as db:
            service = FolderService(db, silo_id=current_silo_name)
            removed_count = service.remove_media_from_folder(
                folder_id=folder_id,
                media_ids=request.mediaIds
            )
            return {
                "success": True,
                "folderId": folder_id,
                "removedCount": removed_count
            }
    except Exception as e:
        print(f"[API_ERROR] Failed to remove media from folder: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/folders/{folder_id}/health", response_model=Dict[str, Any])
async def check_folder_ready(folder_id: int, silo_name: str = Query(None)):
    """Quick health check to see if folder is ready to accept drops. Super fast response.
    
    CRITICAL SECURITY: silo_name parameter ensures folder health is checked in the correct silo only.
    """
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        from .silo_manager import SiloManager
        # CRITICAL: Use silo_name parameter directly if provided, otherwise get active silo
        current_silo_name = silo_name
        if not current_silo_name:
            current_silo = SiloManager.get_active_silo()
            current_silo_name = current_silo.get("name", "default") if current_silo else "default"
        
        with get_db() as db:
            service = FolderService(db, silo_id=current_silo_name)
            folder = service.get_folder(folder_id)
            if not folder:
                raise HTTPException(status_code=404, detail="Folder not found")
            
            return {
                "ready": True,
                "folderId": folder_id,
                "folderName": folder["name"],
                "timestamp": int(time.time() * 1000)
            }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Folder health check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/media/{media_id}/folders", response_model=List[FolderResponse])
async def get_media_folders(media_id: int, silo_name: str = Query(None)):
    """Get all folders that contain a specific media file.
    
    CRITICAL SECURITY: silo_name parameter ensures folders are from the correct silo only.
    """
    # CRITICAL SECURITY: Validate silo context
    if silo_name:
        _set_processing_silo(silo_name)
    
    try:
        from .silo_manager import SiloManager
        # CRITICAL: Use silo_name parameter directly if provided, otherwise get active silo
        current_silo_name = silo_name
        if not current_silo_name:
            current_silo = SiloManager.get_active_silo()
            current_silo_name = current_silo.get("name", "default") if current_silo else "default"
        
        print(f"[API] get_media_folders for silo: {current_silo_name}, media_id: {media_id}", flush=True)
        with get_db() as db:
            service = FolderService(db, silo_id=current_silo_name)
            folders = service.get_media_folders(media_id=media_id)
            return folders
    except Exception as e:
        print(f"[API_ERROR] Failed to get media folders: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Favorites API endpoints
@app.post("/api/media/{media_id}/favorite")
async def toggle_favorite(media_id: int):
    """Toggle favorite status for a media file. Persists to database."""
    try:
        with get_db() as conn:
            # Check current favorite status
            cur = conn.execute("SELECT is_bookmarked FROM media_files WHERE id = ?", (media_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Media not found")
            
            current_status = bool(row[0])
            new_status = not current_status
            
            # Update favorite status in database
            conn.execute(
                "UPDATE media_files SET is_bookmarked = ?, updated_at = ? WHERE id = ?",
                (new_status, int(time.time()), media_id)
            )
            conn.commit()
        
        return {"success": True, "media_id": media_id, "is_favorite": new_status}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to toggle favorite: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/media/{media_id}/favorite")
async def get_favorite_status(media_id: int):
    """Get favorite status for a media file."""
    try:
        with get_db() as conn:
            cur = conn.execute("SELECT is_bookmarked FROM media_files WHERE id = ?", (media_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Media not found")
            
            is_favorite = bool(row[0])
        
        return {"media_id": media_id, "is_favorite": is_favorite}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to get favorite status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/favorites")
async def get_all_favorites():
    """Get all favorite media IDs."""
    try:
        with get_db() as conn:
            cur = conn.execute("SELECT id FROM media_files WHERE is_bookmarked = 1 ORDER BY updated_at DESC")
            rows = cur.fetchall()
            favorite_ids = [row[0] for row in rows]
        
        return {"favorites": favorite_ids, "count": len(favorite_ids)}
    except Exception as e:
        print(f"[API_ERROR] Failed to get favorites: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/favorites/batch")
async def batch_update_favorites(request: dict = Body(...)):
    """Batch update favorite status for multiple media files."""
    try:
        media_ids = request.get("media_ids", [])
        is_favorite = request.get("is_favorite", False)
        
        if not media_ids:
            return {"success": False, "message": "No media IDs provided"}
        
        with get_db() as conn:
            placeholders = ",".join("?" * len(media_ids))
            conn.execute(
                f"UPDATE media_files SET is_bookmarked = ?, updated_at = ? WHERE id IN ({placeholders})",
                [is_favorite, int(time.time())] + media_ids
            )
            conn.commit()
        
        return {"success": True, "updated_count": len(media_ids), "is_favorite": is_favorite}
    except Exception as e:
        print(f"[API_ERROR] Failed to batch update favorites: {e}")
        raise HTTPException(status_code=500, detail=str(e))

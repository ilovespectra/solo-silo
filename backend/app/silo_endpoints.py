"""
Silo API Endpoints

Provides REST API for silo management:
- Create/delete silos
- Switch between silos
- Download/upload databases
- Nuke database
"""

from fastapi import APIRouter, HTTPException, Body, File, UploadFile
from pydantic import BaseModel
from typing import Optional, List
import os
import json
import zipfile
import sqlite3
from pathlib import Path
import hashlib
import tempfile
import shutil
from cryptography.fernet import Fernet
import secrets

from .silo_manager import SiloManager

router = APIRouter(prefix="/api/silos", tags=["silos"])


class CreateSiloRequest(BaseModel):
    name: str
    password: Optional[str] = None
    password_mode: Optional[str] = "first_access"  # "instantly" or "first_access"


class SwitchSiloRequest(BaseModel):
    name: str
    password: Optional[str] = None


class SaveSiloRequest(BaseModel):
    name: str
    password: Optional[str] = None
    password_mode: Optional[str] = "first_access"


class SiloInfo(BaseModel):
    name: str
    created_at: Optional[str] = None
    has_password: bool
    password_mode: Optional[str]
    is_active: bool


class SetMediaPathsRequest(BaseModel):
    paths: List[str]


@router.get("/list", response_model=List[SiloInfo])
async def list_silos():
    """Get list of all silos."""
    try:
        silos = SiloManager.list_silos()
        return silos
    except Exception as e:
        print(f"[API_ERROR] Failed to list silos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/active")
async def get_active_silo():
    """Get currently active silo."""
    try:
        silo = SiloManager.get_active_silo()
        if not silo:
            raise HTTPException(status_code=404, detail="No active silo")
        
        return {
            "name": silo.get("name"),
            "created_at": silo.get("created_at"),
            "has_password": silo.get("password") is not None,
            "password_mode": silo.get("password_mode")
        }
    except Exception as e:
        print(f"[API_ERROR] Failed to get active silo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create")
async def create_silo(request: CreateSiloRequest = Body(...)):
    """Create a new silo."""
    try:
        success, message = SiloManager.create_silo(
            name=request.name,
            password=request.password,
            password_mode=request.password_mode or "first_access"
        )
        
        if not success:
            raise HTTPException(status_code=400, detail=message)
        
        return {
            "success": True,
            "message": message,
            "silo_name": request.name
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to create silo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/switch")
async def switch_silo(request: SwitchSiloRequest = Body(...)):
    """Switch to a different silo."""
    try:
        success, message = SiloManager.switch_silo(
            name=request.name,
            password=request.password
        )
        
        if not success:
            raise HTTPException(status_code=400, detail=message)
        
        return {
            "success": True,
            "message": message,
            "silo_name": request.name
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to switch silo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save-current")
async def save_current_silo(request: SaveSiloRequest = Body(...)):
    """Save/name the current silo with optional password."""
    try:
        success, message = SiloManager.save_silo_name(
            name=request.name,
            password=request.password,
            password_mode=request.password_mode or "first_access"
        )
        
        if not success:
            raise HTTPException(status_code=400, detail=message)
        
        return {
            "success": True,
            "message": message,
            "silo_name": request.name
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to save silo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{silo_name}")
async def delete_silo(silo_name: str):
    """Delete a silo."""
    try:
        success, message = SiloManager.delete_silo(silo_name)
        
        if not success:
            raise HTTPException(status_code=400, detail=message)
        
        return {
            "success": True,
            "message": message
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to delete silo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{silo_name}/media-paths")
async def set_silo_media_paths(silo_name: str, request: SetMediaPathsRequest = Body(...)):
    """Set media paths for a silo. This persists the paths to silos.json."""
    try:
        print(f"[SILO] Setting media paths for '{silo_name}': {request.paths}")
        success = SiloManager.set_silo_media_paths(silo_name, request.paths)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Silo '{silo_name}' not found")
        
        return {
            "success": True,
            "message": f"Media paths updated for silo '{silo_name}'",
            "paths": request.paths
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to set media paths: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{silo_name}/media-paths")
async def get_silo_media_paths(silo_name: str):
    """Get media paths for a silo."""
    try:
        paths = SiloManager.get_silo_media_paths(silo_name)
        return {
            "silo_name": silo_name,
            "paths": paths
        }
    except Exception as e:
        print(f"[API_ERROR] Failed to get media paths: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download")
async def download_database(silo_name: Optional[str] = None):
    """
    Download current silo's database as encrypted ZIP.
    
    Returns encrypted ZIP file that can be uploaded later.
    """
    try:
        if not silo_name:
            silo = SiloManager.get_active_silo()
            silo_name = silo.get("name") if silo else "unknown"
        
        db_path = SiloManager.get_silo_db_path(silo_name)
        cache_dir = SiloManager.get_silo_cache_dir(silo_name)
        
        if not os.path.exists(db_path):
            raise HTTPException(status_code=404, detail="Database not found")
        
        # Create temporary directory for ZIP
        with tempfile.TemporaryDirectory() as temp_dir:
            zip_path = os.path.join(temp_dir, f"silo_{silo_name}.zip")
            
            # Create ZIP with database and cache files
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                # Add database
                zf.write(db_path, arcname="personalai.db")
                
                # Add cache files
                cache_files = [
                    "people.json", "faiss.index", "faiss_ids.npy",
                    "people_cluster_cache.json", "rotations.json",
                    "user_config.json", "animals.json"
                ]
                
                for cache_file in cache_files:
                    file_path = os.path.join(cache_dir, cache_file)
                    if os.path.exists(file_path):
                        zf.write(file_path, arcname=cache_file)
            
            # Generate encryption key
            encryption_key = Fernet.generate_key()
            cipher = Fernet(encryption_key)
            
            # Encrypt ZIP
            with open(zip_path, 'rb') as f:
                zip_data = f.read()
            
            encrypted_data = cipher.encrypt(zip_data)
            
            # Store encryption key in metadata
            metadata = {
                "silo_name": silo_name,
                "created_at": str(datetime.now()),
                "encryption_key": encryption_key.decode()
            }
            
            metadata_path = os.path.join(temp_dir, "metadata.json")
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f)
            
            # Create final encrypted ZIP
            final_zip_path = os.path.join(temp_dir, f"silo_{silo_name}_encrypted.zip")
            with zipfile.ZipFile(final_zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.write(metadata_path, arcname="metadata.json")
                zf.writestr("data.bin", encrypted_data)
            
            # Read and return
            with open(final_zip_path, 'rb') as f:
                return f.read()
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to download database: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_database(file: UploadFile = File(...), silo_name: Optional[str] = None):
    """
    Upload and merge a database into current silo.
    
    Handles deduplication based on file hash.
    """
    try:
        if not silo_name:
            silo = SiloManager.get_active_silo()
            silo_name = silo.get("name") if silo else "unknown"
        
        # Save uploaded file temporarily
        with tempfile.TemporaryDirectory() as temp_dir:
            upload_path = os.path.join(temp_dir, file.filename)
            
            with open(upload_path, 'wb') as f:
                content = await file.read()
                f.write(content)
            
            # Extract encrypted ZIP
            with zipfile.ZipFile(upload_path, 'r') as zf:
                zf.extractall(temp_dir)
            
            # Load metadata
            metadata_path = os.path.join(temp_dir, "metadata.json")
            if not os.path.exists(metadata_path):
                raise HTTPException(status_code=400, detail="Invalid upload format")
            
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            
            # Decrypt data
            encryption_key = metadata.get("encryption_key", "").encode()
            cipher = Fernet(encryption_key)
            
            data_path = os.path.join(temp_dir, "data.bin")
            with open(data_path, 'rb') as f:
                encrypted_data = f.read()
            
            try:
                decrypted_zip = cipher.decrypt(encrypted_data)
            except Exception as e:
                raise HTTPException(status_code=400, detail="Failed to decrypt database")
            
            # Extract decrypted data
            decrypted_zip_path = os.path.join(temp_dir, "decrypted.zip")
            with open(decrypted_zip_path, 'wb') as f:
                f.write(decrypted_zip)
            
            # Extract decrypted ZIP
            with zipfile.ZipFile(decrypted_zip_path, 'r') as zf:
                zf.extractall(temp_dir)
            
            # Merge databases
            source_db = os.path.join(temp_dir, "personalai.db")
            target_db = SiloManager.get_silo_db_path(silo_name)
            target_cache = SiloManager.get_silo_cache_dir(silo_name)
            
            merge_result = _merge_databases(source_db, target_db)
            
            # Merge cache files
            cache_files = [
                "people.json", "faiss.index", "faiss_ids.npy",
                "people_cluster_cache.json", "rotations.json",
                "user_config.json", "animals.json"
            ]
            
            for cache_file in cache_files:
                source_file = os.path.join(temp_dir, cache_file)
                if os.path.exists(source_file):
                    target_file = os.path.join(target_cache, cache_file)
                    if cache_file.endswith(".json"):
                        _merge_json_files(source_file, target_file)
                    else:
                        shutil.copy2(source_file, target_file)
            
            # Get list of folders to re-index
            folders_to_index = []
            target_conn = sqlite3.connect(target_db)
            target_cur = target_conn.cursor()
            target_cur.execute("SELECT DISTINCT path FROM folders")
            folders_to_index = [row[0] for row in target_cur.fetchall()]
            target_conn.close()
            
            # Trigger indexing for all imported folders
            if folders_to_index:
                import asyncio
                from .indexer import index_path
                from .main import _get_silo_indexing_state
                
                indexing_state = _get_silo_indexing_state()
                
                print(f"[UPLOAD] Triggering re-indexing for {len(folders_to_index)} folders")
                
                # Initialize progress tracking
                indexing_state["status"] = "indexing_imported"
                indexing_state["total"] = 0
                indexing_state["processed"] = 0
                indexing_state["current_file"] = f"Preparing to index {len(folders_to_index)} folders..."
                
                # Index each folder (run in background task)
                try:
                    for folder_path in folders_to_index:
                        if os.path.exists(folder_path):
                            print(f"[UPLOAD] Re-indexing folder: {folder_path}")
                            await index_path(folder_path)
                except Exception as e:
                    print(f"[UPLOAD] Warning: Re-indexing failed: {e}")
                    # Don't fail the upload if indexing fails - data is still valid
            
            return {
                "success": True,
                "message": "Database merged successfully and re-indexing started",
                "merge_result": merge_result,
                "indexing_triggered": len(folders_to_index) > 0,
                "folders_to_index": folders_to_index
            }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API_ERROR] Failed to upload database: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/nuke")
async def nuke_database(silo_name: Optional[str] = None):
    """
    completely erase current silo's database.
    
    this cannot be undone!
    """
    try:
        if not silo_name:
            silo = SiloManager.get_active_silo()
            silo_name = silo.get("name") if silo else "unknown"
        
        db_path = SiloManager.get_silo_db_path(silo_name)
        cache_dir = SiloManager.get_silo_cache_dir(silo_name)
        
        # Delete database
        if os.path.exists(db_path):
            os.remove(db_path)
        
        # Delete cache files
        cache_files = [
            "people.json", "faiss.index", "faiss_ids.npy",
            "people_cluster_cache.json", "rotations.json",
            "user_config.json", "animals.json"
        ]
        
        for cache_file in cache_files:
            file_path = os.path.join(cache_dir, cache_file)
            if os.path.exists(file_path):
                os.remove(file_path)
        
        # Recreate empty database
        SiloManager._create_empty_database(db_path)
        
        return {
            "success": True,
            "message": f"database for silo '{silo_name}' has been erased"
        }
    
    except Exception as e:
        print(f"[API_ERROR] failed to nuke database: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rename")
async def rename_silo(old_name: str = Body(...), new_name: str = Body(...), password: Optional[str] = Body(None)):
    """
    rename a silo. requires password if silo is password-protected.
    """
    try:
        success, message = SiloManager.rename_silo(old_name, new_name, password)
        
        if not success:
            raise HTTPException(status_code=400, detail=message)
        
        return {
            "success": True,
            "message": message
        }
    
    except Exception as e:
        print(f"[API_ERROR] failed to rename silo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update-password")
async def update_password(silo_name: str = Body(...), current_password: Optional[str] = Body(None), new_password: Optional[str] = Body(None), password_mode: Optional[str] = Body(None)):
    """
    update silo password. requires current password if silo is password-protected.
    """
    try:
        success, message = SiloManager.update_silo_password(silo_name, current_password, new_password, password_mode)
        
        if not success:
            raise HTTPException(status_code=400, detail=message)
        
        return {
            "success": True,
            "message": message
        }
    
    except Exception as e:
        print(f"[API_ERROR] failed to update password: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _merge_databases(source_db: str, target_db: str) -> dict:
    """
    merge source database into target, skipping duplicates by hash.
    
    returns merge statistics.
    """
    try:
        source_conn = sqlite3.connect(source_db)
        target_conn = sqlite3.connect(target_db)
        
        source_cur = source_conn.cursor()
        target_cur = target_conn.cursor()
        
        # Get existing hashes in target
        target_cur.execute("SELECT hash FROM media_files WHERE hash IS NOT NULL")
        existing_hashes = set(row[0] for row in target_cur.fetchall())
        
        # Copy unique files from source
        source_cur.execute("SELECT * FROM media_files ORDER BY id")
        source_files = source_cur.fetchall()
        
        skipped = 0
        imported = 0
        
        for file_row in source_files:
            file_hash = file_row[2]  # hash column
            
            if file_hash and file_hash in existing_hashes:
                skipped += 1
                continue
            
            # Insert unique file
            try:
                target_cur.execute(
                    """INSERT OR IGNORE INTO media_files 
                       (path, hash, type, date_taken, location, size, width, height,
                        camera, lens, objects, faces, animals, created_at, updated_at,
                        is_hidden, face_detection_attempted, is_bookmarked, rotation)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    file_row[1:]  # Skip ID, let DB auto-generate
                )
                imported += 1
            except Exception as e:
                print(f"[MERGE] Failed to import file {file_row[1]}: {e}")
        
        target_conn.commit()
        source_conn.close()
        target_conn.close()
        
        return {
            "imported": imported,
            "skipped": skipped,
            "message": f"Imported {imported} files, skipped {skipped} duplicates"
        }
    
    except Exception as e:
        print(f"[ERROR] Database merge failed: {e}")
        return {
            "imported": 0,
            "skipped": 0,
            "error": str(e)
        }


def _merge_json_files(source_path: str, target_path: str):
    """Merge JSON files (for people.json, config files, etc.)."""
    try:
        source_data = {}
        target_data = {}
        
        if os.path.exists(source_path):
            with open(source_path, 'r') as f:
                source_data = json.load(f)
        
        if os.path.exists(target_path):
            with open(target_path, 'r') as f:
                target_data = json.load(f)
        
        # Merge (source overrides target for conflicts)
        merged = {**target_data, **source_data}
        
        # Write merged data
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, 'w') as f:
            json.dump(merged, f, indent=2)
    
    except Exception as e:
        print(f"[ERROR] JSON merge failed: {e}")


# Import datetime at top
from datetime import datetime

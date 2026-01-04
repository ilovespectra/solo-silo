"""
Silo Management System

Manages multiple isolated photo libraries (silos), each with their own:
- Database (personalai.db)
- Cache files (people.json, faiss.index, etc.)
- Embeddings
- Settings

Each silo has optional password protection and can be seamlessly switched.
"""

import json
import os
import hashlib
import shutil
import zipfile
import sqlite3
from pathlib import Path
from typing import Optional, Dict, List
from datetime import datetime
import secrets

SILOS_FILE = os.path.join(os.path.dirname(__file__), "..", "silos.json")
CACHE_BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")
DEFAULT_SILO_NAME = "default"

# Demo mode configuration
# Try backend/demo-silo first (for deployment), fallback to public/demo-silo (for local dev)
class SiloManager:
    """Manages silo creation, switching, and operations."""
    
    @staticmethod
    def load_silos() -> dict:
        """Load all silos metadata."""
        if not os.path.exists(SILOS_FILE):
            return SiloManager._create_default_silos()
        
        try:
            with open(SILOS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[ERROR] Failed to load silos: {e}")
            return SiloManager._create_default_silos()
    
    @staticmethod
    def _create_default_silos() -> dict:
        """Create initial silos metadata with default silo."""
        silos = {
            "active_silo": DEFAULT_SILO_NAME,
            "silos": {
                DEFAULT_SILO_NAME: {
                    "name": DEFAULT_SILO_NAME,
                    "created_at": datetime.now().isoformat(),
                    "password": None,
                    "password_mode": None,  # "instantly" or "first_access"
                    "authenticated": True,  # Default silo starts authenticated
                    "db_path": os.path.join(CACHE_BASE_DIR, "personalai.db"),
                    "cache_dir": CACHE_BASE_DIR,
                    "media_paths": []  # Each silo has its own media sources
                }
            }
        }
        SiloManager.save_silos(silos)
        return silos
    
    @staticmethod
    def save_silos(silos: dict) -> bool:
        """Save silos metadata."""
        try:
            os.makedirs(os.path.dirname(SILOS_FILE), exist_ok=True)
            with open(SILOS_FILE, "w", encoding="utf-8") as f:
                json.dump(silos, f, indent=2)
            return True
        except Exception as e:
            print(f"[ERROR] Failed to save silos: {e}")
            return False
    
    @staticmethod
    def get_active_silo() -> Optional[dict]:
        """Get the currently active silo."""
        silos = SiloManager.load_silos()
        active_name = silos.get("active_silo", DEFAULT_SILO_NAME)
        return silos["silos"].get(active_name)
    
    @staticmethod
    def create_silo(name: str, password: Optional[str] = None, 
                   password_mode: str = "first_access") -> tuple[bool, str]:
        """
        Create a new silo.
        
        Args:
            name: Silo name
            password: Optional password (None = no password)
            password_mode: "instantly" or "first_access"
        
        Returns:
            (success, message)
        """
        if not name or len(name) < 1:
            return False, "Silo name required"
        
        silos = SiloManager.load_silos()
        
        if name in silos["silos"]:
            return False, f"Silo '{name}' already exists"
        
        try:
            # Create silo cache directory
            silo_cache_dir = os.path.join(CACHE_BASE_DIR, f"silos", name)
            os.makedirs(silo_cache_dir, exist_ok=True)
            print(f"[SILO_CREATE] Created cache directory: {silo_cache_dir}", flush=True)
            
            # Create new empty database for this silo
            db_path = os.path.join(silo_cache_dir, "personalai.db")
            print(f"[SILO_CREATE] Creating database at: {db_path}", flush=True)
            SiloManager._create_empty_database(db_path)
            print(f"[SILO_CREATE] ✓ Database created successfully", flush=True)
            
            # Add silo metadata
            silo_data = {
                "name": name,
                "created_at": datetime.now().isoformat(),
                "password": SiloManager._hash_password(password) if password else None,
                "password_mode": password_mode if password else None,
                "authenticated": True,  # New silos start authenticated
                "db_path": db_path,
                "cache_dir": silo_cache_dir,
                "media_paths": []  # Empty by default; user adds sources per silo
            }
            
            silos["silos"][name] = silo_data
            
            if SiloManager.save_silos(silos):
                print(f"[SILO_CREATE] ✓ Created new silo: {name}", flush=True)
                return True, f"Silo '{name}' created successfully"
            else:
                print(f"[SILO_CREATE] ERROR: Failed to save silos.json", flush=True)
                return False, "Failed to save silo configuration"
                
        except Exception as e:
            error_msg = f"[SILO_CREATE] ERROR creating silo '{name}': {e}"
            print(error_msg, flush=True)
            import traceback
            traceback.print_exc()
            return False, str(e)
    
    @staticmethod
    def switch_silo(name: str, password: Optional[str] = None) -> tuple[bool, str]:
        """
        Switch to a different silo.
        
        Args:
            name: Silo name
            password: Password if silo is protected
        
        Returns:
            (success, message)
        """
        silos = SiloManager.load_silos()
        
        if name not in silos["silos"]:
            return False, f"Silo '{name}' not found"
        
        silo = silos["silos"][name]
        
        # Check password if required
        if silo.get("password"):
            password_mode = silo.get("password_mode", "first_access")
            
            # If "instantly" mode, always require password
            # If "first_access" mode, check if already authenticated
            if password_mode == "instantly" or not silo.get("authenticated", False):
                if not password:
                    return False, "Password required"
                
                if not SiloManager._verify_password(password, silo["password"]):
                    return False, "Invalid password"
                
                # Mark as authenticated
                silo["authenticated"] = True
        
        # Update active silo
        silos["active_silo"] = name
        
        if SiloManager.save_silos(silos):
            print(f"[SILO] Switched to silo: {name}")
            return True, f"Switched to silo '{name}'"
        
        return False, "Failed to switch silo"
    
    @staticmethod
    def save_silo_name(name: str, password: Optional[str] = None,
                       password_mode: str = "first_access") -> tuple[bool, str]:
        """
        Save/name the current (default) silo.
        
        Args:
            name: New name for the silo
            password: Optional password
            password_mode: "instantly" or "first_access"
        
        Returns:
            (success, message)
        """
        silos = SiloManager.load_silos()
        
        if name in silos["silos"] and name != DEFAULT_SILO_NAME:
            return False, f"Silo name '{name}' already exists"
        
        # If renaming default silo
        if DEFAULT_SILO_NAME in silos["silos"] and name != DEFAULT_SILO_NAME:
            default_silo = silos["silos"][DEFAULT_SILO_NAME]
            
            # Create new cache directory for renamed silo
            silo_cache_dir = os.path.join(CACHE_BASE_DIR, "silos", name)
            os.makedirs(silo_cache_dir, exist_ok=True)
            
            # Copy existing database to new location
            new_db_path = os.path.join(silo_cache_dir, "personalai.db")
            old_db_path = default_silo["db_path"]
            
            if os.path.exists(old_db_path):
                shutil.copy2(old_db_path, new_db_path)
            
            # Copy cache files
            for cache_file in ["people.json", "faiss.index", "faiss_ids.npy", 
                             "people_cluster_cache.json", "rotations.json", "user_config.json"]:
                old_path = os.path.join(CACHE_BASE_DIR, cache_file)
                if os.path.exists(old_path):
                    new_path = os.path.join(silo_cache_dir, cache_file)
                    if os.path.isfile(old_path):
                        shutil.copy2(old_path, new_path)
            
            # Update silo data
            silo_data = {
                "name": name,
                "created_at": default_silo.get("created_at", datetime.now().isoformat()),
                "password": SiloManager._hash_password(password) if password else None,
                "password_mode": password_mode if password else None,
                "authenticated": True,
                "db_path": new_db_path,
                "cache_dir": silo_cache_dir
            }
            
            silos["silos"][name] = silo_data
            silos["active_silo"] = name
            
            # Remove default silo entry if different name
            if name != DEFAULT_SILO_NAME:
                del silos["silos"][DEFAULT_SILO_NAME]
        else:
            # Update existing silo
            if name in silos["silos"]:
                silos["silos"][name]["password"] = SiloManager._hash_password(password) if password else None
                silos["silos"][name]["password_mode"] = password_mode if password else None
        
        if SiloManager.save_silos(silos):
            print(f"[SILO] Saved silo as: {name}")
            return True, f"Silo saved as '{name}'"
        
        return False, "Failed to save silo"
    
    @staticmethod
    def delete_silo(name: str) -> tuple[bool, str]:
        """Delete a silo and all its data."""
        if name == DEFAULT_SILO_NAME:
            return False, "Cannot delete default silo"
        
        silos = SiloManager.load_silos()
        
        if name not in silos["silos"]:
            return False, f"Silo '{name}' not found"
        
        silo = silos["silos"][name]
        cache_dir = silo.get("cache_dir")
        
        # Remove cache directory
        if cache_dir and os.path.exists(cache_dir):
            try:
                shutil.rmtree(cache_dir)
            except Exception as e:
                print(f"[ERROR] Failed to delete cache dir: {e}")
        
        # Remove from silos
        del silos["silos"][name]
        
        # If this was active silo, switch to default
        if silos.get("active_silo") == name:
            silos["active_silo"] = DEFAULT_SILO_NAME
        
        if SiloManager.save_silos(silos):
            print(f"[SILO] Deleted silo: {name}")
            return True, f"Silo '{name}' deleted"
        
        return False, "Failed to delete silo"
    
    @staticmethod
    def list_silos() -> List[dict]:
        """Get list of all silos."""
        silos = SiloManager.load_silos()
        silo_list = []
        
        for name, data in silos.get("silos", {}).items():
            silo_list.append({
                "name": name,
                "created_at": data.get("created_at"),
                "has_password": data.get("password") is not None,
                "password_mode": data.get("password_mode"),
                "is_active": silos.get("active_silo") == name
            })
        
        return silo_list
    
    @staticmethod
    def get_silo_db_path(silo_name: Optional[str] = None) -> str:
        """Get database path for a silo. Creates path if needed, ensures silo exists."""
        # CRITICAL: Check if there's a processing silo set by main.py
        if not silo_name:
            try:
                from . import main
                if hasattr(main, '_currently_processing_silo') and main._currently_processing_silo:
                    silo_name = main._currently_processing_silo
                    print(f"[GET_SILO_DB_PATH] Using processing silo: {silo_name}", flush=True)
            except:
                pass
        
        if not silo_name:
            silo = SiloManager.get_active_silo()
            silo_name = silo.get("name") if silo else None
            if not silo_name:
                raise ValueError("[GET_SILO_DB_PATH] No active silo found and no silo_name provided")
            print(f"[GET_SILO_DB_PATH] No processing silo, using active silo: {silo_name}", flush=True)
        else:
            silos = SiloManager.load_silos()
            silo = silos["silos"].get(silo_name)
        
        if not silo:
            raise ValueError(f"[GET_SILO_DB_PATH] Silo '{silo_name}' not found in configuration")
        
        # Get the db_path - should always exist if silo exists
        db_path = silo.get("db_path")
        if not db_path:
            # Fallback: generate the expected path based on silo name
            db_path = os.path.join(CACHE_BASE_DIR, "silos", silo_name, "personalai.db")
            print(f"[GET_SILO_DB_PATH] No db_path in config, using default: {db_path}", flush=True)
        
        # CRITICAL: Normalize the path to resolve .. and expand user
        db_path = os.path.abspath(os.path.expanduser(db_path))
        print(f"[GET_SILO_DB_PATH] Returning normalized path: {db_path}", flush=True)
        return db_path
    
    @staticmethod
    def get_silo_cache_dir(silo_name: Optional[str] = None) -> str:
        """Get cache directory for a silo."""
        # CRITICAL: Check if there's a processing silo set by main.py
        if not silo_name:
            try:
                from . import main
                if hasattr(main, '_currently_processing_silo') and main._currently_processing_silo:
                    silo_name = main._currently_processing_silo
            except:
                pass
        
        if not silo_name:
            silo = SiloManager.get_active_silo()
        else:
            silos = SiloManager.load_silos()
            silo = silos["silos"].get(silo_name)
        
        if not silo:
            return CACHE_BASE_DIR
        
        return silo.get("cache_dir", CACHE_BASE_DIR)
    
    @staticmethod
    def get_silo_media_paths(silo_name: Optional[str] = None) -> List[str]:
        """Get media paths configured for a silo."""
        if not silo_name:
            silo = SiloManager.get_active_silo()
        else:
            silos = SiloManager.load_silos()
            silo = silos["silos"].get(silo_name)
        
        if not silo:
            return []
        
        return silo.get("media_paths", [])
    
    @staticmethod
    def set_silo_media_paths(silo_name: str, media_paths: List[str]) -> bool:
        """Set media paths for a silo."""
        silos = SiloManager.load_silos()
        
        if silo_name not in silos["silos"]:
            return False
        
        silos["silos"][silo_name]["media_paths"] = media_paths
        return SiloManager.save_silos(silos)
    
    @staticmethod
    def discover_and_set_silo_media_paths(silo_name: str) -> bool:
        """Discover media paths by scanning the silo's database for existing files."""
        try:
            db_path = SiloManager.get_silo_db_path(silo_name)
            if not os.path.exists(db_path):
                return False
            
            import sqlite3
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            
            # Get all unique parent directories from media files in this silo
            cur.execute("""
                SELECT DISTINCT 
                    SUBSTR(path, 1, INSTR(REVERSE(path), '/') - 1) as dir
                FROM media_files
                WHERE path IS NOT NULL
                ORDER BY dir
            """)
            
            # Convert file paths to their directory paths
            paths = set()
            for row in cur.fetchall():
                if row[0]:
                    dir_path = row[0]
                    # Get the root media directory (parent of found dir)
                    paths.add(dir_path)
            
            conn.close()
            
            if paths:
                media_paths = sorted(list(paths))
                print(f"[SILO] Discovered media paths for '{silo_name}': {media_paths}")
                return SiloManager.set_silo_media_paths(silo_name, media_paths)
            
            return False
        except Exception as e:
            print(f"[SILO] Failed to discover media paths for '{silo_name}': {e}")
            return False
    
    @staticmethod
    def _hash_password(password: str) -> str:
        """Hash a password using SHA256 + salt."""
        salt = secrets.token_hex(16)
        hash_obj = hashlib.sha256((password + salt).encode())
        return f"{salt}${hash_obj.hexdigest()}"
    
    @staticmethod
    def _verify_password(password: str, hash_str: str) -> bool:
        """Verify password against hash."""
        try:
            salt, hash_hex = hash_str.split("$")
            hash_obj = hashlib.sha256((password + salt).encode())
            return hash_obj.hexdigest() == hash_hex
        except:
            return False
    
    @staticmethod
    def _create_empty_database(db_path: str):
        """Create an empty database with full schema."""
        from . import db
        
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        
        conn = sqlite3.connect(db_path)
        conn.executescript(db.SCHEMA)
        conn.close()

    @staticmethod
    def rename_silo(old_name: str, new_name: str, password: Optional[str] = None) -> tuple[bool, str]:
        """Rename a silo. Requires password if silo is password-protected."""
        silos = SiloManager.load_silos()
        
        # Check if old silo exists
        if old_name not in silos["silos"]:
            return False, f"Silo '{old_name}' not found"
        
        # Check if new name already exists
        if new_name in silos["silos"]:
            return False, f"Silo '{new_name}' already exists"
        
        silo = silos["silos"][old_name]
        
        # Verify password if silo is password-protected
        if silo.get("password"):
            if not password:
                return False, "Password required to rename this silo"
            if not SiloManager._verify_password(password, silo.get("password")):
                return False, "Incorrect password"
        
        # Rename directory
        old_cache_dir = silo.get("cache_dir")
        new_cache_dir = os.path.join(CACHE_BASE_DIR, "silos", new_name)
        
        if os.path.exists(old_cache_dir):
            os.rename(old_cache_dir, new_cache_dir)
        
        # Update silo data
        silo["name"] = new_name
        silo["cache_dir"] = new_cache_dir
        silo["db_path"] = os.path.join(new_cache_dir, "personalai.db")
        
        silos["silos"][new_name] = silo
        del silos["silos"][old_name]
        
        # Update active silo if needed
        if silos["active_silo"] == old_name:
            silos["active_silo"] = new_name
        
        if SiloManager.save_silos(silos):
            print(f"[SILO] Renamed silo '{old_name}' to '{new_name}'")
            return True, f"Silo renamed to '{new_name}'"
        
        return False, "Failed to rename silo"
    
    @staticmethod
    def update_silo_password(silo_name: str, current_password: Optional[str] = None, new_password: Optional[str] = None, password_mode: Optional[str] = None) -> tuple[bool, str]:
        """Update a silo's password. Requires current password if silo is password-protected."""
        silos = SiloManager.load_silos()
        
        # Check if silo exists
        if silo_name not in silos["silos"]:
            return False, f"Silo '{silo_name}' not found"
        
        silo = silos["silos"][silo_name]
        
        # Verify current password if silo has password
        if silo.get("password"):
            if not current_password:
                return False, "Current password required to change password"
            if not SiloManager._verify_password(current_password, silo.get("password")):
                return False, "Incorrect password"
        
        # Update password
        if new_password:
            silo["password"] = SiloManager._hash_password(new_password)
            silo["password_mode"] = password_mode or "first_access"
        else:
            silo["password"] = None
            silo["password_mode"] = None
        
        if SiloManager.save_silos(silos):
            print(f"[SILO] Updated password for silo '{silo_name}'")
            return True, "Password updated successfully"
        
        return False, "Failed to update password"

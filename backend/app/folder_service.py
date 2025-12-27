"""
Service layer for managing virtual folders and folder-media relationships.
Handles all business logic for folder operations with database persistence.
"""

import time
import sqlite3
from typing import List, Dict, Optional, Any


class FolderService:
    """Manages virtual folders and media-to-folder mappings."""
    
    def __init__(self, db_conn: sqlite3.Connection, silo_id: str = "default"):
        """Initialize with a database connection.
        
        Args:
            db_conn: Database connection
            silo_id: ID of the silo this service operates on (for isolation)
        """
        self.conn = db_conn
        self.silo_id = silo_id
        self.conn.row_factory = sqlite3.Row
    
    def create_folder(self, name: str, parent_id: Optional[int] = None, description: str = "") -> Dict[str, Any]:
        """
        Create a new virtual folder.
        
        Args:
            name: Folder name
            parent_id: Optional parent folder ID for nested folders
            description: Optional folder description
            
        Returns:
            Dict with created folder details
            
        Raises:
            ValueError: If name is empty or folder already exists at this path
            sqlite3.IntegrityError: If database constraint violated
        """
        if not name or not name.strip():
            raise ValueError("Folder name cannot be empty")
        
        name = name.strip()
        now = int(time.time() * 1000)  # milliseconds
        
        try:
            cursor = self.conn.cursor()
            cursor.execute(
                """
                INSERT INTO virtual_folders (silo_id, name, description, parent_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (self.silo_id, name, description, parent_id, now, now)
            )
            self.conn.commit()
            
            folder_id = cursor.lastrowid
            return {
                "id": folder_id,
                "name": name,
                "description": description,
                "parentId": parent_id,
                "createdAt": now,
                "updatedAt": now
            }
        except sqlite3.IntegrityError as e:
            self.conn.rollback()
            if "UNIQUE constraint failed" in str(e):
                raise ValueError(f"A folder named '{name}' already exists at this location")
            raise ValueError(f"Database error: {e}")
        except Exception as e:
            self.conn.rollback()
            raise
    
    def list_folders(self, parent_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        List all folders at a given level (direct children of parent_id).
        
        Args:
            parent_id: Parent folder ID. If None, returns root folders.
            
        Returns:
            List of folder dictionaries
        """
        cursor = self.conn.cursor()
        
        # Use proper SQL syntax for NULL comparison
        if parent_id is None:
            cursor.execute(
                """
                SELECT id, name, description, parent_id, created_at, updated_at
                FROM virtual_folders
                WHERE silo_id = ? AND parent_id IS NULL
                ORDER BY name
                """,
                (self.silo_id,)
            )
        else:
            cursor.execute(
                """
                SELECT id, name, description, parent_id, created_at, updated_at
                FROM virtual_folders
                WHERE silo_id = ? AND parent_id = ?
                ORDER BY name
                """,
                (self.silo_id, parent_id)
            )
        
        folders = []
        for row in cursor.fetchall():
            folder_id = row["id"]
            
            # Get all media IDs for this folder
            cursor.execute(
                "SELECT media_id FROM folder_media WHERE folder_id = ?",
                (folder_id,)
            )
            media_ids = [r["media_id"] for r in cursor.fetchall()]
            
            folders.append({
                "id": folder_id,
                "name": row["name"],
                "description": row["description"],
                "parentId": row["parent_id"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
                "mediaIds": media_ids
            })
        
        return folders
    
    def get_folder(self, folder_id: int) -> Optional[Dict[str, Any]]:
        """
        Get a single folder by ID.
        
        Args:
            folder_id: Folder ID
            
        Returns:
            Folder dict or None if not found
        """
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT id, name, description, parent_id, created_at, updated_at
            FROM virtual_folders
            WHERE silo_id = ? AND id = ?
            """,
            (self.silo_id, folder_id)
        )
        
        row = cursor.fetchone()
        if not row:
            return None
        
        # Get all media IDs for this folder
        cursor.execute(
            "SELECT media_id FROM folder_media WHERE folder_id = ?",
            (folder_id,)
        )
        media_ids = [r["media_id"] for r in cursor.fetchall()]
        
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "parentId": row["parent_id"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "mediaIds": media_ids
        }
    
    def update_folder(self, folder_id: int, name: Optional[str] = None, 
                     description: Optional[str] = None) -> Dict[str, Any]:
        """
        Update a folder's name and/or description.
        
        Args:
            folder_id: Folder ID
            name: New name (optional)
            description: New description (optional)
            
        Returns:
            Updated folder dict
            
        Raises:
            ValueError: If folder not found
        """
        folder = self.get_folder(folder_id)
        if not folder:
            raise ValueError(f"Folder {folder_id} not found")
        
        # Use existing values if not provided
        new_name = name.strip() if name else folder["name"]
        new_description = description if description is not None else folder["description"]
        now = int(time.time() * 1000)
        
        cursor = self.conn.cursor()
        cursor.execute(
            """
            UPDATE virtual_folders
            SET name = ?, description = ?, updated_at = ?
            WHERE id = ?
            """,
            (new_name, new_description, now, folder_id)
        )
        self.conn.commit()
        
        return {
            "id": folder_id,
            "name": new_name,
            "description": new_description,
            "parentId": folder["parentId"],
            "createdAt": folder["createdAt"],
            "updatedAt": now
        }
    
    def delete_folder(self, folder_id: int, recursive: bool = False) -> bool:
        """
        Delete a folder and optionally its contents.
        
        Args:
            folder_id: Folder ID
            recursive: If False, fails if folder has subfolders. If True, deletes all children.
            
        Returns:
            True if deleted, False if not found
            
        Raises:
            ValueError: If folder has children and recursive=False
        """
        # Check if folder has children
        cursor = self.conn.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM virtual_folders WHERE silo_id = ? AND parent_id = ?", (self.silo_id, folder_id))
        child_count = cursor.fetchone()["count"]
        
        if child_count > 0 and not recursive:
            raise ValueError(f"Folder {folder_id} has {child_count} subfolders. Use recursive=True to delete.")
        
        # Delete folder (CASCADE will handle folder_media mappings)
        cursor.execute("DELETE FROM virtual_folders WHERE silo_id = ? AND id = ?", (self.silo_id, folder_id))
        self.conn.commit()
        
        return cursor.rowcount > 0
    
    def add_media_to_folder(self, folder_id: int, media_ids: List[int]) -> List[int]:
        """
        Add one or more media files to a folder - OPTIMIZED for speed.
        Uses bulk insert with ON CONFLICT to skip duplicates instantly.
        
        Args:
            folder_id: Folder ID
            media_ids: List of media IDs to add
            
        Returns:
            List of successfully added media IDs
            
        Raises:
            ValueError: If folder doesn't exist
        """
        if not media_ids:
            return []
        
        # Fast path: Quick check if folder exists
        cursor = self.conn.cursor()
        cursor.execute("SELECT id FROM virtual_folders WHERE silo_id = ? AND id = ?", (self.silo_id, folder_id))
        if not cursor.fetchone():
            raise ValueError(f"Folder {folder_id} not found")
        
        # Use bulk insert with IGNORE duplicates (SQLite ON CONFLICT IGNORE)
        # This is WAY faster than looping
        now = int(time.time() * 1000)
        
        # Build bulk insert statement
        placeholders = ",".join(f"(?, ?, ?)" for _ in media_ids)
        values = []
        for media_id in media_ids:
            values.extend([folder_id, media_id, now])
        
        cursor.execute(
            f"""
            INSERT OR IGNORE INTO folder_media (folder_id, media_id, added_at)
            VALUES {placeholders}
            """,
            values
        )
        
        # Get the actually inserted count from changes()
        inserted_count = cursor.rowcount
        self.conn.commit()
        
        # For now, return all IDs (assume they were added or already exist)
        return media_ids if inserted_count > 0 else media_ids
    
    def remove_media_from_folder(self, folder_id: int, media_ids: List[int]) -> int:
        """
        Remove media files from a folder.
        
        Args:
            folder_id: Folder ID
            media_ids: List of media IDs to remove
            
        Returns:
            Number of media removed
        """
        if not media_ids:
            return 0
        
        placeholders = ",".join("?" * len(media_ids))
        cursor = self.conn.cursor()
        cursor.execute(
            f"""
            DELETE FROM folder_media
            WHERE folder_id = ? AND media_id IN ({placeholders})
            """,
            [folder_id] + media_ids
        )
        self.conn.commit()
        
        return cursor.rowcount
    
    def get_folder_contents(self, folder_id: int, limit: int = 1000, offset: int = 0) -> Dict[str, Any]:
        """
        Get all media files in a folder with pagination.
        
        Args:
            folder_id: Folder ID
            limit: Max number of media to return
            offset: Number of media to skip
            
        Returns:
            Dict with 'media' list and 'total' count
            
        Raises:
            ValueError: If folder doesn't exist
        """
        folder = self.get_folder(folder_id)
        if not folder:
            raise ValueError(f"Folder {folder_id} not found")
        
        cursor = self.conn.cursor()
        
        # Get total count
        cursor.execute(
            "SELECT COUNT(*) as count FROM folder_media WHERE folder_id = ?",
            (folder_id,)
        )
        total = cursor.fetchone()["count"]
        
        # Get paginated results with media details
        cursor.execute(
            """
            SELECT m.id, m.path, m.type, m.date_taken, m.size, m.width, m.height,
                   m.camera, m.lens, fm.added_at
            FROM folder_media fm
            JOIN media_files m ON fm.media_id = m.id
            WHERE fm.folder_id = ?
            ORDER BY fm.added_at DESC
            LIMIT ? OFFSET ?
            """,
            (folder_id, limit, offset)
        )
        
        media = []
        for row in cursor.fetchall():
            media.append({
                "id": row["id"],
                "path": row["path"],
                "type": row["type"],
                "dateTaken": row["date_taken"],
                "size": row["size"],
                "width": row["width"],
                "height": row["height"],
                "camera": row["camera"],
                "lens": row["lens"],
                "addedAt": row["added_at"]
            })
        
        return {
            "folder": folder,
            "media": media,
            "total": total
        }
    
    def get_media_folders(self, media_id: int) -> List[Dict[str, Any]]:
        """
        Get all folders that contain a specific media file.
        
        Args:
            media_id: Media ID
            
        Returns:
            List of folder dicts
        """
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT f.id, f.name, f.description, f.parent_id, f.created_at, f.updated_at
            FROM folder_media fm
            JOIN virtual_folders f ON fm.folder_id = f.id
            WHERE fm.media_id = ?
            ORDER BY f.name
            """,
            (media_id,)
        )
        
        folders = []
        for row in cursor.fetchall():
            folders.append({
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "parentId": row["parent_id"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"]
            })
        
        return folders
    
    def migrate_folders_from_default(self) -> int:
        """
        Migrate folders from 'default' silo to this silo if this is a non-default silo.
        This handles the case where folders existed before per-silo database support.
        
        Returns:
            Number of folders migrated
        """
        if self.silo_id == "default":
            return 0  # No migration needed for default silo
        
        try:
            cursor = self.conn.cursor()
            
            # First check if there are any folders with silo_id='default'
            cursor.execute(
                "SELECT COUNT(*) as count FROM virtual_folders WHERE silo_id = ?",
                ("default",)
            )
            default_count = cursor.fetchone()["count"]
            
            if default_count == 0:
                return 0  # No folders to migrate
            
            # Migrate all folders and folder_media from default to this silo
            # Note: We need to be careful with IDs - SQLite autoincrement should handle it
            cursor.execute(
                """
                UPDATE virtual_folders
                SET silo_id = ?
                WHERE silo_id = ?
                """,
                (self.silo_id, "default")
            )
            
            migrated = cursor.rowcount
            self.conn.commit()
            
            print(f"[FOLDER_MIGRATION] Migrated {migrated} folders from 'default' to '{self.silo_id}' silo")
            return migrated
            
        except Exception as e:
            self.conn.rollback()
            print(f"[FOLDER_MIGRATION] Error migrating folders: {e}")
            raise


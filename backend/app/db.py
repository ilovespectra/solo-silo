import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator

# Import SiloManager for database path routing
def get_db_path():
    """Get the database path for the active silo.
    
    CRITICAL: Checks environment variable first (for subprocess context),
    falls back to SiloManager for in-process context.
    """
    # Check if PAI_DB is set by parent process (for silo context in subprocesses)
    if "PAI_DB" in os.environ:
        path = os.environ["PAI_DB"]
        print(f"[DB_PATH] Using PAI_DB env variable: {path}", flush=True)
        return path
    
    # Otherwise get silo-aware path from SiloManager
    from .silo_manager import SiloManager
    path = SiloManager.get_silo_db_path()
    print(f"[DB_PATH] Using silo manager: {path}", flush=True)
    return path

# Database schema: All tables use "CREATE TABLE IF NOT EXISTS"
# This means reindex operations NEVER delete or overwrite user data.
# Only new detections and embeddings are added; existing records are updated by hash.
SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS media_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    hash TEXT,
    type TEXT,
    date_taken INTEGER,
    location TEXT,
    size INTEGER,
    width INTEGER,
    height INTEGER,
    camera TEXT,
    lens TEXT,
    text_embedding BLOB,
    clip_embedding BLOB,
    objects TEXT,
    faces TEXT,
    animals TEXT,
    text_content TEXT,
    rotation INTEGER DEFAULT 0,
    is_bookmarked BOOLEAN DEFAULT 0,
    is_hidden BOOLEAN DEFAULT 0,
    face_detection_attempted BOOLEAN DEFAULT 0,
    search_keywords TEXT,
    created_at INTEGER,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS face_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER NOT NULL,
    embedding BLOB NOT NULL,
    bbox TEXT,
    confidence REAL,
    label TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS object_detections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER NOT NULL,
    class_name TEXT,
    confidence REAL,
    bbox TEXT,
    class_id INTEGER,
    source TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ocr_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER NOT NULL,
    text TEXT,
    confidence REAL,
    bbox TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS uncertain_detections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER NOT NULL,
    detection_type TEXT NOT NULL,
    class_name TEXT,
    confidence REAL,
    bbox TEXT,
    raw_data TEXT,
    reviewed BOOLEAN DEFAULT 0,
    approved BOOLEAN,
    user_label TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS search_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER NOT NULL,
    query TEXT NOT NULL,
    feedback TEXT NOT NULL,
    label TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS model_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER UNIQUE NOT NULL,
    timestamp INTEGER NOT NULL,
    base_model TEXT NOT NULL,
    training_samples INTEGER,
    confirmed_people INTEGER,
    metrics TEXT,
    description TEXT,
    active BOOLEAN DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_media_date ON media_files(date_taken DESC);
CREATE INDEX IF NOT EXISTS idx_media_type ON media_files(type);
CREATE INDEX IF NOT EXISTS idx_media_hash ON media_files(hash);
CREATE INDEX IF NOT EXISTS idx_uncertain_media ON uncertain_detections(media_id);
CREATE INDEX IF NOT EXISTS idx_uncertain_reviewed ON uncertain_detections(reviewed);
CREATE INDEX IF NOT EXISTS idx_uncertain_type ON uncertain_detections(detection_type);
CREATE INDEX IF NOT EXISTS idx_face_media ON face_embeddings(media_id);
CREATE INDEX IF NOT EXISTS idx_object_media ON object_detections(media_id);
CREATE INDEX IF NOT EXISTS idx_ocr_media ON ocr_results(media_id);
CREATE INDEX IF NOT EXISTS idx_feedback_query ON search_feedback(query);
CREATE INDEX IF NOT EXISTS idx_feedback_media ON search_feedback(media_id);

CREATE TABLE IF NOT EXISTS virtual_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    silo_id TEXT DEFAULT 'default' NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    parent_id INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES virtual_folders(id) ON DELETE CASCADE,
    UNIQUE(silo_id, parent_id, name)
);

CREATE TABLE IF NOT EXISTS folder_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL,
    added_at INTEGER NOT NULL,
    FOREIGN KEY (folder_id) REFERENCES virtual_folders(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE,
    UNIQUE(folder_id, media_id)
);

CREATE INDEX IF NOT EXISTS idx_folder_parent ON virtual_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folder_silo ON virtual_folders(silo_id);
CREATE INDEX IF NOT EXISTS idx_folder_media_folder ON folder_media(folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_media_media ON folder_media(media_id);
"""


def init_db(db_path: str = None) -> None:
    """Initialize database schema for a silo. If db_path not provided, uses active silo."""
    if db_path is None:
        db_path = get_db_path()
    
    print(f"[INIT_DB] Initializing database at: {db_path}", flush=True)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    try:
        with sqlite3.connect(db_path) as conn:
            # First, check if virtual_folders table exists and needs migration
            cursor = conn.cursor()
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='virtual_folders'"
            )
            vf_exists = cursor.fetchone() is not None
            
            if vf_exists:
                # Check if silo_id column exists
                cursor.execute("PRAGMA table_info(virtual_folders)")
                vf_columns = [col[1] for col in cursor.fetchall()]
                
                if 'silo_id' not in vf_columns:
                    print(f"[INIT_DB] Adding missing silo_id column to virtual_folders...", flush=True)
                    try:
                        cursor.execute("ALTER TABLE virtual_folders ADD COLUMN silo_id TEXT DEFAULT 'default' NOT NULL")
                        conn.commit()
                        print(f"[INIT_DB] ✓ Added silo_id column to virtual_folders", flush=True)
                    except sqlite3.OperationalError as e:
                        print(f"[INIT_DB] ERROR adding silo_id: {e}", flush=True)
                        raise
            
            # Now run the full schema
            print(f"[INIT_DB] Executing schema...", flush=True)
            conn.executescript(SCHEMA)
            print(f"[INIT_DB] Schema executed successfully", flush=True)
            
            # Run other migrations for existing databases
            cursor = conn.cursor()
            
            # Check which columns exist in media_files table
            cursor.execute("PRAGMA table_info(media_files)")
            columns = {col[1] for col in cursor.fetchall()}
            
            # Add missing columns one by one
            missing_columns = [
                ('is_hidden', 'BOOLEAN DEFAULT 0'),
                ('is_bookmarked', 'BOOLEAN DEFAULT 0'),
                ('rotation', 'INTEGER DEFAULT 0'),
                ('face_detection_attempted', 'BOOLEAN DEFAULT 0'),
                ('text_content', 'TEXT'),
                ('search_keywords', 'TEXT'),
            ]
            
            for col_name, col_type in missing_columns:
                if col_name not in columns:
                    try:
                        cursor.execute(f"ALTER TABLE media_files ADD COLUMN {col_name} {col_type}")
                        print(f"✓ Added {col_name} column to media_files table")
                    except sqlite3.OperationalError as e:
                        print(f"Note: {col_name} column already exists or migration skipped: {e}")
            
            conn.commit()
            print(f"[INIT_DB] ✓ Database initialization complete", flush=True)
    except Exception as e:
        print(f"[INIT_DB] FATAL ERROR: {e}", flush=True)
        import traceback
        traceback.print_exc()
        raise


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    """Get database connection for the active silo."""
    # Always get the current silo's DB path (in case silo switched)
    db_path = get_db_path()
    print(f"[GET_DB] Opening connection to: {db_path}", flush=True)
    
    # CRITICAL: Ensure database exists before trying to connect
    if not os.path.exists(db_path):
        print(f"[GET_DB] Database doesn't exist yet, initializing: {db_path}", flush=True)
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        init_db(db_path)
        print(f"[GET_DB] ✓ Database initialized", flush=True)
    
    conn = sqlite3.connect(db_path)
    try:
        yield conn
        conn.commit()  # AUTO-COMMIT on successful context exit
    except Exception:
        conn.rollback()  # ROLLBACK on error
        raise
    finally:
        conn.close()


__all__ = ["init_db", "get_db", "get_db_path"]

#!/usr/bin/env python3
"""
Cleanup utility to optimize storage on startup.
Keeps critical data (face embeddings) but removes:
- Old logs
- Build caches (.next)
- node_modules (can be reinstalled)
- Old thumbnails
- Database bloat
"""

import os
import sqlite3
import shutil
import glob
from pathlib import Path
from datetime import datetime, timedelta

REPO_ROOT = Path(__file__).parent.parent
BACKEND_CACHE = REPO_ROOT / 'backend' / 'cache'
FRONTEND_BUILD = REPO_ROOT / '.next'
NODE_MODULES = REPO_ROOT / 'node_modules'
LOGS_DIR = REPO_ROOT


def cleanup_logs():
    """Clear all log files - fresh slate each session."""
    log_files = glob.glob(f"{LOGS_DIR}/*.log") + glob.glob(f"{BACKEND_CACHE}/**/*.log", recursive=True)
    
    for log_file in log_files:
        try:
            if os.path.exists(log_file):
                os.remove(log_file)
                print(f"✓ Cleared log: {os.path.basename(log_file)}")
        except Exception as e:
            print(f"⚠ Failed to clear {log_file}: {e}")


def cleanup_build_cache():
    """Clear .next build cache - will be regenerated on next build."""
    if FRONTEND_BUILD.exists():
        try:
            shutil.rmtree(FRONTEND_BUILD)
            print(f"✓ Cleared .next build cache ({FRONTEND_BUILD})")
        except Exception as e:
            print(f"⚠ Failed to clear .next: {e}")


def cleanup_old_thumbnails(days=30):
    """Remove thumbnails older than N days (they can be regenerated)."""
    thumbnail_dirs = glob.glob(f"{BACKEND_CACHE}/**/thumbnails", recursive=True)
    cutoff_time = (datetime.now() - timedelta(days=days)).timestamp()
    
    total_freed = 0
    for thumb_dir in thumbnail_dirs:
        if not os.path.isdir(thumb_dir):
            continue
        
        try:
            for filename in os.listdir(thumb_dir):
                filepath = os.path.join(thumb_dir, filename)
                if os.path.isfile(filepath) and os.path.getmtime(filepath) < cutoff_time:
                    size = os.path.getsize(filepath)
                    os.remove(filepath)
                    total_freed += size
        except Exception as e:
            print(f"⚠ Error cleaning thumbnails in {thumb_dir}: {e}")
    
    if total_freed > 0:
        print(f"✓ Cleaned old thumbnails: {total_freed / 1024 / 1024:.1f}MB freed")


def compact_databases():
    """Optimize SQLite databases - removes bloat from deletions."""
    db_files = glob.glob(f"{BACKEND_CACHE}/**/*.db", recursive=True)
    
    for db_path in db_files:
        # Skip if it's a lock file
        if db_path.endswith('-shm') or db_path.endswith('-wal'):
            continue
        
        if not os.path.exists(db_path) or os.path.getsize(db_path) == 0:
            continue
        
        try:
            conn = sqlite3.connect(db_path)
            conn.execute('VACUUM')
            conn.close()
            print(f"✓ Compacted database: {os.path.basename(db_path)}")
        except Exception as e:
            print(f"⚠ Failed to compact {db_path}: {e}")


def analyze_space():
    """Show what's taking space."""
    print("\n📊 Storage Analysis:")
    print("=" * 60)
    
    paths = {
        '.git': REPO_ROOT / '.git',
        'node_modules': REPO_ROOT / 'node_modules',
        '.next': REPO_ROOT / '.next',
        'backend/cache': BACKEND_CACHE,
    }
    
    for name, path in paths.items():
        if path.exists():
            result = os.popen(f"du -sh '{path}' 2>/dev/null").read().strip().split()[0]
            print(f"  {name:20s}: {result}")
    
    print("=" * 60)


def main():
    print("\n🧹 Silo Cleanup Utility")
    print("=" * 60)
    
    # What we're keeping (critical for the app)
    print("\n✅ Keeping critical data:")
    print("  - Face embeddings (personalai.db)")
    print("  - Search indices (faiss.index)")
    print("  - User configurations (people.json, etc.)")
    print("  - Media database")
    
    # What we're cleaning
    print("\n🗑️  Cleaning non-critical data:")
    print("  - All log files (fresh slate each session)")
    print("  - Old thumbnails (>30 days)")
    print("  - Build cache (.next)")
    print("  - Database bloat (via VACUUM)")
    
    print("\n" + "=" * 60)
    print("Running cleanup...\n")
    
    cleanup_logs()
    cleanup_old_thumbnails(days=30)
    compact_databases()
    # Don't auto-delete .next or node_modules - let user decide
    # cleanup_build_cache()  # Too aggressive for now
    
    print("\n" + "=" * 60)
    analyze_space()
    print("\n✓ Cleanup complete!")
    print("\nNote: To further reduce space:")
    print("  - rm -rf node_modules && npm install  (745MB → 0 + reinstall)")
    print("  - rm -rf .next                         (110MB → regenerated on build)")
    print("  - git gc --aggressive                  (optimize git history)")


if __name__ == '__main__':
    main()

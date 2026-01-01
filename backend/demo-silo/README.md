# Demo Silo

This is a read-only demo silo for public deployments of Dudlefotos.

## Contents

- `personalai.db` - Pre-indexed demo database with sample media
- `people.json` - Demo face clusters
- `animals.json` - Demo animal detections
- `faiss.index` / `faiss_ids.npy` - Pre-built search index
- `user_config.json` - Demo user preferences

## How it Works

When the backend starts:
1. Checks if `backend/silos.json` exists
2. If NOT found → enters **demo mode**
3. Loads demo silo from `public/demo-silo/`
4. Demo mode is read-only (no modifications allowed)

## Local Development

Your local silos in `backend/cache/silos/` and `backend/silos.json` are gitignored.
They will never be committed, keeping your personal data private.

## Updating Demo Data

To update demo data:
1. Index `public/test-files/` in a local silo
2. Copy the resulting database and cache files to `public/demo-silo/`
3. Commit the changes

```bash
# Example: Create demo silo from test files
# (You'll need to run indexing on public/test-files first)
```

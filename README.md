# solo: silo (local development)

ai-powered photo management and search for your local files. everything runs on your machine—no cloud, no tracking, no internet required.

> **you're on the `local` branch** - for local development with full features. For the demo version, see the [`main` branch](https://github.com/ilovespectra/solo-silo/tree/main).

---

## 🚀 quick start

```bash
# Clone this branch
git clone -b local https://github.com/ilovespectra/solo-silo
cd solo-silo

# Start everything (automatically removes any demo data)
./start-all.sh

# Opens at http://localhost:3000 with full AI features
```

**first run takes 10-15 minutes** to download AI models and dependencies.

---

## features

- **🔍 semantic ai search**: clip-based search understands concepts, not just keywords
- **👥 face detection & clustering**: automatically group similar faces
- **🐾 animal detection**: identify and catalog pets and animals
- **📁 multi-silo support**: organize separate collections with isolated data
- **🎤 audio transcription**: search spoken content in audio/video files
- **⭐ favorites & virtual folders**: organize without moving files
- **📄 ocr text extraction**: search text found in images
- **🔒 privacy-first**: all processing happens locally, no data leaves your device

---

## installation requirements
**default when running locally.** full read/write access to your photo collections.

**how it works:**
- frontend next.js api routes proxy requests to local backend at `http://127.0.0.1:8000`
- backend processes all ai operations (face detection, search, clustering)
- all data stays on your machine

**to run locally:**
```bash
./start-all.sh
## installation requirements

- **node.js** 18+ 
- **python** 3.10+
- **~4gb free disk space** (for ai models)
- **8gb+ ram recommended** (for face clustering and large collections)

---

## what happens on first run

when you run `./start-all.sh` for the first time:

1. **environment setup** (~1 min)
   - creates python virtual environment
   - creates `.env.local` configuration
   - removes any demo data/configuration

2. **dependency installation** (~10-15 min)
   - python packages (pytorch, clip, faiss, etc.)
   - node packages (next.js, react, etc.)

3. **services start**
   - backend: http://localhost:8000 (fastapi)
   - frontend: http://localhost:3000 (next.js)

4. **first use**
   - follow the getting started tour
   - add your first photo directory
   - ai models download as needed

---

## stopping services

```bash
./stop-all.sh
```

---

## usage guide

### 1. add a photo source

click **"add source"** in the file browser and select a directory containing your photos.

### 2. indexing happens automatically

the backend will:
- scan for photos/videos
- generate clip embeddings for semantic search
- detect faces with yolo
- extract text via ocr
- detect animals

monitor progress in **settings → statistics**

### 3. cluster faces

after indexing, go to **retraining → cluster faces** to group similar faces together.

### 4. search your collection

use natural language to search:
- **"sunset over water"** - finds scenes semantically
- **"person wearing glasses"** - finds visual features
- **"documents with text"** - finds ocr content
- **"john smith"** - finds named people (after labeling)

---

## configuration

silo-specific configuration is managed through the ui settings panel. each silo has isolated:

- media paths (directories to index)
- database (personalai.db)
- cache files (faiss indices, thumbnails, clusters)
- user preferences (sort, display, confidence thresholds)

global backend settings in `backend/config.yaml`:

```yaml
processing:
  batch_size: 32
  workers: 4
  skip_videos: false
  
ai:
  face_detection: true
  animal_detection: true
  ocr_enabled: true
```

## project structure

```
solo-silo/
├── src/                    # next.js frontend
│   ├── app/               # app router pages
│   ├── components/        # react components
│   ├── lib/              # utilities and helpers
│   ├── store/            # zustand state management
│   └── types/            # typescript definitions
├── backend/               # fastapi backend
│   ├── app/              # api endpoints and services
│   ├── cache/            # runtime cache and indices
│   │   └── silos/        # per-silo data (gitignored)
│   └── requirements.txt  # python dependencies
├── public/                # static assets
│   ├── demo-silo/        # demo mode database (committed)
│   └── test-files/       # demo media files (committed)
└── backend/silos.json     # silo configuration (gitignored)
```

**tech stack**

**frontend**
- next.js 16 with app router
- react 19
- typescript
- zustand for state management
- tailwind css

**backend**
- fastapi
- pytorch & transformers
- faiss for vector search
- opencv & pillow for image processing
- deepface for face recognition
- ultralytics yolo for object detection
- easyocr for text extraction

**ai models (all open-source)**
- sentence-transformers for embeddings
- clip for image understanding
- yolov8 for object/animal detection
- deepface for face detection
- easyocr for text recognition

## features in detail

### search
- semantic search using natural language
- search by faces, animals, objects, text
- filter by file type, date, confidence
- search within specific virtual folders

### face management
- automatic face detection and clustering
- name faces to create searchable people
- review uncertain detections
- exclude/hide unwanted faces

### animal detection
- automatic pet and animal identification
- species classification
- name individual animals
- search by animal type or name

### silos
- separate photo collections (work, personal, etc)
- isolated indices and configurations
- switch between silos seamlessly
- per-silo favorites and folders

### virtual folders
- organize media without moving files
- create nested folder structures
- add same photo to multiple folders
- maintain original file locations

## development

```bash
# start development servers
npm run dev              # frontend on :3000
cd backend && uvicorn app.main:app --reload  # backend on :8000

# build for production
npm run build
npm run start

# lint
npm run lint
```

## stopping services

```bash
./stop-all.sh
```

kills all backend and frontend processes.

## troubleshooting

**port already in use**
```bash
./stop-all.sh  # stop all services
./start-all.sh # restart
```

**models not downloading**
- check internet connection (needed for first download only)
- ensure ~4gb free disk space
- models cache in `backend/cache/models/`

**search not finding results**
- wait for initial indexing to complete
- check media paths in silo settings
- rebuild index: settings → database → rebuild index

**face detection not working**
- ensure face detection is enabled in settings
- run face clustering: settings → retraining → cluster faces
- check backend logs: `backend/backend.log`

---

## demo mode deployment

### overview

demo mode allows you to deploy a public, read-only version of the application with sample data, while keeping your personal collections private.

**demo mode auto-activates when:**
- `backend/silos.json` file is not present
- uses demo database from `public/demo-silo/`
- displays "demo mode - read only" banner
- all write operations return `403 forbidden`

### creating a demo database

1. **prepare sample media**
   ```bash
   # add sample files to public/test-files/
   mkdir -p public/test-files/images
   # copy some demo photos/videos/documents
   ```

2. **build demo database**
   ```bash
   # ensure backend is running on port 8000
   ./build-demo-database.sh
   ```
   
   this script will:
   - create a temporary silo
   - index your sample files from `public/test-files/`
   - copy the database to `public/demo-silo/`
   - clean up the temporary silo

3. **test demo mode locally**
   ```bash
   # temporarily hide silos.json to activate demo mode
   mv backend/silos.json backend/silos.json.backup
   
   # restart backend - should show demo mode
   ./start-all.sh
   
   # verify demo mode at http://localhost:3000
   # check api: curl http://localhost:8000/api/system/mode
   
   # restore normal mode
   mv backend/silos.json.backup backend/silos.json
   ```

4. **commit demo files**
   ```bash
   git add public/demo-silo/
   git add public/test-files/
   git commit -m "add demo database"
   git push
   ```

### deployment checklist

for public demo deployment:

- ✅ `backend/silos.json` is in `.gitignore`
- ✅ `backend/cache/silos/` is in `.gitignore`
- ✅ `public/demo-silo/` is committed
- ✅ `public/test-files/` contains sample media
- ✅ demo database is indexed and functional
- ❌ do **not** commit `backend/silos.json`
- ❌ do **not** commit personal silo data

### demo vs local mode comparison

| feature | demo mode | local mode |
|---------|-----------|------------|
| data source | `public/demo-silo/` | `backend/cache/silos/` |
| media files | `public/test-files/` | user-configured paths |
| activation | no `silos.json` | `silos.json` present |
| write operations | ❌ disabled (403) | ✅ enabled |
| silo management | ❌ hidden | ✅ available |
| frontend banner | 🎯 demo mode | none |
| api endpoint | `/api/system/mode` | `/api/system/mode` |

### frontend/backend communication

**next.js proxy configuration** (`next.config.ts`):
```typescript
rewrites: async () => {
  return {
    beforeFiles: [
      // all /api requests proxy to backend on port 8000
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*',
      },
    ],
  };
}
```

**demo mode detection:**

backend exposes demo status via:
```bash
GET /api/system/mode
# returns: {"demo_mode": true, "read_only": true, "message": "..."}
```

frontend uses `useDemoMode()` hook:
```typescript
import { useDemoMode } from '@/hooks/useDemoMode';

const { demoMode } = useDemoMode();
// demoMode === true when backend is in demo mode
```

**protected operations in demo mode:**

all write endpoints check demo mode:
```python
def check_read_only():
    if SiloManager.is_demo_mode():
        raise HTTPException(403, "operation not allowed in demo mode")
```

protected endpoints:
- silo creation/deletion/management
- file uploads/deletions
- reindexing
- configuration changes
- face/animal labeling

### local development with demo mode disabled

to run locally with full features:

1. **ensure silos.json exists**
   ```bash
   # check if silos.json is present
   ls backend/silos.json
   
   # if missing, app will auto-create on first launch
   ./start-all.sh
   ```

2. **verify local mode**
   ```bash
   curl http://localhost:8000/api/system/mode
   # should return: {"demo_mode": false, "read_only": false, ...}
   ```

3. **configuration**
   
   **local mode uses:**
   - silo config: `backend/silos.json`
   - silo data: `backend/cache/silos/<silo-name>/`
   - media paths: configured per-silo in settings
   
   **demo mode uses:**
   - demo config: auto-generated by `SiloManager`
   - demo data: `public/demo-silo/personalai.db`
   - media paths: `public/test-files/`

4. **switching between modes**
   ```bash
   # activate demo mode: remove silos.json
   mv backend/silos.json backend/silos.json.backup
   
   # activate local mode: restore silos.json
   mv backend/silos.json.backup backend/silos.json
   
   # restart to apply changes
   ./stop-all.sh && ./start-all.sh
   ```

### production deployment

**for public demo (vercel, netlify, etc.):**

1. do **not** include `backend/silos.json` in deployment
2. ensure `public/demo-silo/` is committed
3. ensure `public/test-files/` has sample media
4. backend will auto-detect demo mode
5. frontend will show demo banner

**for private deployment:**

1. create `backend/silos.json` during deployment
2. configure media paths in silo settings
3. backend runs in full mode
4. all features enabled

see [DEMO_MODE.md](./DEMO_MODE.md) for detailed documentation.

---

## cache and data

all data stays on your machine:

- **ai models**: `backend/cache/` (downloaded on first use)
- **search indices**: per-silo in `backend/cache/silos/<silo>/faiss.index`
- **face clusters**: per-silo in `backend/cache/silos/<silo>/people.json`
- **thumbnails**: per-silo in `backend/cache/silos/<silo>/thumbnails/`
- **silo data**: `backend/cache/silos/<silo-name>/`

**demo mode data:**
- **demo database**: `public/demo-silo/personalai.db`
- **demo cache**: `public/demo-silo/`
- **demo media**: `public/test-files/`

to clear cache (local mode):
```bash
rm -rf backend/cache/silos/*
```

## license

MIT License - see LICENSE file

## contributing

contributions welcome! please follow the branch workflow:

### for features and bug fixes (local development)

1. **fork and clone the local branch**
   ```bash
   git clone -b local https://github.com/YOUR-USERNAME/solo-silo
   cd solo-silo
   git checkout -b feature/your-feature-name
   ```

2. **make your changes**
   - test with `./start-all.sh` to verify local mode works
   - ensure no demo mode residuals in your changes

3. **commit and push**
   ```bash
   git add .
   git commit -m "Add: your feature description"
   git push origin feature/your-feature-name
   ```

4. **create pull request to `local` branch**
   - pr should target the `local` branch
   - include screenshots/videos of changes
   - describe what was added/fixed

### for demo mode improvements

1. **fork and clone the main branch**
   ```bash
   git clone -b main https://github.com/YOUR-USERNAME/solo-silo
   cd solo-silo
   git checkout -b demo/your-improvement
   ```

2. **test on vercel**
   - ensure demo data is preserved
   - verify no backend dependencies
   - test with `NEXT_PUBLIC_DEMO_MODE=true`

3. **create pull request to `main` branch**
   - pr should target the `main` branch
   - verify changes work on vercel deployment

### branch workflow summary

- **`local` → `local`**: features, bug fixes, local development
- **`main` → `main`**: demo improvements, static assets, frontend-only changes
- changes from `local` branch are periodically merged to `main` (maintainer only)

---

**built for privacy. powered by local ai. owned by you.**

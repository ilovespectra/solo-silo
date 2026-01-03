# solo: silo

ai-powered media management and search. organize photos, videos, audio, and documents with local ai—no cloud, no tracking, no internet required.

> **📍 local development branch** - full features. For demo version, see [`main` branch](https://github.com/ilovespectra/solo-silo/tree/main).

---

## 🚀 quick start

```bash
git clone -b local https://github.com/ilovespectra/solo-silo
cd solo-silo
./start-all.sh
```

**requirements:** node.js 18+, python 3.10+, ~4gb disk space, 8gb+ ram recommended

**first run takes 10-15 minutes** to install dependencies and download ai models.

---

## getting started

1. **launch** - run `./start-all.sh` and open http://localhost:3000
2. **follow the tour** - interactive guide walks you through setup
3. **add media** - click "add source" and select a directory with photos/videos/audio/documents
4. **indexing** - ai processes your media automatically (monitor in settings)
5. **cluster faces** - go to retraining tab → "cluster faces"
6. **search** - use natural language to find anything in your collection

**stop services:** `./stop-all.sh`

---

## features

- **semantic search** - clip-based ai understands concepts and visual similarity across all media types
- **face detection & clustering** - automatically group similar faces in photos/videos, name people
- **animal detection** - identify and catalog pets and animals in photos/videos
- **ocr text extraction** - search text found in images and documents (pdf, images with text)
- **audio transcription** - search spoken content in audio/video files
- **video support** - thumbnail generation, frame analysis, full video playback
- **multi-silo support** - separate collections with isolated data (work, personal, etc)
- **virtual folders** - organize media without moving files
- **privacy-first** - all processing local, no cloud, no tracking

---

## how it works: offline ai

**silo runs 100% locally** - all ai processing happens on your machine. no data is sent to the cloud.

### search & embeddings
- **local processing:** clip models generate embeddings for all your media files on your device
- **semantic search:** understand concepts like "sunset over mountains" or "dogs playing in snow"
- **vector similarity:** faiss indexes embeddings for instant similarity search
- **completely offline:** once models are downloaded, no internet required for searching your indexed media

### face recognition
- **face detection:** yolo and deepface models scan photos/videos for faces
- **clustering:** hdbscan groups similar faces without needing names upfront  
- **biometric embeddings:** face recognition models create unique signatures for each face
- **local database:** all face data stored in sqlite on your machine

### other ai features
- **ocr (optical character recognition):** easyocr extracts text from images locally
- **object detection:** yolo identifies animals, objects in photos/videos
- **audio transcription:** whisper transcribes audio/video content locally

**internet only used for:**
- downloading open-source ai models on first use (~2gb total)
- checking for software updates (optional)

---

## tech stack

**frontend:** next.js 16, react 19, typescript, tailwind  
**backend:** fastapi, pytorch, clip, faiss, yolo, deepface, easyocr  
**ai models:** all open-source, downloaded on first use

---

## contributing

**for features/bug fixes:**

```bash
git clone -b local https://github.com/YOUR-USERNAME/solo-silo
git checkout -b feature/your-feature
# make changes, test with ./start-all.sh
git commit -m "your changes"
git push origin feature/your-feature
# create PR to `local` branch
```

**for demo improvements:**
- clone `main` branch instead
- PR to `main` branch

---

## license

MIT License

---

**built for privacy. powered by local ai. owned by you.**
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

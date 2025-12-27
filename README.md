# solo: silo

ai-powered photo management and search for your local files. everything runs on your machine—no cloud, no tracking, no internet required.

## features

- **local ai search**: semantic search across photos, videos, and audio using open-source models
- **face detection & clustering**: automatically detect and organize faces in your photos
- **animal detection**: identify and catalog pets and animals in your media
- **multi-silo support**: organize separate photo collections with isolated data
- **audio transcription & search**: search spoken content in audio/video files
- **favorites & virtual folders**: organize media without moving files
- **ocr text extraction**: search text found in images
- **privacy-first**: all processing happens locally, no data leaves your device

## quick start

### prerequisites

- node.js 18+
- python 3.10+
- ~4gb free disk space (for ai models)

### installation

1. **clone the repository**
   ```bash
   git clone <repository-url>
   cd solo-silo
   ```

2. **install dependencies**
   ```bash
   ./install_dependencies.sh
   ```
   
   this installs both frontend (npm) and backend (python) dependencies.

3. **start the application**
   ```bash
   ./start-all.sh
   ```
   
   this starts both the backend (port 8000) and frontend (port 3000).

4. **open in browser**
   ```
   http://localhost:3000
   ```

### manual setup (alternative)

if you prefer to start services separately:

**backend**
```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

**frontend**
```bash
npm run dev
```

## configuration

create `backend/config.yaml` to customize settings:

```yaml
storage:
  media_paths:
    - /path/to/your/photos
  thumbnail_path: ./cache/thumbnails

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
│   └── requirements.txt  # python dependencies
└── public/               # static assets
```

## tech stack

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

## cache and data

all data stays on your machine:

- **ai models**: `backend/cache/` (downloaded on first use)
- **search indices**: `backend/cache/faiss.index`
- **face clusters**: `backend/cache/people.json`
- **thumbnails**: `backend/cache/thumbnails/`
- **silo data**: `backend/cache/silos/<silo-name>/`

to clear cache:
```bash
rm -rf backend/cache/*
```

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

## license

[add your license here]

## contributing

[add contribution guidelines here]
- Audio transcription
- Full-text document indexing
- Performance optimizations

## 🐛 Known Limitations

1. **Model Initialization**: First-time loading may take 2-3 minutes
2. **Large Files**: Files > 1MB skipped for text content
3. **Face Recognition**: Requires high-quality, well-lit photos
4. **Indexing Performance**: Large directories may use significant CPU/RAM

## 💡 Tips & Tricks

### Optimizing Search
- Be specific: "beach vacation photos" vs "photos"
- Use natural language: "documents with API keys"
- Combine terms: "birthday party photos 2024"

### Improving Performance
- Limit indexed directories to what you need
- Close other applications during indexing
- Use search filters to narrow results

### Privacy Best Practices
- Review permissions before granting
- Don't grant unnecessary capabilities
- Regularly review indexed directories

## ❓ FAQ

**Q: Is my data safe?**
A: Completely. Everything stays on your computer. No internet connection needed.

**Q: How much disk space?**
A: ~2GB for models, plus <100MB per 100k indexed files.

**Q: Can I use this offline?**
A: Yes, completely offline after initial setup.

**Q: How accurate is face recognition?**
A: Best with clear, well-lit photos of faces.

**Q: Can I delete `.local` folder?**
A: Yes, it will recreate on next launch.

**Q: How do I uninstall?**
A: Delete the project folder. All data is local to this directory.

## 📄 License

MIT License - feel free to use, modify, and distribute.

## 🙏 Acknowledgments

Built with open-source technologies:
- Next.js community
- Hugging Face Transformers.js
- Tailwind CSS team

---

**Built for privacy. Powered by local AI. Owned by you.**

## 📋 How to Use

### Setup Wizard (First Launch)
1. **Welcome**: Understand what the app does
2. **Select Directories**: Choose folders to search
3. **Grant Permissions**: Enable capabilities you want (default: minimal)
4. **Review**: Confirm your settings

### File Browser
- Navigate with breadcrumb navigation
- Double-click to enter folders
- Click to select files
- View file metadata (size, modification date)

### Semantic Search
Natural language queries:
- "Find photos of concerts"
- "Show me GitHub projects"
- "Look for documents with environment variables"
- "Find pictures of my daughter [name]"

### Face Recognition (Coming Soon)
- View detected face clusters
- Rename faces with custom names
- Organize by person

## 🔐 Privacy & Security

### What We Don't Do
- ❌ No cloud uploads
- ❌ No internet connectivity required
- ❌ No external API calls
- ❌ No user tracking

### What We Do
- ✅ Process everything locally
- ✅ Cache models in `.local/models/`
- ✅ Store index in `.local/index/`
- ✅ Require explicit permission grants
- ✅ Respect OS file permissions

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# solo: silo

ai-powered photo management and search for your local files.

> **📍 you're viewing the demo branch.** this is the read-only demo deployed at [solo-silo.vercel.app](https://solo-silo.vercel.app).

---

## 🎭 try the live demo

**[solo-silo.vercel.app](https://solo-silo.vercel.app)**

explore a read-only demo with pre-indexed celebrity photos:
- ✅ browse face clusters (bowie, abdul, walken, dončić, tito)
- ✅ view detection statistics and processing logs
- ✅ see the full ui in action
- ❌ search disabled (requires local ai models)
- ❌ read-only (no modifications)

---

## 💻 want to use it with your photos?

**switch to the [`local` branch](https://github.com/ilovespectra/solo-silo/tree/local) for:**
- full semantic clip search
- face detection & clustering
- your own photo collections
- all features enabled

```bash
git clone -b local https://github.com/ilovespectra/solo-silo
cd solo-silo
./start-all.sh
```

**see the [`local` branch README](https://github.com/ilovespectra/solo-silo/tree/local#readme) for installation and usage instructions.**

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

## branches

- **`main`** (you are here) - demo version
- **[`local`](https://github.com/ilovespectra/solo-silo/tree/local)** - full version with local deployment instructions

---

## license

MIT License

---

**built for privacy. powered by local ai. owned by you.**

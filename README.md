# Local File Browser - Private AI-Powered Search

A sophisticated, open-source desktop application that brings AI-powered file search and management to your local machine—**without sending any data to the internet**.

## 🎯 Features

### Core Capabilities
- **Local AI-Powered Search**: Semantic search using open-source transformers models (no cloud required)
- **File Browser**: Modern, intuitive file management interface similar to Google Photos
- **Advanced Permissions**: Granular control over what the app can do
- **Zero Internet**: All processing happens locally on your device
- **Privacy-First**: No user data tracking or external API calls

### File Management
- 📁 **Browse & Navigate**: Intuitive directory exploration
- 📝 **File Operations**: Move, copy, rename, delete, create folders
- 🏷️ **Tagging & Organization**: Custom metadata and file organization
- 🔍 **Content Search**: Full-text semantic search across documents
- 📊 **File Statistics**: Sort by size, date modified, type, and relevance

### AI Features
- **Semantic Search**: Understand meaning behind queries (e.g., "photos of my daughter" finds matching images)
- **Image Analysis**: Detect objects and concepts in photos ("birthday party", "dogs", "beach")
- **Face Recognition & Clustering**: Identify and organize faces by person
- **Customizable Names**: Label detected faces with custom names
- **Text Analysis**: Extract and understand content from documents

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- ~2GB free disk space (for models)

### Installation & Running

```bash
# Development server

### Backend (FastAPI) — Local Indexer

1. Install Python dependencies (Python 3.10+):
     ```bash
     cd backend
     pip install -r requirements.txt
     ```

2. Run the API server:
     ```bash
     uvicorn app.main:app --reload --port 8000
     ```

3. Rebuild the media index:
     ```bash
     curl -X POST http://localhost:8000/api/index/rebuild
     ```

Configuration lives in `config.yaml` (optional). Example:
```yaml
storage:
  media_paths:
      - /path/to/photos
  thumbnail_path: ./cache/thumbnails
processing:
  batch_size: 32
  workers: 4
  skip_videos: false
```
npm run dev

# Production build
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🛠️ Technology Stack

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Zustand**: Lightweight state management
- **Tailwind CSS**: Responsive UI styling

### Backend
- **Next.js API Routes**: Server-side file operations
- **Node.js fs/path**: Safe file system access

### AI/ML
- **@xenova/transformers**: Open-source ONNX models
  - Text embedding: all-MiniLM-L6-v2
  - Image captioning: vit-gpt2-image-captioning
  - Zero-shot classification: mobilebert-uncased-mnli

## 📁 Project Structure

```
dudlefotos/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── files/           # File operations endpoints
│   │   │   ├── search/          # Search endpoint
│   │   │   └── indexing/        # Indexing endpoint
│   │   ├── page.tsx             # Main page
│   │   └── layout.tsx           # App layout
│   ├── components/
│   │   ├── FileBrowser/         # File browser UI
│   │   ├── SearchChat/          # Chat-like search interface
│   │   └── SetupWizard/         # Configuration wizard
│   ├── lib/
│   │   ├── ai/                  # AI model utilities
│   │   ├── file-system/         # File operations
│   │   ├── indexing/            # File indexing system
│   │   └── utils/               # Helper functions
│   ├── store/                   # Zustand state management
│   └── types/                   # TypeScript types
├── .local/
│   ├── models/                  # Cached AI models
│   └── index/                   # File index cache
└── public/                      # Static assets
```

## 💾 Local Data Storage

- **Models**: `.local/models/` - AI models are cached after first download
- **Index**: `.local/index/file-index.json` - Your file index
- **Config**: Stored in browser localStorage (no sensitive data)

All data stays on your device.

## 🎨 UI Features

### File Browser
- Directory navigation with breadcrumbs
- Multi-select file operations
- File metadata (size, modification date)
- Real-time permission checks

### Search Chat
- Natural language query interface
- Real-time search results
- Relevance scoring
- Result filtering and sorting

### Setup Wizard
- Step-by-step configuration
- Permission management with descriptions
- Path selection with validation
- Settings review before completion

## 🚦 Development Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

## 🔄 API Endpoints

### File Operations
```
GET  /api/files/browse?path=<path>&recursive=false
POST /api/files/operations
     body: { action: 'move'|'delete'|'rename'|'createFolder', ... }
```

### Search
```
POST /api/search
     body: { query: string, method: 'semantic'|'keyword', topK: 20 }
```

### Indexing
```
POST /api/indexing
     body: { path: string, recursive: true, includeContent: true }
GET  /api/indexing (stats)
```

## 🎯 Roadmap

### Phase 1 ✅ (Current)
- ✅ Basic file browsing
- ✅ Semantic search foundation
- ✅ Setup wizard
- ✅ Type definitions
- ✅ File operations API

### Phase 2 (Coming Soon)
- Face recognition & clustering
- Image batch operations
- Advanced search filters
- Export/backup features

### Phase 3 (Future)
- Video analysis
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

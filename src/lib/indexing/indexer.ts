import fs from 'fs';
import path from 'path';
import { FileIndex, DetectedObject, Permissions, IndexingProgress } from '@/types';
import { getFileExtension } from '@/lib/utils';
import { generateTextEmbedding, analyzeImage, COMMON_OBJECTS } from '@/lib/ai/models';

const INDEX_CACHE_DIR = '.local/index';
const INDEX_FILE = 'file-index.json';

export class FileIndexer {
  private indexPath: string;
  private index: Map<string, FileIndex>;
  private progressCallbacks: ((progress: IndexingProgress) => void)[] = [];
  private lastProgress: IndexingProgress | null = null;

  constructor() {
    this.indexPath = path.join(process.cwd(), INDEX_CACHE_DIR);
    this.index = new Map();
    this.ensureIndexDirectory();
    this.loadIndex();
  }

  private ensureIndexDirectory(): void {
    if (!fs.existsSync(this.indexPath)) {
      fs.mkdirSync(this.indexPath, { recursive: true });
    }
  }

  private loadIndex(): void {
    try {
      const filePath = path.join(this.indexPath, INDEX_FILE);
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        const entries = JSON.parse(data) as [string, FileIndex][];
        this.index = new Map(entries);
        console.log(`Loaded ${this.index.size} indexed files`);
      }
    } catch (error) {
      console.error('Error loading index:', error);
      this.index = new Map();
    }
  }

  private saveIndex(): void {
    try {
      const filePath = path.join(this.indexPath, INDEX_FILE);
      const entries = Array.from(this.index.entries());
      fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving index:', error);
    }
  }

  private emitProgress(progress: IndexingProgress): void {
    this.lastProgress = progress;
    this.progressCallbacks.forEach(callback => callback(progress));
  }

  onProgress(callback: (progress: IndexingProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  async indexFile(
    filePath: string,
    permissions: Permissions,
    includeContent: boolean = false
  ): Promise<FileIndex | null> {
    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        return null;
      }

      const extension = getFileExtension(filePath);
      const fileId = this.generateFileId(filePath);

      let textContent: string | undefined;
      let textEmbedding: number[] | undefined;

      if (includeContent && this.isTextFile(extension)) {
        try {
          textContent = fs.readFileSync(filePath, 'utf-8');
          if (textContent.length > 10000) {
            textContent = textContent.substring(0, 10000) + '...';
          }

          if (textContent && textContent.trim().length > 10) {
            console.log(`Generating embedding for ${path.basename(filePath)}...`);
            const embedding = await generateTextEmbedding(textContent);
            if (embedding && embedding.length > 0) {
              textEmbedding = embedding;
              console.log(`✓ Generated embedding (${embedding.length} dimensions)`);
            } else {
              console.warn(`Failed to generate embedding for ${filePath}`);
            }
          }
        } catch (error) {
          console.warn(`Could not read text content from ${filePath}:`, error);
        }
      }

      const fileIndex: FileIndex = {
        fileId,
        path: filePath,
        name: path.basename(filePath),
        type: extension,
        size: stats.size,
        textContent,
        textEmbedding: textEmbedding || undefined,
        objects: [],
        faces: [],
        metadata: {
          created: stats.birthtime.getTime(),
          modified: stats.mtime.getTime(),
        },
        lastIndexed: Date.now(),
      };

      if (permissions.analyzeImages && this.isImageFile(extension)) {
        try {
          console.log(`Analyzing image ${path.basename(filePath)}...`);
          const analysis = await analyzeImage(filePath);
          if (analysis) {
            const mappedObjects = [
              ...analysis.objects.map(o => ({ label: o.label, confidence: o.score })),
              ...analysis.categories.map(c => ({ label: c.label, confidence: c.score }))
            ];
            fileIndex.objects = mappedObjects;
            
            const personDetections = analysis.objects.filter(o => 
              o.label.toLowerCase().includes('person') || 
              o.label.toLowerCase().includes('face')
            );
            
            if (personDetections.length > 0) {
              fileIndex.faces = personDetections.map((p, i) => ({
                id: `face_${Date.now()}_${i}`,
                label: 'unknown',
                confidence: p.score
              }));
              console.log(`✓ Found ${personDetections.length} face(s)`);
            }
            
            console.log(`✓ Detected ${analysis.objects.length} objects`);
          }
        } catch (err) {
          console.warn('Image analysis failed for', fileIndex.path, err);
        }
      }

      this.index.set(fileId, fileIndex);
      return fileIndex;
    } catch (error) {
      console.error(`Error indexing file ${filePath}:`, error);
      return null;
    }
  }

  async indexDirectory(
    dirPath: string,
    permissions: Permissions,
    recursive: boolean = true,
    includeContent: boolean = false
  ): Promise<void> {
    try {
      const files = await this.getAllFiles(dirPath, recursive);
      const total = files.length;
      let processed = 0;

      this.emitProgress({
        currentFile: 'Preparing...',
        processed: 0,
        total,
        percentage: 0,
        status: 'scanning',
      });

      for (const file of files) {
        try {
          this.emitProgress({
            currentFile: file,
            processed,
            total,
            percentage: Math.round((processed / total) * 100),
            status: 'indexing',
          });

          await this.indexFile(file, permissions, includeContent);
          processed++;
        } catch (error) {
          console.error(`Error processing file ${file}:`, error);
        }
      }

      this.saveIndex();

      this.emitProgress({
        currentFile: 'Complete',
        processed: total,
        total,
        percentage: 100,
        status: 'complete',
      });
    } catch (error) {
      this.emitProgress({
        currentFile: 'Error',
        processed: 0,
        total: 0,
        percentage: 0,
        status: 'error',
        error: String(error),
      });
      console.error('Error indexing directory:', error);
    }
  }

  private async getAllFiles(dirPath: string, recursive: boolean): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.') || ['node_modules', '.git'].includes(entry.name)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory() && recursive) {
          files.push(...(await this.getAllFiles(fullPath, recursive)));
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
    }

    return files;
  }

  private isTextFile(extension: string): boolean {
    const textExtensions = [
      'txt',
      'md',
      'json',
      'xml',
      'html',
      'css',
      'js',
      'ts',
      'tsx',
      'jsx',
      'py',
      'java',
      'c',
      'cpp',
      'h',
      'yaml',
      'yml',
      'env',
      'log',
      'csv',
    ];
    return textExtensions.includes(extension.toLowerCase());
  }

  private isImageFile(extension: string): boolean {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    return imageExtensions.includes(extension.toLowerCase());
  }

  private generateFileId(filePath: string): string {
    return Buffer.from(filePath).toString('base64').substring(0, 32);
  }

  searchIndex(query: string): FileIndex[] {
    const results: FileIndex[] = [];

    for (const file of this.index.values()) {
      const searchableText = `${file.name} ${file.textContent || ''}`.toLowerCase();

      if (searchableText.includes(query.toLowerCase())) {
        results.push(file);
      }
    }

    return results;
  }

  getIndex(): Map<string, FileIndex> {
    return this.index;
  }

  getLastProgress(): IndexingProgress | null {
    return this.lastProgress;
  }

  clearIndex(): void {
    this.index.clear();
    try {
      const filePath = path.join(this.indexPath, INDEX_FILE);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error('Error clearing index file:', error);
    }
  }

  getIndexStats(): {
    totalFiles: number;
    totalSize: number;
    fileTypes: Record<string, number>;
  } {
    let totalSize = 0;
    const fileTypes: Record<string, number> = {};

    for (const file of this.index.values()) {
      totalSize += file.size;
      fileTypes[file.type] = (fileTypes[file.type] || 0) + 1;
    }

    return {
      totalFiles: this.index.size,
      totalSize,
      fileTypes,
    };
  }

  getEntitySummary(): {
    faces: { label: string; count: number }[];
    animals: { label: string; count: number }[];
  } {
    const faceCounts: Record<string, number> = {};
    const animalLabels = new Set(['dog', 'cat', 'bird', 'animal']);
    const animalCounts: Record<string, number> = {};

    for (const file of this.index.values()) {
      for (const f of file.faces || []) {
        const key = f.label || 'unknown';
        faceCounts[key] = (faceCounts[key] || 0) + 1;
      }
      for (const o of file.objects || []) {
        if (animalLabels.has(o.label)) {
          animalCounts[o.label] = (animalCounts[o.label] || 0) + 1;
        }
      }
    }

    return {
      faces: Object.entries(faceCounts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count),
      animals: Object.entries(animalCounts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count),
    };
  }
}

export const indexer = new FileIndexer();


export interface FileMetadata {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  created: number;
  modified: number;
  accessed: number;
  isHidden: boolean;
  permissions: number;
}

export interface DirectoryNode {
  path: string;
  name: string;
  children: (DirectoryNode | FileMetadata)[];
  size: number;
  fileCount: number;
  folderCount: number;
}

export interface FileIndex {
  fileId: string;
  path: string;
  name: string;
  type: string;
  size: number;
  textContent?: string;
  textEmbedding?: number[];
  objects?: DetectedObject[];
  faces?: DetectedFace[];
  metadata: Record<string, unknown>;
  lastIndexed: number;
}

export interface DetectedObject {
  label: string;
  confidence: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface DetectedFace {
  id: string;
  confidence: number;
  embedding?: number[];
  boundingBox?: { x: number; y: number; width: number; height: number };
  label?: string; 
}

export interface FaceCluster {
  faceId: string;
  label?: string;
  confidence: number;
  fileCount: number;
  files: string[];
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'read' | 'write' | 'delete' | 'execute' | 'index';
  granted: boolean;
}

export interface Permissions {
  readFiles: boolean;
  listDirectories: boolean;
  indexContent: boolean;
  recognizeFaces: boolean;
  analyzeImages: boolean;
  searchText: boolean;
  moveFiles: boolean;
  deleteFiles: boolean;
  renameFiles: boolean;
  createFolders: boolean;
  modifyMetadata: boolean;
}

export interface SearchQuery {
  text: string;
  filters?: {
    fileType?: string[];
    dateRange?: { from: number; to: number };
    sizeRange?: { min: number; max: number };
    faceName?: string;
    objectLabel?: string;
  };
  sortBy?: 'relevance' | 'date' | 'size' | 'modified' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult {
  files: (FileIndex & { relevanceScore: number })[];
  faceClusters?: (FaceCluster & { relevanceScore: number })[];
  totalResults: number;
  executionTime: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  action?: {
    type: 'move' | 'delete' | 'rename' | 'copy' | 'hide';
    files?: string[];
    destination?: string;
  };
}

export interface AppConfig {
  selectedPaths: string[];
  permissions: Permissions;
  faceNaming: Record<string, string>;
  modelSettings: {
    textModel: string;
    visionModel: string;
    embeddingModel: string;
  };
  indexingOptions: {
    indexText: boolean;
    indexImages: boolean;
    indexMetadata: boolean;
    autoUpdate: boolean;
    updateInterval: number; 
  };
  displaySettings: {
    itemsPerPage: number;
    viewMode: 'grid' | 'list';
    showHidden: boolean;
    groupBy?: 'type' | 'date' | 'folder';
  };
}

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  component: string;
}

export interface IndexingProgress {
  currentFile: string;
  processed: number;
  total: number;
  percentage: number;
  status: 'idle' | 'scanning' | 'indexing' | 'analyzing' | 'complete' | 'error';
  error?: string;
}

export interface VirtualFolder {
  id: string;
  name: string;
  description?: string;
  parentId?: string; 
  mediaIds: number[]; 
  createdAt: number;
  updatedAt: number;
  color?: string; 
}

export interface FolderStructure {
  folders: Record<string, VirtualFolder>; 
  rootFolderIds: string[]; 
}
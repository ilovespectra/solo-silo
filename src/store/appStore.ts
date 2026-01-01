import { create } from 'zustand';
import { AppConfig, Permissions, FileIndex, ChatMessage, IndexingProgress, FaceCluster, VirtualFolder } from '@/types';

const DEFAULT_PERMISSIONS: Permissions = {
  readFiles: false,
  listDirectories: false,
  indexContent: false,
  recognizeFaces: false,
  analyzeImages: false,
  searchText: true,  
  moveFiles: false,
  deleteFiles: false,
  renameFiles: false,
  createFolders: false,
  modifyMetadata: false,
};

const DEFAULT_CONFIG: AppConfig = {
  selectedPaths: [],
  permissions: DEFAULT_PERMISSIONS,
  faceNaming: {},
  modelSettings: {
    textModel: 'Xenova/all-MiniLM-L6-v2',
    visionModel: 'Xenova/vit-gpt2-image-captioning',
    embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  },
  indexingOptions: {
    indexText: true,
    indexImages: true,
    indexMetadata: true,
    autoUpdate: false,
    updateInterval: 3600000, 
  },
  displaySettings: {
    itemsPerPage: 24,
    viewMode: 'grid',
    showHidden: false,
    groupBy: 'type',
  },
};

interface SearchPreferences {
  confidenceThreshold: number; 
  displayCount: number; 
}

interface AppStore {
  config: AppConfig;
  setConfig: (config: Partial<AppConfig>) => void;
  updatePermissions: (permissions: Partial<Permissions>) => void;
  addSelectedPath: (path: string) => void;
  removeSelectedPath: (path: string) => void;

  activeSiloName: string | null;
  setActiveSiloName: (siloName: string | null) => void;
  loadSiloConfig: (siloName: string) => void;
  saveSiloConfig: (siloName: string) => void;

  chatHistory: ChatMessage[];
  addChatMessage: (message: ChatMessage) => void;
  clearChatHistory: () => void;
  searchResults: FileIndex[];
  setSearchResults: (results: FileIndex[]) => void;
  searchPreferences: SearchPreferences;
  setSearchPreferences: (prefs: Partial<SearchPreferences>) => void;

  indexingProgress: IndexingProgress;
  setIndexingProgress: (progress: IndexingProgress) => void;
  isIndexing: boolean;
  setIsIndexing: (isIndexing: boolean) => void;

  faceClusters: FaceCluster[];
  setFaceClusters: (clusters: FaceCluster[]) => void;
  renameFace: (faceId: string, name: string) => void;

  showSetupWizard: boolean;
  setShowSetupWizard: (show: boolean) => void;
  showGettingStartedTour: boolean;
  setShowGettingStartedTour: (show: boolean) => void;
  gettingStartedStep: number;
  setGettingStartedStep: (step: number) => void;
  tourAutoOpenDebugLog: boolean;
  setTourAutoOpenDebugLog: (open: boolean) => void;
  currentView: 'browser' | 'search' | 'people' | 'animals' | 'audio' | 'settings' | 'retraining';
  setCurrentView: (view: 'browser' | 'search' | 'people' | 'animals' | 'audio' | 'settings' | 'retraining') => void;
  indexingComplete: boolean;
  setIndexingComplete: (complete: boolean) => void;

  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;

  favorites: Set<number>; 
  addFavorite: (mediaId: number) => void;
  removeFavorite: (mediaId: number) => void;
  loadFavorites: () => void;
  isFavorite: (mediaId: number) => boolean;

  selectedMediaId: number | null;
  setSelectedMediaId: (id: number | null) => void;

  folders: Record<string, VirtualFolder>; 
  rootFolderIds: string[]; 
  isCreatingFolder: boolean;
  setIsCreatingFolder: (isCreating: boolean) => void;
  currentFolderId: string | null; 
  navigationHistory: string[]; 
  navigationIndex: number; 
  navigateToFolder: (folderId: string | null) => Promise<void>;
  navigateBack: () => Promise<void>;
  navigateForward: () => Promise<void>;
  createFolder: (name: string, parentId?: string) => Promise<VirtualFolder>;
  deleteFolder: (folderId: string) => Promise<void>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  addMediaToFolder: (folderId: string, mediaIds: number[]) => Promise<void>;
  removeMediaFromFolder: (folderId: string, mediaIds: number[]) => Promise<void>;
  moveMediaBetweenFolders: (mediaIds: number[], fromFolderId: string, toFolderId: string) => Promise<void>;
  loadFolderContents: (folderId: string | null) => Promise<void>;
  getFolderContents: (folderId: string) => VirtualFolder | null;
  reloadFolders: () => Promise<void>; 
}

export const useAppStore = create<AppStore>((set): AppStore => ({
  config: DEFAULT_CONFIG,
  activeSiloName: null,

  setConfig: (newConfig) =>
    set((state: AppStore) => {
      const updatedConfig = { ...state.config, ...newConfig };
      
      if (typeof window !== 'undefined' && state.activeSiloName) {
        console.log(`[appStore] Saving config for silo: ${state.activeSiloName}`);
        localStorage.setItem(`app-config-${state.activeSiloName}`, JSON.stringify(updatedConfig));
      } else if (typeof window !== 'undefined') {
        console.warn('[appStore] setConfig called but activeSiloName is null - config not saved!');
      }
      return { config: updatedConfig };
    }),

  setActiveSiloName: (siloName) =>
    set((state: AppStore) => {
      console.log(`[appStore] setActiveSiloName: ${siloName}`);

      if (state.activeSiloName && typeof window !== 'undefined') {
        console.log(`[appStore] Saving config for silo: ${state.activeSiloName}`);
        localStorage.setItem(`app-config-${state.activeSiloName}`, JSON.stringify(state.config));
      }

      let newConfig = { ...DEFAULT_CONFIG };
      if (siloName && typeof window !== 'undefined') {
        const saved = localStorage.getItem(`app-config-${siloName}`);
        if (saved) {
          try {
            newConfig = JSON.parse(saved);
            console.log(`[appStore] Loaded existing config for silo: ${siloName}`, newConfig);
          } catch (e) {
            console.error('Failed to parse silo config:', e);
            newConfig = { ...DEFAULT_CONFIG };
            console.log(`[appStore] Using fresh DEFAULT_CONFIG for silo: ${siloName}`);
          }
        } else {
          console.log(`[appStore] No saved config for silo: ${siloName}, using DEFAULT_CONFIG`);
        }
      }

      console.log(`[appStore] Clearing folders for silo switch to: ${siloName}`);
      
      console.log(`[appStore] Active silo now: ${siloName}, selectedPaths: ${newConfig.selectedPaths?.length || 0}`);
      return { 
        activeSiloName: siloName, 
        config: newConfig,
        
        folders: {},
        rootFolderIds: [],
        currentFolderId: null,
        navigationHistory: [],
        navigationIndex: -1,
      };
    }),

  loadSiloConfig: (siloName) =>
    set((state: AppStore) => {
      let config = DEFAULT_CONFIG;
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(`app-config-${siloName}`);
        if (saved) {
          try {
            config = JSON.parse(saved);
          } catch (e) {
            console.error('Failed to parse silo config:', e);
            config = DEFAULT_CONFIG;
          }
        }
      }
      return { config };
    }),

  saveSiloConfig: (siloName) =>
    set((state: AppStore) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem(`app-config-${siloName}`, JSON.stringify(state.config));
        console.log(`[appStore] Saved config for silo: ${siloName}`);
      }
      return state;
    }),

  updatePermissions: (perms) =>
    set((state: AppStore) => {
      const newConfig = {
        ...state.config,
        permissions: { ...state.config.permissions, ...perms },
      };
      
      if (typeof window !== 'undefined' && state.activeSiloName) {
        localStorage.setItem(`app-config-${state.activeSiloName}`, JSON.stringify(newConfig));
      }
      return { config: newConfig };
    }),

  addSelectedPath: (path) =>
    set((state: AppStore) => {
      console.log(`[appStore] addSelectedPath: ${path} to silo: ${state.activeSiloName}`);
      const newPaths = [...new Set([...state.config.selectedPaths, path])];
      const newConfig = {
        ...state.config,
        selectedPaths: newPaths,
      };
      
      if (typeof window !== 'undefined' && state.activeSiloName) {
        localStorage.setItem(`app-config-${state.activeSiloName}`, JSON.stringify(newConfig));
      }
      return { config: newConfig };
    }),

  removeSelectedPath: (path) =>
    set((state: AppStore) => {
      console.log(`[appStore] removeSelectedPath: ${path} from silo: ${state.activeSiloName}`);
      const newConfig = {
        ...state.config,
        selectedPaths: state.config.selectedPaths.filter((p: string) => p !== path),
      };
      
      if (typeof window !== 'undefined' && state.activeSiloName) {
        localStorage.setItem(`app-config-${state.activeSiloName}`, JSON.stringify(newConfig));
      }
      return { config: newConfig };
    }),

  chatHistory: [],

  addChatMessage: (message) =>
    set((state: AppStore) => ({
      chatHistory: [...state.chatHistory, message],
    })),

  clearChatHistory: () =>
    set({
      chatHistory: [],
    }),

  searchResults: [],

  setSearchResults: (results) =>
    set({
      searchResults: results,
    }),

  searchPreferences: {
    confidenceThreshold: 0,
    displayCount: 20,
  },

  setSearchPreferences: (prefs) =>
    set((state: AppStore) => ({
      searchPreferences: { ...state.searchPreferences, ...prefs },
    })),

  indexingProgress: {
    currentFile: '',
    processed: 0,
    total: 0,
    percentage: 0,
    status: 'idle',
  },

  setIndexingProgress: (progress) =>
    set({
      indexingProgress: progress,
    }),

  isIndexing: false,

  setIsIndexing: (isIndexing) =>
    set({
      isIndexing,
    }),

  faceClusters: [],

  setFaceClusters: (clusters) =>
    set({
      faceClusters: clusters,
    }),

  renameFace: (faceId, name) =>
    set((state: AppStore) => ({
      config: {
        ...state.config,
        faceNaming: {
          ...state.config.faceNaming,
          [faceId]: name,
        },
      },
      faceClusters: state.faceClusters.map((cluster: FaceCluster) =>
        cluster.faceId === faceId ? { ...cluster, label: name } : cluster
      ),
    })),

  showSetupWizard: false, 

  setShowSetupWizard: (show) =>
    set({
      showSetupWizard: show,
    }),

  showGettingStartedTour: false,

  setShowGettingStartedTour: (show) =>
    set({
      showGettingStartedTour: show,
    }),

  gettingStartedStep: 0,

  setGettingStartedStep: (step) =>
    set({
      gettingStartedStep: step,
    }),

  tourAutoOpenDebugLog: false,

  setTourAutoOpenDebugLog: (open) =>
    set({
      tourAutoOpenDebugLog: open,
    }),

  currentView: 'browser',

  setCurrentView: (view) =>
    set({
      currentView: view,
    }),

  indexingComplete: false,

  setIndexingComplete: (complete) =>
    set({
      indexingComplete: complete,
    }),

  theme: 'light',

  setTheme: (theme) =>
    set(() => {
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('app-theme', theme);
      }
      return { theme };
    }),

  favorites: new Set(),

  addFavorite: (mediaId) =>
    set((state: AppStore) => {
      const newFavorites = new Set(state.favorites);
      newFavorites.add(mediaId);
      
      import('@/lib/backend').then(mod => {
        mod.toggleFavorite(mediaId).catch(err => {
          console.error('Failed to save favorite to backend:', err);
        });
      });
      return { favorites: newFavorites };
    }),

  removeFavorite: (mediaId) =>
    set((state: AppStore) => {
      const newFavorites = new Set(state.favorites);
      newFavorites.delete(mediaId);
      
      import('@/lib/backend').then(mod => {
        mod.toggleFavorite(mediaId).catch(err => {
          console.error('Failed to remove favorite from backend:', err);
        });
      });
      return { favorites: newFavorites };
    }),

  loadFavorites: async () => {
    try {
      const result = await import('@/lib/backend').then(mod => mod.getAllFavorites());
      set({ favorites: new Set(result.favorites) });
    } catch (e) {
      console.error('Failed to load favorites from backend:', e);
    }
  },

  isFavorite: (mediaId: number): boolean =>
    useAppStore.getState().favorites.has(mediaId),

  selectedMediaId: null,

  setSelectedMediaId: (id) =>
    set({
      selectedMediaId: id,
    }),

  folders: {},
  rootFolderIds: [],
  isCreatingFolder: false,
  currentFolderId: null,
  navigationHistory: [],
  navigationIndex: -1,

  setIsCreatingFolder: (isCreating) =>
    set({
      isCreatingFolder: isCreating,
    }),

  navigateToFolder: async (folderId) => {
    console.log('[NAVIGATE] navigateToFolder called with:', folderId);
    
    set((state: AppStore) => {
      let newHistory = state.navigationHistory;
      let newIndex = state.navigationIndex;

      if (newHistory.length === 0) {
        newHistory = ['root'];
        newIndex = 0;
      }

      newHistory = newHistory.slice(0, newIndex + 1);
      newHistory.push(folderId || 'root');
      
      const newState = {
        currentFolderId: folderId,
        navigationHistory: newHistory,
        navigationIndex: newHistory.length - 1,
      };
      
      console.log('[NAVIGATE] State updated to:', newState);
      return newState;
    });
    
    console.log('[NAVIGATE] After set, currentFolderId is now:', useAppStore.getState().currentFolderId);

    if (folderId) {
      await useAppStore.getState().loadFolderContents(folderId);
    }
  },

  navigateBack: async () => {
    const state = useAppStore.getState();
    if (state.navigationIndex <= 0) return;
    
    const newIndex = state.navigationIndex - 1;
    const folderId = state.navigationHistory[newIndex];
    
    set(() => ({
      currentFolderId: folderId === 'root' ? null : folderId,
      navigationIndex: newIndex,
    }));

    if (folderId !== 'root') {
      await useAppStore.getState().loadFolderContents(folderId);
    }
  },

  navigateForward: async () => {
    const state = useAppStore.getState();
    if (state.navigationIndex >= state.navigationHistory.length - 1) return;
    
    const newIndex = state.navigationIndex + 1;
    const folderId = state.navigationHistory[newIndex];
    
    set(() => ({
      currentFolderId: folderId === 'root' ? null : folderId,
      navigationIndex: newIndex,
    }));

    if (folderId !== 'root') {
      await useAppStore.getState().loadFolderContents(folderId);
    }
  },

  createFolder: async (name, parentId) => {
    try {
      console.log('[FOLDER] Creating folder:', { name, parentId });

      const state = useAppStore.getState();
      const siloParam = state.activeSiloName ? `?silo_name=${encodeURIComponent(state.activeSiloName)}` : '';
      
      const response = await fetch(`/api/folders${siloParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          parentId: parentId ? parseInt(parentId) : null,
          description: '',
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create folder: ${response.statusText}`);
      }
      
      const folder = await response.json();
      console.log('[FOLDER] Backend response:', folder);
      
      const newFolder: VirtualFolder = {
        id: String(folder.id),
        name: folder.name,
        parentId: folder.parentId ? String(folder.parentId) : undefined,
        mediaIds: [],
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      };
      
      console.log('[FOLDER] Created folder object:', newFolder);
      
      set((state: AppStore) => {
        const folderId = String(folder.id);
        const newFolders = { ...state.folders, [folderId]: newFolder };
        
        const newRootIds = !folder.parentId ? [folderId, ...state.rootFolderIds] : state.rootFolderIds;
        
        console.log('[FOLDER] Updated state - rootFolderIds:', newRootIds);
        console.log('[FOLDER] Updated state - folders:', newFolders);
        
        return { folders: newFolders, rootFolderIds: newRootIds, isCreatingFolder: false };
      });
      
      return newFolder;
    } catch (error) {
      console.error('Failed to create folder:', error);
      set({ isCreatingFolder: false });
      throw error;
    }
  },

  deleteFolder: async (folderId) => {
    try {
      const numId = parseInt(folderId);
      
      const state = useAppStore.getState();
      const siloParam = state.activeSiloName ? `&silo_name=${encodeURIComponent(state.activeSiloName)}` : '';
      
      const response = await fetch(`/api/folders/${numId}?recursive=true${siloParam}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete folder: ${response.statusText}`);
      }
      
      set((state: AppStore) => {
        const newFolders = { ...state.folders };
        delete newFolders[folderId];
        const newRootIds = state.rootFolderIds.filter(id => id !== folderId);
        
        return { folders: newFolders, rootFolderIds: newRootIds };
      });
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw error;
    }
  },

  renameFolder: async (folderId, name) => {
    try {
      const numId = parseInt(folderId);
      
      const state = useAppStore.getState();
      const siloParam = state.activeSiloName ? `?silo_name=${encodeURIComponent(state.activeSiloName)}` : '';
      
      const response = await fetch(`/api/folders/${numId}${siloParam}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to rename folder: ${response.statusText}`);
      }
      
      const updated = await response.json();
      
      set((state: AppStore) => {
        const folder = state.folders[folderId];
        if (!folder) return state;
        
        const newFolders = {
          ...state.folders,
          [folderId]: { ...folder, name: updated.name, updatedAt: updated.updatedAt }
        };
        
        return { folders: newFolders };
      });
    } catch (error) {
      console.error('Failed to rename folder:', error);
      throw error;
    }
  },

  addMediaToFolder: async (folderId, mediaIds) => {
    try {
      const numId = parseInt(folderId);
      
      const state = useAppStore.getState();
      const siloParam = state.activeSiloName ? `?silo_name=${encodeURIComponent(state.activeSiloName)}` : '';
      
      const response = await fetch(`/api/folders/${numId}/add-media${siloParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaIds }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to add media to folder: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      set((state: AppStore) => {
        const folder = state.folders[folderId];
        if (!folder) return state;
        
        const newMediaIds = [...new Set([...folder.mediaIds, ...result.addedMediaIds])];
        const newFolders = {
          ...state.folders,
          [folderId]: { ...folder, mediaIds: newMediaIds, updatedAt: Date.now() }
        };
        
        return { folders: newFolders };
      });
    } catch (error) {
      console.error('Failed to add media to folder:', error);
      throw error;
    }
  },

  removeMediaFromFolder: async (folderId, mediaIds) => {
    try {
      const numId = parseInt(folderId);
      
      const state = useAppStore.getState();
      const siloParam = state.activeSiloName ? `?silo_name=${encodeURIComponent(state.activeSiloName)}` : '';
      
      const response = await fetch(`/api/folders/${numId}/remove-media${siloParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaIds }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to remove media from folder: ${response.statusText}`);
      }
      
      set((state: AppStore) => {
        const folder = state.folders[folderId];
        if (!folder) return state;
        
        const mediaIdSet = new Set(mediaIds);
        const newMediaIds = folder.mediaIds.filter(id => !mediaIdSet.has(id));
        const newFolders = {
          ...state.folders,
          [folderId]: { ...folder, mediaIds: newMediaIds, updatedAt: Date.now() }
        };
        
        return { folders: newFolders };
      });
    } catch (error) {
      console.error('Failed to remove media from folder:', error);
      throw error;
    }
  },

  moveMediaBetweenFolders: async (mediaIds, fromFolderId, toFolderId) => {
    try {
      
      await useAppStore.getState().removeMediaFromFolder(fromFolderId, mediaIds);
      await useAppStore.getState().addMediaToFolder(toFolderId, mediaIds);
    } catch (error) {
      console.error('Failed to move media between folders:', error);
      throw error;
    }
  },

  getFolderContents: (folderId) =>
    useAppStore.getState().folders[folderId] || null,

  loadFolderContents: async (folderId: string | null) => {
    if (!folderId) return;
    
    try {
      const numId = parseInt(folderId);
      
      const state = useAppStore.getState();
      const siloParam = state.activeSiloName ? `?silo_name=${encodeURIComponent(state.activeSiloName)}` : '';
      
      const response = await fetch(`/api/folders/${numId}/contents${siloParam}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load folder contents: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      set((state: AppStore) => {
        const folder = state.folders[folderId];
        if (!folder) return state;

        const mediaIds = (data.media as Array<{ id: number }>).map((m) => m.id);
        
        const newFolders = {
          ...state.folders,
          [folderId]: { ...folder, mediaIds }
        };
        
        return { folders: newFolders };
      });
    } catch (error) {
      console.error('Failed to load folder contents:', error);
      throw error;
    }
  },

  reloadFolders: async () => {
    try {
      console.log('[FOLDERS] Reloading folders from backend...');
      const state = useAppStore.getState();

      const siloParam = state.activeSiloName ? `?silo_name=${encodeURIComponent(state.activeSiloName)}` : '';
      
      const allFolders: Record<string, VirtualFolder> = {};
      const rootFolderIds: string[] = [];

      const rootResponse = await fetch(`/api/folders${siloParam}`);
      if (!rootResponse.ok) {
        throw new Error(`Failed to load root folders: ${rootResponse.statusText}`);
      }
      
      const rootFoldersData = await rootResponse.json();

      const folderQueue: Array<{ id: string; parentId?: string }> = [];
      
      for (const folder of rootFoldersData) {
        const folderId = String(folder.id);
        allFolders[folderId] = {
          id: folderId,
          name: folder.name,
          parentId: folder.parentId ? String(folder.parentId) : undefined,
          mediaIds: folder.mediaIds || [],
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        };
        
        rootFolderIds.push(folderId);
        folderQueue.push({ id: folderId, parentId: undefined });
      }

      while (folderQueue.length > 0) {
        const { id: parentId } = folderQueue.shift()!;
        
        try {
          const siloParamForSubfolders = state.activeSiloName ? `&silo_name=${encodeURIComponent(state.activeSiloName)}` : '';
          const subfoldersResponse = await fetch(`/api/folders?parent_id=${parentId}${siloParamForSubfolders}`);
          if (subfoldersResponse.ok) {
            const subfolders = await subfoldersResponse.json();
            
            for (const folder of subfolders) {
              const folderId = String(folder.id);
              allFolders[folderId] = {
                id: folderId,
                name: folder.name,
                parentId: String(parentId),
                mediaIds: folder.mediaIds || [],
                createdAt: folder.createdAt,
                updatedAt: folder.updatedAt,
              };

              folderQueue.push({ id: folderId, parentId });
            }
          }
        } catch (err) {
          console.error(`Failed to load subfolders for parent ${parentId}:`, err);
          
        }
      }

      set({
        folders: allFolders,
        rootFolderIds,
      });
      
      console.log('[FOLDERS] ✓ Folders reloaded successfully');
    } catch (error) {
      console.error('[FOLDERS] Failed to reload folders:', error);
      throw error;
    }
  },
}));

export async function initializeAppState() {
  if (typeof window === 'undefined') return;

  const savedTheme = localStorage.getItem('app-theme');
  if (savedTheme === 'dark' || savedTheme === 'light') {
    useAppStore.setState({ theme: savedTheme });
  }

  const state = useAppStore.getState();
  if (state.activeSiloName) {
    const savedConfig = localStorage.getItem(`app-config-${state.activeSiloName}`);
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        useAppStore.setState({ config });
      } catch (e) {
        console.error('Failed to parse saved config:', e);
      }
    }
  }

  try {

    const allFolders: Record<string, VirtualFolder> = {};
    const rootFolderIds: string[] = [];

    const siloParam = state.activeSiloName ? `?silo_name=${encodeURIComponent(state.activeSiloName)}` : '';

    const rootResponse = await fetch(`/api/folders${siloParam}`);
    if (rootResponse.ok) {
      const rootFoldersData = await rootResponse.json();

      const folderQueue: Array<{ id: string; parentId?: string }> = [];
      
      for (const folder of rootFoldersData) {
        const folderId = String(folder.id);
        allFolders[folderId] = {
          id: folderId,
          name: folder.name,
          parentId: folder.parentId ? String(folder.parentId) : undefined,
          mediaIds: folder.mediaIds || [],
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        };
        
        rootFolderIds.push(folderId);
        folderQueue.push({ id: folderId, parentId: undefined });
      }

      while (folderQueue.length > 0) {
        const { id: parentId } = folderQueue.shift()!;
        
        try {
          const siloParamForSubfolders = state.activeSiloName ? `&silo_name=${encodeURIComponent(state.activeSiloName)}` : '';
          const subfoldersResponse = await fetch(`/api/folders?parent_id=${parentId}${siloParamForSubfolders}`);
          if (subfoldersResponse.ok) {
            const subfolders = await subfoldersResponse.json();
            
            for (const folder of subfolders) {
              const folderId = String(folder.id);
              allFolders[folderId] = {
                id: folderId,
                name: folder.name,
                parentId: String(parentId),
                mediaIds: folder.mediaIds || [],
                createdAt: folder.createdAt,
                updatedAt: folder.updatedAt,
              };

              folderQueue.push({ id: folderId, parentId });
            }
          }
        } catch (err) {
          console.error(`Failed to load subfolders for parent ${parentId}:`, err);
          
        }
      }
      
      useAppStore.setState({ folders: allFolders, rootFolderIds });
    }
  } catch (error) {
    console.error('Failed to load folders from backend:', error);
    
  }
}

export function setupConfigPersistence() {
  if (typeof window === 'undefined') return;

  initializeAppState();
  
  useAppStore.subscribe(
    (state) => {
      
      if (state.activeSiloName) {
        console.log(`[appStore] Persisting config for silo: ${state.activeSiloName}`);
        localStorage.setItem(`app-config-${state.activeSiloName}`, JSON.stringify(state.config));
      }
    }
  );
  
}

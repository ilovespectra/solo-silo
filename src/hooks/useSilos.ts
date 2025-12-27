import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';

interface Silo {
  name: string;
  created_at: string;
  has_password: boolean;
  password_mode?: string;
  is_active: boolean;
}

interface UseSilosReturn {
  silos: Silo[];
  activeSilo: Silo | null;
  loading: boolean;
  error: string | null;
  createSilo: (name: string, password?: string, passwordMode?: string) => Promise<void>;
  switchSilo: (name: string, password?: string) => Promise<void>;
  saveSilo: (name: string, password?: string, passwordMode?: string) => Promise<void>;
  deleteSilo: (name: string) => Promise<void>;
  renameSilo: (oldName: string, newName: string, password?: string) => Promise<void>;
  updatePassword: (siloName: string, currentPassword?: string, newPassword?: string, passwordMode?: string) => Promise<void>;
  downloadDatabase: (siloName?: string) => Promise<void>;
  uploadDatabase: (file: File, siloName?: string) => Promise<void>;
  nukeDatabase: (siloName?: string) => Promise<void>;
  refreshSilos: () => Promise<void>;
}

export function useSilos(): UseSilosReturn {
  const [silos, setSilos] = useState<Silo[]>([]);
  const [activeSilo, setActiveSilo] = useState<Silo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSilos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/silos/list');
      if (!response.ok) throw new Error('Failed to load silos');

      const siloList: Silo[] = await response.json();
      setSilos(siloList);

      const active = siloList.find(s => s.is_active);
      if (active) setActiveSilo(active);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[useSilos] Error:', message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createSilo = useCallback(async (name: string, password?: string, passwordMode?: string) => {
    try {
      setError(null);
      const response = await fetch('/api/silos/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          password: password || null,
          password_mode: passwordMode || 'first_access'
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to create silo');
      }

      const appStore = useAppStore.getState();
      appStore.setActiveSiloName(name);
      console.log(`[useSilos] Created new silo: ${name}, initialized with fresh config`);

      await refreshSilos();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, [refreshSilos]);

  const switchSilo = useCallback(async (name: string, password?: string) => {
    try {
      setError(null);
      const response = await fetch('/api/silos/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          password: password || null
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to switch silo');
      }

      const appStore = useAppStore.getState();
      appStore.setActiveSiloName(name);
      console.log(`[useSilos] Switched to silo: ${name}, loaded silo-specific config`);

      await refreshSilos();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, [refreshSilos]);

  const saveSilo = useCallback(async (name: string, password?: string, passwordMode?: string) => {
    try {
      setError(null);
      const response = await fetch('/api/silos/save-current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          password: password || null,
          password_mode: passwordMode || 'first_access'
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to save silo');
      }

      await refreshSilos();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, [refreshSilos]);

  const deleteSilo = useCallback(async (name: string) => {
    try {
      setError(null);
      const response = await fetch(`/api/silos/${name}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to delete silo');
      }

      await refreshSilos();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, [refreshSilos]);

  const downloadDatabase = useCallback(async (siloName?: string) => {
    try {
      setError(null);
      const params = siloName ? `?silo_name=${siloName}` : '';
      const response = await fetch(`/api/silos/download${params}`);

      if (!response.ok) {
        throw new Error('Failed to download database');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `silo_${siloName || 'backup'}_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, []);

  const uploadDatabase = useCallback(async (file: File, siloName?: string) => {
    try {
      setError(null);
      const formData = new FormData();
      formData.append('file', file);
      if (siloName) formData.append('silo_name', siloName);

      const response = await fetch('/api/silos/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to upload database');
      }

      await refreshSilos();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, [refreshSilos]);

  const nukeDatabase = useCallback(async (siloName?: string) => {
    try {
      setError(null);
      const params = siloName ? `?silo_name=${siloName}` : '';
      const response = await fetch(`/api/silos/nuke${params}`, {
        method: 'POST'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to nuke database');
      }

      await refreshSilos();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, [refreshSilos]);

  const renameSilo = useCallback(async (oldName: string, newName: string, password?: string) => {
    try {
      setError(null);
      const response = await fetch('/api/silos/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          old_name: oldName, 
          new_name: newName, 
          password: password || null 
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.detail || 'Failed to rename silo');
      }
      
      await refreshSilos();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, [refreshSilos]);

  const updatePassword = useCallback(async (siloName: string, currentPassword?: string, newPassword?: string, passwordMode?: string) => {
    try {
      setError(null);
      const response = await fetch('/api/silos/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          silo_name: siloName,
          current_password: currentPassword || null,
          new_password: newPassword || null,
          password_mode: passwordMode || null
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.detail || 'Failed to update password');
      }
      
      await refreshSilos();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, [refreshSilos]);

  useEffect(() => {
    refreshSilos();
  }, [refreshSilos]);

  return {
    silos,
    activeSilo,
    loading,
    error,
    createSilo,
    switchSilo,
    saveSilo,
    deleteSilo,
    renameSilo,
    updatePassword,
    downloadDatabase,
    uploadDatabase,
    nukeDatabase,
    refreshSilos
  };
}

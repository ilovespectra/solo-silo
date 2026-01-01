import { apiUrl } from '@/lib/api';
import { useState, useEffect } from 'react';

interface DemoModeStatus {
  demo_mode: boolean;
  read_only: boolean;
  message: string;
}

export function useDemoMode() {
  const [demoMode, setDemoMode] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkDemoMode() {
      try {
        const response = await fetch(apiUrl('/api/system/mode'));
        if (!response.ok) {
          throw new Error('Failed to check demo mode');
        }
        const data: DemoModeStatus = await response.json();
        console.log('[useDemoMode] api response:', data);
        console.log('[useDemoMode] setting demoMode to:', data.demo_mode);
        setDemoMode(data.demo_mode);
        setError(null);
      } catch (err) {
        console.error('failed to detect demo mode:', err);
        setError(err instanceof Error ? err.message : 'unknown error');
        setDemoMode(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkDemoMode();
  }, []);

  return { demoMode, isLoading, error };
}

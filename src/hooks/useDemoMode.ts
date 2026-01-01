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
        const response = await fetch('/api/system/mode');
        if (!response.ok) {
          throw new Error('Failed to check demo mode');
        }
        const data: DemoModeStatus = await response.json();
        setDemoMode(data.demo_mode);
        setError(null);
      } catch (err) {
        console.error('Failed to detect demo mode:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        // Default to non-demo mode on error
        setDemoMode(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkDemoMode();
  }, []);

  return { demoMode, isLoading, error };
}

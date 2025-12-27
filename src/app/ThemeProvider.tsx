'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useAppStore();

  useEffect(() => {
    const html = document.documentElement;
    
    html.classList.remove('dark', 'light');
    
    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.add('light');
    }
  }, [theme]);

  return <>{children}</>;
}

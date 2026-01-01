'use client';

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  
  return window.location.hostname.includes('vercel.app') || 
         process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

export async function handleDemoRequest(path: string, options?: RequestInit): Promise<Response> {
  return fetch(path, options);
}

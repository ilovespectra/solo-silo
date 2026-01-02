'use client';

export function isDemoMode(): boolean {
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return true;
  }
  
  if (typeof window !== 'undefined') {
    return window.location.hostname.includes('vercel.app') || 
           process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  }
  
  return false;
}

export async function handleDemoRequest(path: string, options?: RequestInit): Promise<Response> {
  return fetch(path, options);
}

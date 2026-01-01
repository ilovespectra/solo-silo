'use client';

// Demo mode detection
export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check if deployed on Vercel or if explicitly set
  return window.location.hostname.includes('vercel.app') || 
         process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

// In demo mode, we use Next.js API routes that serve static data
export async function handleDemoRequest(path: string, options?: RequestInit): Promise<Response> {
  // The API routes in src/app/api/ will handle demo data
  return fetch(path, options);
}

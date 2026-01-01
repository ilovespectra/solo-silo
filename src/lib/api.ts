export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

export function apiUrl(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

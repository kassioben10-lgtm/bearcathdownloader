/**
 * API configuration helper.
 * When hosted on GitHub Pages or Vercel with a remote backend,
 * set VITE_API_URL in .env (e.g. VITE_API_URL=https://my-backend.onrender.com).
 * When running all-in-one locally or on Render, it defaults to same-origin ("").
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE_URL) return cleanPath;
  return `${API_BASE_URL.replace(/\/+$/, "")}${cleanPath}`;
}

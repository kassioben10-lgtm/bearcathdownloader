/**
 * API configuration helper.
 * When hosted on GitHub Pages with a remote backend (e.g. Render),
 * it uses VITE_API_URL or the custom URL stored in localStorage.
 * When running all-in-one locally or on Render, it defaults to same-origin ("").
 */
export const ENV_API_URL = import.meta.env.VITE_API_URL || "";

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("bearcatch_api_url");
    if (saved && saved.trim()) return saved.trim();
  }
  return ENV_API_URL;
}

export function setCustomApiUrl(url: string) {
  if (typeof window !== "undefined") {
    if (!url || !url.trim()) {
      localStorage.removeItem("bearcatch_api_url");
    } else {
      localStorage.setItem("bearcatch_api_url", url.trim().replace(/\/+$/, ""));
    }
  }
}

export function isStaticGitHubPages(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.includes("github.io") && !getApiBaseUrl();
}

export function getApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (!baseUrl) return cleanPath;
  return `${baseUrl.replace(/\/+$/, "")}${cleanPath}`;
}

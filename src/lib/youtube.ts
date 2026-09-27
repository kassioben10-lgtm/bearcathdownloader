export function extractVideoId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // Match youtu.be/<id> or /shorts/<id> or /live/<id> or /embed/<id>
  const shortMatch = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed|v|shorts|live)\/)([a-zA-Z0-9_-]{11})/
  );
  if (shortMatch) return shortMatch[1];

  // Match ?v=<id> or &v=<id>
  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // Match raw 11 characters
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function isValidYouTubeUrl(url: string): boolean {
  return extractVideoId(url) !== null;
}

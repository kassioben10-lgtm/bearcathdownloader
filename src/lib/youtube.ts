export interface YouTubeUrlAnalysis {
  videoId: string | null;
  playlistId: string | null;
  isPlaylistOnly: boolean;
  isVideoWithPlaylist: boolean;
  isVideoOnly: boolean;
  cleanVideoUrl: string | null;
  cleanPlaylistUrl: string | null;
}

export interface PlaylistEntry {
  id: string;
  title: string;
  rawTitle?: string;
  artist?: string;
  album?: string;
  year?: string;
  channel?: string;
  duration?: string;
  thumbnail: string;
  url: string;
  index: number;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  uploader: string;
  description?: string;
  thumbnail: string;
  url: string;
  itemCount: number;
  entries: PlaylistEntry[];
}

export function extractPlaylistId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // Match list= parameter (e.g. ?list=PL... or &list=PL...)
  const listMatch = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
  if (listMatch) return listMatch[1];

  // Match pure playlist ID like PL..., UU..., etc.
  if (/^(?:PL|UU|LL|FL|RD|OLAK)[a-zA-Z0-9_-]{10,}$/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

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

  // Match raw 11 characters if it doesn't look like a playlist ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed) && !trimmed.startsWith("PL")) {
    return trimmed;
  }

  return null;
}

export function parseYouTubeUrl(url: string): YouTubeUrlAnalysis {
  const videoId = extractVideoId(url);
  const playlistId = extractPlaylistId(url);

  return {
    videoId,
    playlistId,
    isPlaylistOnly: !videoId && !!playlistId,
    isVideoWithPlaylist: !!videoId && !!playlistId,
    isVideoOnly: !!videoId && !playlistId,
    cleanVideoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
    cleanPlaylistUrl: playlistId ? `https://www.youtube.com/playlist?list=${playlistId}` : null,
  };
}

export function isValidYouTubeUrl(url: string): boolean {
  const { videoId, playlistId } = parseYouTubeUrl(url);
  return videoId !== null || playlistId !== null;
}


import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]+)/);
  return match ? match[1] : null;
}

function makeStreamResponse(fileRes: Response, filename: string): Response {
  return new Response(fileRes.body, {
    headers: {
      ...corsHeaders,
      'Content-Type': fileRes.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': fileRes.headers.get('content-length') || '',
    },
  });
}

function makeJsonResponse(downloadUrl: string, filename: string, quality: string, audioUrl?: string): Response {
  return new Response(
    JSON.stringify({ status: 'success', downloadUrl, filename, quality, ...(audioUrl ? { audioUrl } : {}) }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function fetchWithUA(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com',
    },
  });
}

// Strategy 1: Cobalt proxy
async function tryCobalt(fullYtUrl: string, isAudio: boolean, cobaltQuality: string, mode: string, videoId: string): Promise<Response | null> {
  const cobaltProxyUrl = Deno.env.get('COBALT_PROXY_URL');
  if (!cobaltProxyUrl) return null;

  try {
    console.log(`Trying Cobalt proxy: ${cobaltProxyUrl}`);
    const cobaltRes = await fetch(cobaltProxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        url: fullYtUrl,
        downloadMode: isAudio ? 'audio' : 'auto',
        videoQuality: cobaltQuality,
        audioFormat: 'mp3',
      }),
    });

    if (!cobaltRes.ok) {
      console.error(`Cobalt error ${cobaltRes.status}`);
      return null;
    }

    const data = await cobaltRes.json();
    let downloadUrl: string | null = null;

    if (data.status === 'tunnel' || data.status === 'redirect') downloadUrl = data.url;
    else if (data.status === 'picker' && data.picker?.length > 0) downloadUrl = data.picker[0].url;
    else if (data.url) downloadUrl = data.url;

    if (!downloadUrl) return null;

    const filename = `download_${videoId}.${isAudio ? 'mp3' : 'mp4'}`;

    if (mode === 'stream') {
      const fileRes = await fetchWithUA(downloadUrl);
      if (fileRes.ok) return makeStreamResponse(fileRes, filename);
    }

    return makeJsonResponse(downloadUrl, filename, cobaltQuality + 'p');
  } catch (e) {
    console.error(`Cobalt error: ${e}`);
    return null;
  }
}

// Strategy 2: youtube-search-download3 (returns merged high-quality)
async function trySearchDownload3(videoId: string, isAudio: boolean, mode: string, rapidApiKey: string): Promise<Response | null> {
  try {
    console.log('Trying youtube-search-download3...');
    const res = await fetch(
      `https://youtube-search-download3.p.rapidapi.com/download?video=${videoId}`,
      {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'youtube-search-download3.p.rapidapi.com',
        },
      }
    );

    if (!res.ok) {
      console.error(`search-download3 HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    console.log(`search-download3 response keys: ${JSON.stringify(data).substring(0, 500)}`);

    let downloadUrl: string | null = null;
    let filename = `download_${videoId}.${isAudio ? 'mp3' : 'mp4'}`;
    let qualityLabel = 'auto';

    if (data.title) {
      filename = `${data.title.replace(/[^\w.\-()（）\s]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;
    }

    if (isAudio) {
      // Look for audio links
      const audioLinks = (data.links || data.audio || []);
      if (Array.isArray(audioLinks) && audioLinks.length > 0) {
        const best = audioLinks.sort((a: any, b: any) => (b.size || b.bitrate || 0) - (a.size || a.bitrate || 0))[0];
        downloadUrl = best.url || best.link;
        qualityLabel = best.quality || best.label || 'audio';
      } else if (data.mp3 || data.audio_url) {
        downloadUrl = data.mp3 || data.audio_url;
      }
    } else {
      // Look for video links - prefer highest quality
      const videoLinks = (data.links || data.video || data.formats || []);
      if (Array.isArray(videoLinks) && videoLinks.length > 0) {
        // Sort by quality/size descending
        const sorted = videoLinks
          .filter((l: any) => l.url || l.link)
          .sort((a: any, b: any) => {
            const aQ = parseInt(a.quality || a.label || '0');
            const bQ = parseInt(b.quality || b.label || '0');
            return bQ - aQ;
          });
        if (sorted.length > 0) {
          downloadUrl = sorted[0].url || sorted[0].link;
          qualityLabel = sorted[0].quality || sorted[0].label || 'auto';
        }
      } else if (data.mp4 || data.video_url || data.url) {
        downloadUrl = data.mp4 || data.video_url || data.url;
      }
    }

    if (!downloadUrl) return null;

    if (mode === 'stream') {
      const fileRes = await fetchWithUA(downloadUrl);
      if (fileRes.ok) return makeStreamResponse(fileRes, filename);
    }

    return makeJsonResponse(downloadUrl, filename, qualityLabel);
  } catch (e) {
    console.error(`search-download3 error: ${e}`);
    return null;
  }
}

// Strategy 3: youtube86 
async function tryYoutube86(videoId: string, isAudio: boolean, quality: string, mode: string, rapidApiKey: string): Promise<Response | null> {
  try {
    console.log('Trying youtube86 API...');
    const res = await fetch(
      `https://youtube86.p.rapidapi.com/api/youtube/links/${videoId}`,
      {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'youtube86.p.rapidapi.com',
        },
      }
    );

    if (!res.ok) {
      console.error(`youtube86 HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    let best: any = null;
    let filename = `download_${videoId}.${isAudio ? 'mp3' : 'mp4'}`;
    if (data.title) filename = `${data.title.replace(/[^\w.\-()（）\s]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;

    const qualityNum = parseInt(quality) || 1080;
    const allFormats = data.urls || [];

    if (isAudio) {
      const audioFormats = allFormats.filter((f: any) => f.url && (f.isAudioOnly || f.mimeType?.includes('audio')));
      audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      best = audioFormats[0];
    } else {
      const muxed = allFormats.filter((f: any) => f.url && f.mimeType?.includes('video') && f.hasAudio !== false);
      const target = muxed.length > 0 ? muxed : allFormats.filter((f: any) => f.url && f.mimeType?.includes('video'));
      target.sort((a: any, b: any) => Math.abs((a.height || 0) - qualityNum) - Math.abs((b.height || 0) - qualityNum));
      best = target[0];
    }

    if (!best?.url) return null;

    if (mode === 'stream') {
      const fileRes = await fetchWithUA(best.url);
      if (fileRes.ok || fileRes.status === 206) return makeStreamResponse(fileRes, filename);
    }

    return makeJsonResponse(best.url, filename, best.qualityLabel || best.label || 'auto');
  } catch (e) {
    console.error(`youtube86 error: ${e}`);
    return null;
  }
}

// Strategy 4: ytstream with adaptive formats (returns video+audio URLs separately for client-side merge)
async function tryYtstream(videoId: string, isAudio: boolean, quality: string, mode: string, rapidApiKey: string): Promise<Response | null> {
  try {
    console.log('Trying ytstream...');
    const res = await fetch(
      `https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`,
      {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'ytstream-download-youtube-videos.p.rapidapi.com',
        },
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const filename = `${(data.title || 'download').replace(/[^\w.\-()（）\s]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;
    const qualityNum = parseInt(quality) || 1080;

    if (isAudio) {
      // Get best audio from adaptive formats
      const audioFormats = [
        ...(data.adaptiveFormats || []),
        ...(data.formats || []),
      ].filter((f: any) => f.url && f.mimeType?.includes('audio'));
      audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = audioFormats[0];
      if (!best?.url) return null;

      if (mode === 'stream') {
        const fileRes = await fetchWithUA(best.url);
        if (fileRes.ok || fileRes.status === 206) return makeStreamResponse(fileRes, filename);
      }
      return makeJsonResponse(best.url, filename, 'audio');
    }

    // For video: try to get high-quality adaptive video + best audio
    const adaptiveVideos = (data.adaptiveFormats || [])
      .filter((f: any) => f.url && f.mimeType?.includes('video'))
      .sort((a: any, b: any) => Math.abs((a.height || 0) - qualityNum) - Math.abs((b.height || 0) - qualityNum));

    const adaptiveAudios = (data.adaptiveFormats || [])
      .filter((f: any) => f.url && f.mimeType?.includes('audio'))
      .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

    const bestVideo = adaptiveVideos[0];
    const bestAudio = adaptiveAudios[0];

    // Also check muxed formats as fallback
    const muxed = (data.formats || [])
      .filter((f: any) => f.url && f.mimeType?.includes('video'))
      .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
    const bestMuxed = muxed[0];

    // If we have adaptive video that's significantly better than muxed, return both URLs
    if (bestVideo?.url && bestAudio?.url) {
      const adaptiveHeight = bestVideo.height || 0;
      const muxedHeight = bestMuxed?.height || 0;

      if (adaptiveHeight > muxedHeight) {
        console.log(`Returning adaptive: ${adaptiveHeight}p video + audio (muxed was ${muxedHeight}p)`);
        // Return both URLs - client will handle
        return new Response(
          JSON.stringify({
            status: 'success',
            downloadUrl: bestVideo.url,
            audioUrl: bestAudio.url,
            filename,
            quality: `${adaptiveHeight}p`,
            needsMerge: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fallback to muxed (lower quality but has audio)
    if (bestMuxed?.url) {
      if (mode === 'stream') {
        const fileRes = await fetchWithUA(bestMuxed.url);
        if (fileRes.ok || fileRes.status === 206) return makeStreamResponse(fileRes, filename);
      }
      return makeJsonResponse(bestMuxed.url, filename, bestMuxed.qualityLabel || 'auto');
    }

    return null;
  } catch (e) {
    console.error(`ytstream error: ${e}`);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, format, quality, mode } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return new Response(
        JSON.stringify({ error: 'URL do YouTube inválida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fullYtUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const isAudio = format === 'audio';
    const qualityMap: Record<string, string> = {
      '2160p (4K)': '2160', '1080p (Full HD)': '1080',
      '720p (HD)': '720', '480p': '480', '360p': '360',
    };
    const cobaltQuality = qualityMap[quality] || '1080';
    const errors: string[] = [];

    // 1. Cobalt
    const r1 = await tryCobalt(fullYtUrl, isAudio, cobaltQuality, mode, videoId);
    if (r1) return r1;
    errors.push('Cobalt failed');

    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (rapidApiKey) {
      // 2. youtube-search-download3
      const r2 = await trySearchDownload3(videoId, isAudio, mode, rapidApiKey);
      if (r2) return r2;
      errors.push('search-download3 failed');

      // 3. youtube86
      const r3 = await tryYoutube86(videoId, isAudio, cobaltQuality, mode, rapidApiKey);
      if (r3) return r3;
      errors.push('youtube86 failed');

      // 4. ytstream (adaptive + muxed fallback)
      const r4 = await tryYtstream(videoId, isAudio, cobaltQuality, mode, rapidApiKey);
      if (r4) return r4;
      errors.push('ytstream failed');
    } else {
      errors.push('RAPIDAPI_KEY not configured');
    }

    return new Response(
      JSON.stringify({ status: 'error', error: `Nenhuma API disponível. ${errors.join('; ')}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ status: 'error', error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

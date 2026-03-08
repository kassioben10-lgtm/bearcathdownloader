import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]+)/);
  return match ? match[1] : null;
}

async function tryCobaltProxy(fullYtUrl: string, isAudio: boolean, cobaltQuality: string, mode: string, videoId: string): Promise<Response | null> {
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
      const text = await cobaltRes.text();
      console.error(`Cobalt proxy error ${cobaltRes.status}: ${text.substring(0, 300)}`);
      return null;
    }

    const data = await cobaltRes.json();
    console.log(`Cobalt response: ${JSON.stringify(data).substring(0, 500)}`);

    let downloadUrl: string | null = null;
    if (data.status === 'tunnel' || data.status === 'redirect') {
      downloadUrl = data.url;
    } else if (data.status === 'picker' && data.picker?.length > 0) {
      downloadUrl = data.picker[0].url;
    } else if (data.url) {
      downloadUrl = data.url;
    }

    if (!downloadUrl) return null;

    const filename = `download_${videoId}.${isAudio ? 'mp3' : 'mp4'}`;

    if (mode === 'stream') {
      const fileRes = await fetch(downloadUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (fileRes.ok) {
        return new Response(fileRes.body, {
          headers: {
            ...corsHeaders,
            'Content-Type': fileRes.headers.get('content-type') || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': fileRes.headers.get('content-length') || '',
          },
        });
      }
    }

    return new Response(
      JSON.stringify({ status: 'success', downloadUrl, filename, quality: cobaltQuality + 'p' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error(`Cobalt error: ${e}`);
    return null;
  }
}

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
    console.log(`youtube86 response keys: ${Object.keys(data).join(', ')}`);

    let best: any = null;
    let filename = `download_${videoId}.${isAudio ? 'mp3' : 'mp4'}`;

    // Try to get title for filename
    if (data.title) {
      filename = `${data.title.replace(/[^\w.\-()（）\s]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;
    }

    if (isAudio) {
      // Look for audio formats
      const audioFormats = (data.urls || []).filter((f: any) =>
        f.url && (f.isAudioOnly || f.mimeType?.includes('audio') || f.label?.toLowerCase().includes('audio'))
      );
      audioFormats.sort((a: any, b: any) => (b.bitrate || b.contentLength || 0) - (a.bitrate || a.contentLength || 0));
      best = audioFormats[0];
    } else {
      // Look for video formats with audio (muxed) first, then highest quality
      const qualityNum = parseInt(quality) || 1080;
      const allVideos = (data.urls || []).filter((f: any) =>
        f.url && (f.mimeType?.includes('video') || f.label?.toLowerCase().includes('p'))
      );

      // Prefer muxed formats (video+audio combined)
      const muxed = allVideos.filter((f: any) => !f.isAudioOnly && f.hasAudio !== false);
      const targetList = muxed.length > 0 ? muxed : allVideos;

      // Sort by quality, preferring closest to requested
      targetList.sort((a: any, b: any) => {
        const aH = a.height || parseInt(a.qualityLabel || a.label || '0');
        const bH = b.height || parseInt(b.qualityLabel || b.label || '0');
        return Math.abs(aH - qualityNum) - Math.abs(bH - qualityNum);
      });
      best = targetList[0];
    }

    if (!best?.url) {
      console.log('youtube86: no suitable format found');
      return null;
    }

    const qualityLabel = best.qualityLabel || best.label || 'auto';

    if (mode === 'stream') {
      const fileRes = await fetch(best.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com',
        },
      });
      if (fileRes.ok || fileRes.status === 206) {
        return new Response(fileRes.body, {
          headers: {
            ...corsHeaders,
            'Content-Type': fileRes.headers.get('content-type') || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': fileRes.headers.get('content-length') || '',
          },
        });
      }
    }

    return new Response(
      JSON.stringify({ status: 'success', downloadUrl: best.url, filename, quality: qualityLabel }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error(`youtube86 error: ${e}`);
    return null;
  }
}

async function tryBestResolution(videoId: string, isAudio: boolean, mode: string, rapidApiKey: string): Promise<Response | null> {
  try {
    console.log('Trying youtube-downloader-api-best-resolution...');
    const ytUrl = `www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(
      `https://youtube-downloader-api-best-resolution.p.rapidapi.com/convert?url=${encodeURIComponent(ytUrl)}`,
      {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'youtube-downloader-api-best-resolution.p.rapidapi.com',
        },
      }
    );

    if (!res.ok) {
      console.error(`best-resolution HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    console.log(`best-resolution response: ${JSON.stringify(data).substring(0, 500)}`);

    let downloadUrl: string | null = null;
    let filename = `download_${videoId}.${isAudio ? 'mp3' : 'mp4'}`;
    let qualityLabel = 'auto';

    if (data.title) {
      filename = `${data.title.replace(/[^\w.\-()（）\s]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;
    }

    if (isAudio) {
      downloadUrl = data.audio || data.mp3 || data.url;
    } else {
      // Try to get highest quality video link
      downloadUrl = data.video || data.mp4 || data.hd || data.url;
      if (data.quality) qualityLabel = data.quality;
    }

    if (!downloadUrl) return null;

    if (mode === 'stream') {
      const fileRes = await fetch(downloadUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (fileRes.ok) {
        return new Response(fileRes.body, {
          headers: {
            ...corsHeaders,
            'Content-Type': fileRes.headers.get('content-type') || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': fileRes.headers.get('content-length') || '',
          },
        });
      }
    }

    return new Response(
      JSON.stringify({ status: 'success', downloadUrl, filename, quality: qualityLabel }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error(`best-resolution error: ${e}`);
    return null;
  }
}

async function tryYtstream(videoId: string, isAudio: boolean, mode: string, rapidApiKey: string): Promise<Response | null> {
  try {
    console.log('Trying ytstream fallback...');
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
    let best: any = null;
    const filename = `${(data.title || 'download').replace(/[^\w.\-()（）\s]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;

    if (isAudio) {
      const audioFormats = [
        ...(data.adaptiveFormats || []),
        ...(data.formats || []),
      ].filter((f: any) => f.url && f.mimeType?.includes('audio'));
      audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      best = audioFormats[0];
    } else {
      const muxed = (data.formats || [])
        .filter((f: any) => f.url && f.mimeType?.includes('video'))
        .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      best = muxed[0];
    }

    if (!best?.url) return null;

    if (mode === 'stream') {
      const fileRes = await fetch(best.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com',
        },
      });
      if (fileRes.ok || fileRes.status === 206) {
        return new Response(fileRes.body, {
          headers: {
            ...corsHeaders,
            'Content-Type': fileRes.headers.get('content-type') || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': fileRes.headers.get('content-length') || '',
          },
        });
      }
    }

    return new Response(
      JSON.stringify({ status: 'success', downloadUrl: best.url, filename, quality: best.qualityLabel || 'auto' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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
      '2160p (4K)': '2160',
      '1080p (Full HD)': '1080',
      '720p (HD)': '720',
      '480p': '480',
      '360p': '360',
    };
    const cobaltQuality = qualityMap[quality] || '1080';
    const errors: string[] = [];

    // Strategy 1: Cobalt proxy
    const cobaltResult = await tryCobaltProxy(fullYtUrl, isAudio, cobaltQuality, mode, videoId);
    if (cobaltResult) return cobaltResult;
    errors.push('Cobalt: failed or not configured');

    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (rapidApiKey) {
      // Strategy 2: youtube86 (supports 1080p with combined audio)
      const yt86Result = await tryYoutube86(videoId, isAudio, cobaltQuality, mode, rapidApiKey);
      if (yt86Result) return yt86Result;
      errors.push('youtube86: failed');

      // Strategy 3: youtube-downloader-api-best-resolution
      const bestResResult = await tryBestResolution(videoId, isAudio, mode, rapidApiKey);
      if (bestResResult) return bestResResult;
      errors.push('best-resolution: failed');

      // Strategy 4: ytstream fallback (max ~720p muxed)
      const ytstreamResult = await tryYtstream(videoId, isAudio, mode, rapidApiKey);
      if (ytstreamResult) return ytstreamResult;
      errors.push('ytstream: failed');
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

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

async function fetchWithUA(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
}

async function proxyDownload(url: string, filename: string, quality: string): Promise<Response> {
  console.log(`Proxying download: ${quality} -> ${url.substring(0, 80)}...`);
  const fileRes = await fetchWithUA(url);
  if (fileRes.ok || fileRes.status === 206) {
    return makeStreamResponse(fileRes, filename);
  }
  console.error(`Proxy fetch failed: ${fileRes.status}`);
  return new Response(
    JSON.stringify({ status: 'error', error: `Falha ao baixar o arquivo (HTTP ${fileRes.status})` }),
    { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Strategy 1: Cobalt proxy
async function tryCobalt(fullYtUrl: string, isAudio: boolean, cobaltQuality: string, videoId: string): Promise<Response | null> {
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
    return await proxyDownload(downloadUrl, filename, cobaltQuality + 'p');
  } catch (e) {
    console.error(`Cobalt error: ${e}`);
    return null;
  }
}

// Strategy 2: social-download-all-in-one (returns CDN links, not IP-locked)
async function trySocialDownload(fullYtUrl: string, isAudio: boolean, videoId: string, rapidApiKey: string): Promise<Response | null> {
  try {
    console.log('Trying social-download-all-in-one...');
    const res = await fetch('https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'social-download-all-in-one.p.rapidapi.com',
      },
      body: JSON.stringify({ url: fullYtUrl }),
    });

    if (!res.ok) {
      console.error(`social-download HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    console.log(`social-download response keys: ${Object.keys(data).join(', ')}`);

    let downloadUrl: string | null = null;
    let filename = `download_${videoId}.${isAudio ? 'mp3' : 'mp4'}`;
    let qualityLabel = 'auto';

    // The API returns medias array with url, quality, extension, type
    const medias = data.medias || data.links || [];
    
    if (Array.isArray(medias) && medias.length > 0) {
      if (isAudio) {
        // Find audio format
        const audioMedia = medias.find((m: any) => 
          m.type === 'audio' || m.extension === 'mp3' || m.extension === 'm4a' || 
          (m.quality && m.quality.toLowerCase().includes('audio'))
        );
        if (audioMedia) {
          downloadUrl = audioMedia.url;
          qualityLabel = 'audio';
        } else {
          // Fallback: get lowest quality video (smallest file, has audio)
          const sorted = medias
            .filter((m: any) => m.url)
            .sort((a: any, b: any) => (parseInt(a.quality) || 0) - (parseInt(b.quality) || 0));
          if (sorted.length > 0) {
            downloadUrl = sorted[0].url;
            qualityLabel = sorted[0].quality || 'auto';
          }
        }
      } else {
        // Find best video quality
        const videoMedias = medias
          .filter((m: any) => m.url && m.type !== 'audio')
          .sort((a: any, b: any) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
        
        if (videoMedias.length > 0) {
          downloadUrl = videoMedias[0].url;
          qualityLabel = videoMedias[0].quality || 'auto';
        }
      }
    }

    // Also check for direct url field
    if (!downloadUrl && data.url) {
      downloadUrl = data.url;
    }

    if (!downloadUrl) {
      console.log(`social-download: no suitable URL found in response`);
      return null;
    }

    // Check if URL is from CDN (not googlevideo) — proxy it
    if (downloadUrl.includes('googlevideo.com')) {
      console.log('social-download returned googlevideo URL, skipping (IP-locked)');
      return null;
    }

    return await proxyDownload(downloadUrl, filename, qualityLabel);
  } catch (e) {
    console.error(`social-download error: ${e}`);
    return null;
  }
}

// Strategy 3: ytstream with muxed formats only
async function tryYtstream(videoId: string, isAudio: boolean, quality: string, rapidApiKey: string): Promise<Response | null> {
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

    if (!res.ok) {
      console.error(`ytstream HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const title = (data.title || 'download').replace(/[^\w.\-()（）\s]/g, '_');
    const filename = `${title}.${isAudio ? 'mp3' : 'mp4'}`;

    // ytstream returns link/url fields that may be CDN-hosted
    // Check for direct download links first
    if (data.link) {
      const links = Array.isArray(data.link) ? data.link : [data.link];
      for (const l of links) {
        const url = typeof l === 'string' ? l : l?.url;
        if (url && !url.includes('googlevideo.com')) {
          console.log('ytstream: found non-googlevideo link');
          return await proxyDownload(url, filename, 'auto');
        }
      }
    }

    // Check formats for non-googlevideo URLs
    const allFormats = [...(data.formats || []), ...(data.adaptiveFormats || [])];
    for (const f of allFormats) {
      if (f.url && !f.url.includes('googlevideo.com')) {
        if (isAudio && f.mimeType?.includes('audio')) {
          return await proxyDownload(f.url, filename, 'audio');
        }
        if (!isAudio && f.mimeType?.includes('video')) {
          return await proxyDownload(f.url, filename, f.qualityLabel || 'auto');
        }
      }
    }

    console.log('ytstream: all URLs are googlevideo (IP-locked), skipping');
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
    const { url, format, quality } = await req.json();

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
    const r1 = await tryCobalt(fullYtUrl, isAudio, cobaltQuality, videoId);
    if (r1) return r1;
    errors.push('Cobalt failed');

    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (rapidApiKey) {
      // 2. social-download-all-in-one (CDN links)
      const r2 = await trySocialDownload(fullYtUrl, isAudio, videoId, rapidApiKey);
      if (r2) return r2;
      errors.push('social-download failed');

      // 3. ytstream (only non-googlevideo URLs)
      const r3 = await tryYtstream(videoId, isAudio, cobaltQuality, rapidApiKey);
      if (r3) return r3;
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

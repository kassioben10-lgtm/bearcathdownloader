import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Try multiple RapidAPI YouTube download endpoints
const RAPIDAPI_ENDPOINTS = [
  {
    name: 'youtube-video-download-api1',
    host: 'youtube-video-download-api1.p.rapidapi.com',
    buildUrl: (videoUrl: string) => `https://youtube-video-download-api1.p.rapidapi.com/?url=${encodeURIComponent(videoUrl)}`,
  },
  {
    name: 'ytstream-download-youtube-videos',
    host: 'ytstream-download-youtube-videos.p.rapidapi.com',
    buildUrl: (videoUrl: string) => {
      const idMatch = videoUrl.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]+)/);
      const id = idMatch?.[1] || '';
      return `https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${id}`;
    },
  },
  {
    name: 'yt-video-download',
    host: 'yt-video-download.p.rapidapi.com',
    buildUrl: (videoUrl: string) => `https://yt-video-download.p.rapidapi.com/downloads/mp4?url=${encodeURIComponent(videoUrl)}`,
  },
];

async function tryRapidApiEndpoint(
  endpoint: typeof RAPIDAPI_ENDPOINTS[0],
  videoUrl: string,
  apiKey: string,
): Promise<any> {
  const url = endpoint.buildUrl(videoUrl);
  console.log(`Trying ${endpoint.name}: ${url}`);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': endpoint.host,
    },
  });

  const text = await res.text();

  if (!res.ok) {
    console.error(`${endpoint.name} error ${res.status}: ${text.substring(0, 200)}`);
    throw new Error(`${endpoint.name}: HTTP ${res.status} - ${text.substring(0, 100)}`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${endpoint.name}: Non-JSON response`);
  }

  return { data, endpointName: endpoint.name };
}

function extractDownloadUrl(data: any, targetRes: number, isAudio: boolean): { url: string; quality: string } | null {
  // Try various response formats

  // Format: { formats: [...] }
  if (data.formats && Array.isArray(data.formats)) {
    const candidates = data.formats
      .filter((f: any) => f.url && (isAudio ? f.mimeType?.includes('audio') : f.mimeType?.includes('video')))
      .sort((a: any, b: any) => {
        const aRes = a.height || parseInt(a.qualityLabel) || 0;
        const bRes = b.height || parseInt(b.qualityLabel) || 0;
        return Math.abs(aRes - targetRes) - Math.abs(bRes - targetRes);
      });
    if (candidates.length > 0) {
      return { url: candidates[0].url, quality: candidates[0].qualityLabel || `${candidates[0].height}p` };
    }
  }

  // Format: { adaptiveFormats: [...] }
  if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
    const candidates = data.adaptiveFormats
      .filter((f: any) => f.url && (isAudio ? f.mimeType?.includes('audio') : f.mimeType?.includes('video')))
      .sort((a: any, b: any) => {
        const aRes = a.height || parseInt(a.qualityLabel) || 0;
        const bRes = b.height || parseInt(b.qualityLabel) || 0;
        return Math.abs(aRes - targetRes) - Math.abs(bRes - targetRes);
      });
    if (candidates.length > 0) {
      return { url: candidates[0].url, quality: candidates[0].qualityLabel || `${candidates[0].height}p` };
    }
  }

  // Format: { links: { "720": { url } } }
  if (data.links && typeof data.links === 'object') {
    const entries = Object.entries(data.links) as [string, any][];
    const sorted = entries
      .filter(([_, v]) => v?.url)
      .sort(([a], [b]) => Math.abs(parseInt(a) - targetRes) - Math.abs(parseInt(b) - targetRes));
    if (sorted.length > 0) {
      return { url: (sorted[0][1] as any).url, quality: sorted[0][0] };
    }
  }

  // Format: direct url
  if (data.url) return { url: data.url, quality: 'default' };
  if (data.mp4) return { url: typeof data.mp4 === 'string' ? data.mp4 : data.mp4?.url, quality: 'mp4' };
  if (data.mp3 && isAudio) return { url: typeof data.mp3 === 'string' ? data.mp3 : data.mp3?.url, quality: 'audio' };
  if (data.audio?.url && isAudio) return { url: data.audio.url, quality: 'audio' };

  // Format: { status: "ok", link: "..." }
  if (data.link) return { url: data.link, quality: 'default' };

  return null;
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

    const videoIdMatch = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]+)/);
    if (!videoIdMatch) {
      return new Response(
        JSON.stringify({ error: 'URL do YouTube inválida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (!rapidApiKey) {
      return new Response(
        JSON.stringify({ status: 'error', error: 'RAPIDAPI_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log key prefix for debugging (safe - only first 8 chars)
    console.log(`API key prefix: ${rapidApiKey.substring(0, 8)}...`);
    console.log(`Processing: ${url}, format: ${format}, quality: ${quality}`);

    const isAudio = format === 'audio';
    const qualityMap: Record<string, number> = {
      '2160p (4K)': 2160,
      '1080p (Full HD)': 1080,
      '720p (HD)': 720,
      '480p': 480,
      '360p': 360,
    };
    const targetRes = qualityMap[quality] || 1080;

    const errors: string[] = [];
    for (const endpoint of RAPIDAPI_ENDPOINTS) {
      try {
        const { data, endpointName } = await tryRapidApiEndpoint(endpoint, url, rapidApiKey);
        console.log(`${endpointName} response keys: ${Object.keys(data).join(', ')}`);

        const result = extractDownloadUrl(data, targetRes, isAudio);
        if (result) {
          return new Response(
            JSON.stringify({
              status: 'success',
              downloadUrl: result.url,
              filename: `${data.title || 'download'}.${isAudio ? 'mp3' : 'mp4'}`,
              quality: result.quality,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Log full response structure for debugging
        console.log(`${endpointName} data structure: ${JSON.stringify(data).substring(0, 500)}`);
        errors.push(`${endpointName}: no download URL found in response`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(msg);
      }
    }

    return new Response(
      JSON.stringify({
        status: 'error',
        error: `Nenhuma API disponível. Erros: ${errors.join('; ')}`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ status: 'error', error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

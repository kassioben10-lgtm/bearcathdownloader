import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RAPIDAPI_ENDPOINTS = [
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
    name: 'youtube-video-download-api1',
    host: 'youtube-video-download-api1.p.rapidapi.com',
    buildUrl: (videoUrl: string) => `https://youtube-video-download-api1.p.rapidapi.com/?url=${encodeURIComponent(videoUrl)}`,
  },
];

function extractDownloadUrl(data: any, targetRes: number, isAudio: boolean): { url: string; quality: string } | null {
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

  if (data.links && typeof data.links === 'object') {
    const entries = Object.entries(data.links) as [string, any][];
    const sorted = entries
      .filter(([_, v]) => v?.url)
      .sort(([a], [b]) => Math.abs(parseInt(a) - targetRes) - Math.abs(parseInt(b) - targetRes));
    if (sorted.length > 0) {
      return { url: (sorted[0][1] as any).url, quality: sorted[0][0] };
    }
  }

  if (data.url) return { url: data.url, quality: 'default' };
  if (data.mp4) return { url: typeof data.mp4 === 'string' ? data.mp4 : data.mp4?.url, quality: 'mp4' };
  if (data.mp3 && isAudio) return { url: typeof data.mp3 === 'string' ? data.mp3 : data.mp3?.url, quality: 'audio' };
  if (data.link) return { url: data.link, quality: 'default' };

  return null;
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

    const isAudio = format === 'audio';
    const qualityMap: Record<string, number> = {
      '2160p (4K)': 2160, '1080p (Full HD)': 1080, '720p (HD)': 720, '480p': 480, '360p': 360,
    };
    const targetRes = qualityMap[quality] || 1080;

    const errors: string[] = [];
    for (const endpoint of RAPIDAPI_ENDPOINTS) {
      try {
        const apiUrl = endpoint.buildUrl(url);
        console.log(`Trying ${endpoint.name}: ${apiUrl}`);

        const res = await fetch(apiUrl, {
          headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': endpoint.host },
        });

        if (!res.ok) {
          const text = await res.text();
          console.error(`${endpoint.name} error ${res.status}: ${text.substring(0, 200)}`);
          errors.push(`${endpoint.name}: HTTP ${res.status}`);
          continue;
        }

        const data = await res.json();
        const result = extractDownloadUrl(data, targetRes, isAudio);

        if (!result) {
          errors.push(`${endpoint.name}: no download URL found`);
          continue;
        }

        const filename = `${(data.title || 'download').replace(/[^\w.\-()（）\s]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;

        // mode=stream: proxy the file directly with Content-Disposition
        if (mode === 'stream') {
          console.log(`Streaming ${result.quality} from ${endpoint.name}`);
          const videoRes = await fetch(result.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': '*/*',
              'Referer': 'https://www.youtube.com/',
              'Origin': 'https://www.youtube.com',
            },
          });

          if (!videoRes.ok) {
            console.error(`Stream fetch failed: ${videoRes.status}`);
            errors.push(`${endpoint.name}: stream failed ${videoRes.status}`);
            continue;
          }

          return new Response(videoRes.body, {
            headers: {
              ...corsHeaders,
              'Content-Type': videoRes.headers.get('content-type') || 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${filename}"`,
              'Content-Length': videoRes.headers.get('content-length') || '',
            },
          });
        }

        // Default: return URL info (legacy)
        return new Response(
          JSON.stringify({ status: 'success', downloadUrl: result.url, filename, quality: result.quality }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    return new Response(
      JSON.stringify({ status: 'error', error: `Nenhuma API disponível. Erros: ${errors.join('; ')}` }),
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    const videoId = videoIdMatch[1];
    const fullYtUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (!rapidApiKey) {
      return new Response(
        JSON.stringify({ status: 'error', error: 'RAPIDAPI_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isAudio = format === 'audio';
    const errors: string[] = [];

    // Strategy 1: youtube86 (task-based, returns merged video+audio)
    try {
      console.log('Trying youtube86...');

      // Step 1: Submit download task
      const submitRes = await fetch('https://youtube86.p.rapidapi.com/api/youtube/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'youtube86.p.rapidapi.com',
        },
        body: JSON.stringify({ url: fullYtUrl }),
      });

      if (submitRes.ok) {
        const submitData = await submitRes.json();
        console.log(`youtube86 response keys: ${JSON.stringify(Object.keys(submitData))}`);
        console.log(`youtube86 response: ${JSON.stringify(submitData).substring(0, 1000)}`);

        // The API may return links directly or a taskId for polling
        let downloadUrl: string | null = null;
        let filename = `download.${isAudio ? 'mp3' : 'mp4'}`;
        let selectedQuality = 'auto';

        // Extract title if available
        const title = submitData.title || submitData.videoTitle || '';
        if (title) {
          filename = `${title.replace(/[^\w.\-()（）\s]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;
        }

        // Check if we got a taskId (async processing)
        if (submitData.taskId || submitData.task_id || submitData.id) {
          const taskId = submitData.taskId || submitData.task_id || submitData.id;
          console.log(`youtube86 taskId: ${taskId}, polling...`);

          // Poll for completion (max 30 seconds)
          for (let i = 0; i < 15; i++) {
            await sleep(2000);
            const statusRes = await fetch(`https://youtube86.p.rapidapi.com/api/youtube/links/${taskId}`, {
              headers: {
                'x-rapidapi-key': rapidApiKey,
                'x-rapidapi-host': 'youtube86.p.rapidapi.com',
              },
            });

            if (statusRes.ok) {
              const statusData = await statusRes.json();
              console.log(`youtube86 poll ${i + 1}: ${JSON.stringify(statusData).substring(0, 500)}`);

              if (statusData.status === 'completed' || statusData.status === 'finished' || statusData.urls || statusData.links || statusData.downloadUrl) {
                const links = statusData.urls || statusData.links || statusData.formats || [];
                downloadUrl = extractBestUrl(links, isAudio, quality) || statusData.downloadUrl || statusData.url;
                if (statusData.title) filename = `${statusData.title.replace(/[^\w.\-()（）\s]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;
                break;
              }
              if (statusData.status === 'failed' || statusData.status === 'error') {
                errors.push(`youtube86: task failed - ${statusData.error || statusData.message || 'unknown'}`);
                break;
              }
            }
          }
        } else {
          // Direct response with links
          const links = submitData.urls || submitData.links || submitData.formats || [];
          if (Array.isArray(links) && links.length > 0) {
            downloadUrl = extractBestUrl(links, isAudio, quality);
          }
          if (!downloadUrl) {
            downloadUrl = submitData.downloadUrl || submitData.url || submitData.download_url;
          }
        }

        if (downloadUrl) {
          return streamOrReturnUrl(downloadUrl, filename, selectedQuality, mode);
        } else {
          errors.push('youtube86: no download URL found');
        }
      } else {
        const text = await submitRes.text();
        console.error(`youtube86 error ${submitRes.status}: ${text.substring(0, 300)}`);
        errors.push(`youtube86: HTTP ${submitRes.status}`);
      }
    } catch (e) {
      errors.push(`youtube86: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Strategy 2: ytstream fallback (muxed formats, max ~720p but includes audio)
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

      if (res.ok) {
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
          // Only use muxed formats (video+audio combined)
          const muxed = (data.formats || [])
            .filter((f: any) => f.url && f.mimeType?.includes('video'))
            .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
          best = muxed[0];
          console.log(`ytstream muxed: ${muxed.map((f: any) => `${f.qualityLabel || f.height}p`).join(', ')}`);
        }

        if (best?.url) {
          return streamOrReturnUrl(best.url, filename, best.qualityLabel || `${best.height}p`, mode);
        }
        errors.push('ytstream: no suitable format found');
      } else {
        errors.push(`ytstream: HTTP ${res.status}`);
      }
    } catch (e) {
      errors.push(`ytstream: ${e instanceof Error ? e.message : String(e)}`);
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

function extractBestUrl(links: any[], isAudio: boolean, quality: string): string | null {
  if (!Array.isArray(links) || links.length === 0) return null;

  const qualityMap: Record<string, number> = {
    '2160p (4K)': 2160, '1080p (Full HD)': 1080, '720p (HD)': 720,
    '480p': 480, '360p': 360,
  };
  const targetRes = qualityMap[quality] || 1080;

  const candidates = links.filter((l: any) => {
    const url = l.url || l.link || l.downloadUrl;
    if (!url) return false;
    const mime = (l.mimeType || l.type || l.format || '').toLowerCase();
    if (isAudio) return mime.includes('audio') || mime.includes('mp3') || mime.includes('m4a');
    return mime.includes('video') || mime.includes('mp4') || mime.includes('webm');
  });

  if (candidates.length === 0) {
    // Try any link
    const anyWithUrl = links.filter((l: any) => l.url || l.link || l.downloadUrl);
    if (anyWithUrl.length > 0) return anyWithUrl[0].url || anyWithUrl[0].link || anyWithUrl[0].downloadUrl;
    return null;
  }

  // Sort by closest to target quality
  candidates.sort((a: any, b: any) => {
    const aH = a.height || parseInt(a.quality) || parseInt(a.qualityLabel) || 0;
    const bH = b.height || parseInt(b.quality) || parseInt(b.qualityLabel) || 0;
    return Math.abs(aH - targetRes) - Math.abs(bH - targetRes);
  });

  const best = candidates[0];
  return best.url || best.link || best.downloadUrl;
}

async function streamOrReturnUrl(downloadUrl: string, filename: string, quality: string, mode: string) {
  if (mode === 'stream') {
    console.log(`Streaming: ${downloadUrl.substring(0, 100)}`);
    try {
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
      console.log(`Stream failed ${fileRes.status}, returning URL`);
    } catch (e) {
      console.log(`Stream error: ${e}`);
    }
  }

  // Return URL for client
  return new Response(
    JSON.stringify({ status: 'success', downloadUrl, filename, quality }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (!rapidApiKey) {
      return new Response(
        JSON.stringify({ status: 'error', error: 'RAPIDAPI_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isAudio = format === 'audio';
    const errors: string[] = [];

    // Strategy 1: youtube-search-download3 (CDN-proxied links)
    try {
      console.log('Trying youtube-search-download3...');
      const dlRes = await fetch(
        `https://youtube-search-download3.p.rapidapi.com/download?video=${videoId}`,
        {
          headers: {
            'x-rapidapi-key': rapidApiKey,
            'x-rapidapi-host': 'youtube-search-download3.p.rapidapi.com',
          },
        }
      );

      if (dlRes.ok) {
        const data = await dlRes.json();
        console.log(`download3 keys: ${JSON.stringify(Object.keys(data))}`);
        console.log(`download3 data: ${JSON.stringify(data).substring(0, 500)}`);

        let downloadUrl: string | null = null;
        let filename = `${data.title || 'download'}.${isAudio ? 'mp3' : 'mp4'}`;

        if (isAudio && data.mp3) {
          downloadUrl = typeof data.mp3 === 'string' ? data.mp3 : data.mp3?.url || data.mp3?.link;
        }
        if (!isAudio && data.mp4) {
          downloadUrl = typeof data.mp4 === 'string' ? data.mp4 : data.mp4?.url || data.mp4?.link;
        }
        // Try other fields
        if (!downloadUrl && data.url) downloadUrl = data.url;
        if (!downloadUrl && data.link) downloadUrl = data.link;
        if (!downloadUrl && data.downloadUrl) downloadUrl = data.downloadUrl;
        // Try formats array
        if (!downloadUrl && data.formats) {
          const target = isAudio
            ? data.formats.find((f: any) => f.mimeType?.includes('audio'))
            : data.formats.find((f: any) => f.mimeType?.includes('video'));
          if (target?.url) downloadUrl = target.url;
        }

        if (downloadUrl) {
          if (mode === 'stream') {
            console.log(`Streaming from download3: ${downloadUrl.substring(0, 100)}`);
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
                  'Content-Disposition': `attachment; filename="${filename.replace(/[^\w.\-()（）\s]/g, '_')}"`,
                  'Content-Length': fileRes.headers.get('content-length') || '',
                },
              });
            }
            errors.push(`download3: stream failed ${fileRes.status}`);
          } else {
            return new Response(
              JSON.stringify({ status: 'success', downloadUrl, filename, quality: 'auto' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          errors.push(`download3: no URL in response`);
        }
      } else {
        const text = await dlRes.text();
        console.error(`download3 error ${dlRes.status}: ${text.substring(0, 200)}`);
        errors.push(`download3: HTTP ${dlRes.status}`);
      }
    } catch (e) {
      errors.push(`download3: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Strategy 2: ytstream (returns URLs, try streaming from edge function)
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
        console.log(`ytstream keys: ${JSON.stringify(Object.keys(data))}`);
        console.log(`ytstream formats count: ${data.formats?.length}, adaptiveFormats count: ${data.adaptiveFormats?.length}`);
        
        const qualityMap: Record<string, number> = {
          '2160p (4K)': 2160, '1080p (Full HD)': 1080, '720p (HD)': 720,
          '480p': 480, '360p': 360,
        };
        const targetRes = qualityMap[quality] || 1080;

        let best: any = null;
        let filename = `${(data.title || 'download').replace(/[^\w.\-()（）\s]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;

        if (isAudio) {
          // For audio: prefer adaptiveFormats audio with highest bitrate
          const audioFormats = [
            ...(data.adaptiveFormats || []),
            ...(data.formats || []),
          ].filter((f: any) => f.url && f.mimeType?.includes('audio'));
          audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
          best = audioFormats[0];
          console.log(`Audio candidates: ${audioFormats.length}, best bitrate: ${best?.bitrate}`);
        } else {
          // For video: try adaptiveFormats first (higher quality), then muxed formats
          const allFormats = [
            ...(data.adaptiveFormats || []).map((f: any) => ({ ...f, _source: 'adaptive' })),
            ...(data.formats || []).map((f: any) => ({ ...f, _source: 'muxed' })),
          ].filter((f: any) => f.url && f.mimeType?.includes('video'));

          // Log available qualities
          console.log(`Video candidates: ${allFormats.map((f: any) => `${f.qualityLabel || f.height || '?'}(${f._source})`).join(', ')}`);

          // Prefer muxed (has audio) at or above target, then adaptive at target
          const muxed = allFormats
            .filter((f: any) => f._source === 'muxed')
            .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

          const adaptive = allFormats
            .filter((f: any) => f._source === 'adaptive')
            .sort((a: any, b: any) => {
              const aH = a.height || parseInt(a.qualityLabel) || 0;
              const bH = b.height || parseInt(b.qualityLabel) || 0;
              return Math.abs(aH - targetRes) - Math.abs(bH - targetRes);
            });

          // If target is <= 720p, prefer muxed (has audio); otherwise use adaptive (no audio but HD+)
          const bestMuxed = muxed[0];
          const bestAdaptive = adaptive[0];
          const bestMuxedHeight = bestMuxed?.height || parseInt(bestMuxed?.qualityLabel) || 0;

          if (bestMuxedHeight >= targetRes && bestMuxed) {
            best = bestMuxed;
            console.log(`Using muxed format: ${best.qualityLabel || best.height}p`);
          } else if (bestAdaptive) {
            best = bestAdaptive;
            console.log(`Using adaptive format: ${best.qualityLabel || best.height}p (video-only, no audio track)`);
          } else if (bestMuxed) {
            best = bestMuxed;
            console.log(`Fallback to muxed: ${best.qualityLabel || best.height}p`);
          }
        }

        if (best?.url) {
          console.log(`Selected: ${best.qualityLabel || best.height || 'audio'}, bitrate: ${best.bitrate}, mimeType: ${best.mimeType}`);
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

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
    const fullYtUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const isAudio = format === 'audio';
    const errors: string[] = [];

    // Quality mapping for Cobalt
    const qualityMap: Record<string, string> = {
      '2160p (4K)': '2160',
      '1080p (Full HD)': '1080',
      '720p (HD)': '720',
      '480p': '480',
      '360p': '360',
    };
    const cobaltQuality = qualityMap[quality] || '1080';

    // Strategy 1: Cobalt via Cloudflare Worker proxy
    const cobaltProxyUrl = Deno.env.get('COBALT_PROXY_URL');
    if (cobaltProxyUrl) {
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

        if (cobaltRes.ok) {
          const data = await cobaltRes.json();
          console.log(`Cobalt response: ${JSON.stringify(data).substring(0, 500)}`);

          // Cobalt returns { status: "tunnel"/"redirect", url: "..." } or { status: "picker", picker: [...] }
          let downloadUrl: string | null = null;

          if (data.status === 'tunnel' || data.status === 'redirect') {
            downloadUrl = data.url;
          } else if (data.status === 'picker' && data.picker?.length > 0) {
            // Pick the first option (usually best quality)
            downloadUrl = data.picker[0].url;
          } else if (data.url) {
            downloadUrl = data.url;
          }

          if (downloadUrl) {
            const filename = `download_${videoId}.${isAudio ? 'mp3' : 'mp4'}`;

            if (mode === 'stream') {
              console.log(`Streaming from Cobalt: ${downloadUrl.substring(0, 100)}`);
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
              console.log(`Cobalt stream failed ${fileRes.status}, returning URL`);
            }

            // Return URL for client download
            return new Response(
              JSON.stringify({ status: 'success', downloadUrl, filename, quality: cobaltQuality + 'p' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          errors.push(`Cobalt: status=${data.status}, no URL found`);
          if (data.error) errors.push(`Cobalt error: ${JSON.stringify(data.error)}`);
        } else {
          const text = await cobaltRes.text();
          console.error(`Cobalt proxy error ${cobaltRes.status}: ${text.substring(0, 300)}`);
          errors.push(`Cobalt: HTTP ${cobaltRes.status} - ${text.substring(0, 100)}`);
        }
      } catch (e) {
        errors.push(`Cobalt: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      errors.push('Cobalt: COBALT_PROXY_URL not configured');
    }

    // Strategy 2: ytstream fallback (muxed, max ~360-720p but has audio)
    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (rapidApiKey) {
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
            const muxed = (data.formats || [])
              .filter((f: any) => f.url && f.mimeType?.includes('video'))
              .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
            best = muxed[0];
          }

          if (best?.url) {
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
          }
          errors.push('ytstream: no suitable format');
        } else {
          errors.push(`ytstream: HTTP ${res.status}`);
        }
      } catch (e) {
        errors.push(`ytstream: ${e instanceof Error ? e.message : String(e)}`);
      }
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

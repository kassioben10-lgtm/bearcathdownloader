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

    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (!rapidApiKey) {
      return new Response(
        JSON.stringify({ status: 'error', error: 'RAPIDAPI_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isAudio = format === 'audio';
    const errors: string[] = [];

    // Strategy 1: YouTube Video Downloader 4K/8K (returns merged video+audio)
    try {
      console.log('Trying youtube-video-downloader-4k...');
      const dlFormat = isAudio ? 'mp3' : 'mp4';
      const apiUrl = `https://youtube-video-downloader-4k-and-8k-mp3.p.rapidapi.com/download.php?url=${encodeURIComponent(fullYtUrl)}&format=${dlFormat}&button=1`;

      const dlRes = await fetch(apiUrl, {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'youtube-video-downloader-4k-and-8k-mp3.p.rapidapi.com',
        },
      });

      if (dlRes.ok) {
        const data = await dlRes.json();
        console.log(`4k-downloader keys: ${JSON.stringify(Object.keys(data))}`);
        console.log(`4k-downloader data preview: ${JSON.stringify(data).substring(0, 800)}`);

        // Find best download link with quality matching
        let downloadUrl: string | null = null;
        let filename = `download.${isAudio ? 'mp3' : 'mp4'}`;
        let selectedQuality = 'auto';

        // Try to extract title
        if (data.title) {
          filename = `${data.title.replace(/[^\w.\-()（）\s]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;
        }

        // Check for links/formats array
        const links = data.links || data.formats || data.urls || [];
        if (Array.isArray(links) && links.length > 0) {
          const qualityMap: Record<string, number> = {
            '2160p (4K)': 2160, '1080p (Full HD)': 1080, '720p (HD)': 720,
            '480p': 480, '360p': 360,
          };
          const targetRes = qualityMap[quality] || 1080;

          // Sort by closest to target quality
          const sorted = links
            .filter((l: any) => l.url || l.link || l.downloadUrl)
            .sort((a: any, b: any) => {
              const aH = a.height || parseInt(a.quality) || parseInt(a.qualityLabel) || 0;
              const bH = b.height || parseInt(b.quality) || parseInt(b.qualityLabel) || 0;
              return Math.abs(aH - targetRes) - Math.abs(bH - targetRes);
            });

          if (sorted.length > 0) {
            const best = sorted[0];
            downloadUrl = best.url || best.link || best.downloadUrl;
            selectedQuality = best.quality || best.qualityLabel || 'auto';
          }
        }

        // Try direct URL fields
        if (!downloadUrl) {
          downloadUrl = data.url || data.link || data.downloadUrl || data.download_url;
        }

        if (downloadUrl) {
          if (mode === 'stream') {
            console.log(`Streaming from 4k-downloader: ${downloadUrl.substring(0, 100)}`);
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
            errors.push(`4k-downloader: stream failed ${fileRes.status}`);
          } else {
            return new Response(
              JSON.stringify({ status: 'success', downloadUrl, filename, quality: selectedQuality }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          errors.push(`4k-downloader: no URL in response`);
        }
      } else {
        const text = await dlRes.text();
        console.error(`4k-downloader error ${dlRes.status}: ${text.substring(0, 200)}`);
        errors.push(`4k-downloader: HTTP ${dlRes.status}`);
      }
    } catch (e) {
      errors.push(`4k-downloader: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Strategy 2: ytstream fallback (muxed formats with audio, max ~720p)
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
          if (mode !== 'stream') {
            return new Response(
              JSON.stringify({
                status: 'success',
                downloadUrl: best.url,
                filename,
                quality: best.qualityLabel || `${best.height}p`,
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const fileRes = await fetch(best.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

          return new Response(
            JSON.stringify({
              status: 'success',
              downloadUrl: best.url,
              filename,
              quality: best.qualityLabel || `${best.height}p`,
              streamFailed: true,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
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

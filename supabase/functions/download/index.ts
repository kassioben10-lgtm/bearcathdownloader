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
    const isAudio = format === 'audio';
    const errors: string[] = [];

    // Strategy 1: SocialMediaDL (free, no API key, returns merged video+audio)
    try {
      console.log('Trying SocialMediaDL...');
      const smdlRes = await fetch(
        `https://socialmediadl.vercel.app/api/get-video-data?url=${encodeURIComponent(fullYtUrl)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        }
      );

      if (smdlRes.ok) {
        const data = await smdlRes.json();
        console.log(`SocialMediaDL response: ${JSON.stringify(data).substring(0, 800)}`);

        if (data.status === 'success' && data.data?.media) {
          const media = data.data.media;
          const title = data.data.title || 'download';
          const filename = `${title.replace(/[^\w.\-()（）\s]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;

          const qualityMap: Record<string, number> = {
            '2160p (4K)': 2160, '1080p (Full HD)': 1080, '720p (HD)': 720,
            '480p': 480, '360p': 360,
          };
          const targetRes = qualityMap[quality] || 1080;

          // Filter by type and sort by quality
          const candidates = media
            .filter((m: any) => {
              if (isAudio) return m.type === 'audio' || m.format === 'mp3' || m.format === 'm4a';
              return m.type === 'video' || m.format === 'mp4';
            })
            .sort((a: any, b: any) => {
              const aQ = parseInt(a.quality) || 0;
              const bQ = parseInt(b.quality) || 0;
              return Math.abs(aQ - targetRes) - Math.abs(bQ - targetRes);
            });

          const best = candidates[0] || media[0];
          if (best?.url) {
            console.log(`SocialMediaDL selected: ${best.quality || 'auto'}, format: ${best.format}`);
            return await streamOrReturnUrl(best.url, filename, best.quality || 'auto', mode);
          }
        }
        errors.push('SocialMediaDL: no media found');
      } else {
        errors.push(`SocialMediaDL: HTTP ${smdlRes.status}`);
      }
    } catch (e) {
      errors.push(`SocialMediaDL: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Strategy 2: youtube-video-download by insanemedia (RapidAPI)
    if (rapidApiKey) {
      try {
        console.log('Trying youtube-video-download...');
        const res = await fetch(
          `https://youtube-video-download.p.rapidapi.com/video?videourl=${encodeURIComponent(fullYtUrl)}`,
          {
            headers: {
              'x-rapidapi-key': rapidApiKey,
              'x-rapidapi-host': 'youtube-video-download.p.rapidapi.com',
            },
          }
        );

        if (res.ok) {
          const data = await res.json();
          console.log(`yt-video-download keys: ${JSON.stringify(Object.keys(data))}`);
          console.log(`yt-video-download data: ${JSON.stringify(data).substring(0, 800)}`);

          const title = data.title || 'download';
          const filename = `${title.replace(/[^\w.\-()（）\s]/g, '_')}.${isAudio ? 'mp3' : 'mp4'}`;

          // This API typically returns links in various formats
          let downloadUrl: string | null = null;

          // Check for direct links
          if (data.links) {
            const links = Array.isArray(data.links) ? data.links : Object.values(data.links);
            downloadUrl = findBestLink(links as any[], isAudio, quality);
          }

          // Check for formats/streams
          if (!downloadUrl && data.formats) {
            downloadUrl = findBestLink(data.formats, isAudio, quality);
          }
          if (!downloadUrl && data.streams) {
            downloadUrl = findBestLink(data.streams, isAudio, quality);
          }

          // Direct URL fields
          if (!downloadUrl) {
            downloadUrl = data.url || data.downloadUrl || data.download_url || data.link;
          }

          if (downloadUrl) {
            console.log(`yt-video-download URL found`);
            return await streamOrReturnUrl(downloadUrl, filename, 'auto', mode);
          }
          errors.push('yt-video-download: no URL found in response');
        } else {
          const text = await res.text();
          console.error(`yt-video-download error ${res.status}: ${text.substring(0, 200)}`);
          errors.push(`yt-video-download: HTTP ${res.status}`);
        }
      } catch (e) {
        errors.push(`yt-video-download: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Strategy 3: ytstream fallback (muxed formats with audio)
    if (rapidApiKey) {
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
            const muxed = (data.formats || [])
              .filter((f: any) => f.url && f.mimeType?.includes('video'))
              .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
            best = muxed[0];
            console.log(`ytstream muxed: ${muxed.map((f: any) => `${f.qualityLabel || f.height}p`).join(', ')}`);
          }

          if (best?.url) {
            return await streamOrReturnUrl(best.url, filename, best.qualityLabel || `${best.height}p`, mode);
          }
          errors.push('ytstream: no suitable format found');
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

function findBestLink(links: any[], isAudio: boolean, quality: string): string | null {
  if (!Array.isArray(links) || links.length === 0) return null;

  const qualityMap: Record<string, number> = {
    '2160p (4K)': 2160, '1080p (Full HD)': 1080, '720p (HD)': 720,
    '480p': 480, '360p': 360,
  };
  const targetRes = qualityMap[quality] || 1080;

  const candidates = links.filter((l: any) => {
    const url = l.url || l.link || l.downloadUrl || l.href;
    if (!url) return false;
    const mime = (l.mimeType || l.type || l.format || l.quality || '').toLowerCase();
    if (isAudio) return mime.includes('audio') || mime.includes('mp3') || mime.includes('m4a');
    return mime.includes('video') || mime.includes('mp4') || mime.includes('webm') || /\d+p/.test(mime);
  });

  if (candidates.length === 0) {
    const any = links.find((l: any) => l.url || l.link || l.downloadUrl || l.href);
    return any ? (any.url || any.link || any.downloadUrl || any.href) : null;
  }

  candidates.sort((a: any, b: any) => {
    const aH = a.height || parseInt(a.quality) || parseInt(a.qualityLabel) || 0;
    const bH = b.height || parseInt(b.quality) || parseInt(b.qualityLabel) || 0;
    return Math.abs(aH - targetRes) - Math.abs(bH - targetRes);
  });

  const best = candidates[0];
  return best.url || best.link || best.downloadUrl || best.href;
}

async function streamOrReturnUrl(downloadUrl: string, filename: string, quality: string, mode: string) {
  if (mode === 'stream') {
    console.log(`Streaming: ${downloadUrl.substring(0, 120)}`);
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

  return new Response(
    JSON.stringify({ status: 'success', downloadUrl, filename, quality }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

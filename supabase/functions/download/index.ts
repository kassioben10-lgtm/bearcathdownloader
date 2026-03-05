import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.jing.rocks',
  'https://iv.nboow.de',
];

async function tryInvidiousInstance(instance: string, videoId: string) {
  const url = `${instance}/api/v1/videos/${videoId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function getVideoData(videoId: string) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`Trying instance: ${instance}`);
      const data = await tryInvidiousInstance(instance, videoId);
      if (data && (data.formatStreams?.length || data.adaptiveFormats?.length)) {
        return data;
      }
    } catch (e) {
      console.log(`Instance ${instance} failed: ${e.message}`);
    }
  }
  throw new Error('Nenhuma instância disponível. Tente novamente mais tarde.');
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

    const videoId = videoIdMatch[1];
    console.log(`Processing video: ${videoId}, format: ${format}, quality: ${quality}`);

    const videoData = await getVideoData(videoId);
    const isAudio = format === 'audio';

    const qualityMap: Record<string, number> = {
      '2160p (4K)': 2160,
      '1080p (Full HD)': 1080,
      '720p (HD)': 720,
      '480p': 480,
      '360p': 360,
    };

    let selectedFormat: any = null;
    const title = videoData.title || 'download';

    if (isAudio) {
      // Use adaptiveFormats for audio-only
      const audioFormats = (videoData.adaptiveFormats || [])
        .filter((f: any) => f.type?.startsWith('audio/') && f.url)
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      selectedFormat = audioFormats[0];
    } else {
      // Use formatStreams for combined video+audio
      const targetHeight = qualityMap[quality] || 1080;

      const combinedFormats = (videoData.formatStreams || [])
        .filter((f: any) => f.url)
        .sort((a: any, b: any) => {
          const hA = parseInt(f.resolution || f.qualityLabel || '0');
          const hB = parseInt(f.resolution || f.qualityLabel || '0');
          return hB - hA;
        });

      // Sort properly by extracting height
      const sorted = (videoData.formatStreams || [])
        .filter((f: any) => f.url)
        .map((f: any) => {
          const h = parseInt(f.qualityLabel || f.resolution || '0');
          return { ...f, height: h };
        })
        .sort((a: any, b: any) => b.height - a.height);

      // Find best match at or below target
      selectedFormat = sorted.find((f: any) => f.height <= targetHeight) || sorted[0];

      // If no combined, try adaptive video formats
      if (!selectedFormat) {
        const adaptiveVideo = (videoData.adaptiveFormats || [])
          .filter((f: any) => f.type?.startsWith('video/') && f.url)
          .map((f: any) => {
            const h = parseInt(f.qualityLabel || f.resolution || '0');
            return { ...f, height: h };
          })
          .sort((a: any, b: any) => b.height - a.height);

        selectedFormat = adaptiveVideo.find((f: any) => f.height <= targetHeight) || adaptiveVideo[0];
      }
    }

    if (!selectedFormat || !selectedFormat.url) {
      return new Response(
        JSON.stringify({
          status: 'error',
          error: 'Nenhum formato disponível para este vídeo.',
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ext = isAudio ? 'mp3' : 'mp4';
    const filename = `${title.replace(/[^\w\s-]/g, '').trim()}.${ext}`;

    console.log(`Selected: ${selectedFormat.type || selectedFormat.mimeType}, quality: ${selectedFormat.qualityLabel || selectedFormat.resolution || 'audio'}`);

    return new Response(
      JSON.stringify({
        status: 'success',
        downloadUrl: selectedFormat.url,
        filename,
        quality: selectedFormat.qualityLabel || selectedFormat.resolution || 'audio',
        mimeType: selectedFormat.type || selectedFormat.mimeType,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

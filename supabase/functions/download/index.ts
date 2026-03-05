import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Piped API instances - these expose a public API for YouTube data
const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.adminforge.de',
  'https://api.piped.projectsegfau.lt',
];

async function tryPipedInstance(instance: string, videoId: string) {
  const url = `${instance}/streams/${videoId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

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
  const errors: string[] = [];
  for (const instance of PIPED_INSTANCES) {
    try {
      console.log(`Trying Piped instance: ${instance}`);
      const data = await tryPipedInstance(instance, videoId);
      if (data && (data.videoStreams?.length || data.audioStreams?.length)) {
        console.log(`Success with ${instance}`);
        return data;
      }
      console.log(`${instance} returned no streams`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`Instance ${instance} failed: ${msg}`);
      errors.push(`${instance}: ${msg}`);
    }
  }
  throw new Error(`Nenhuma instância disponível. Erros: ${errors.join('; ')}`);
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

    let selectedStream: any = null;
    const title = videoData.title || 'download';

    if (isAudio) {
      // Piped returns audioStreams array with bitrate, url, mimeType, etc.
      const audioStreams = (videoData.audioStreams || [])
        .filter((s: any) => s.url)
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      selectedStream = audioStreams[0];
    } else {
      const targetHeight = qualityMap[quality] || 1080;

      // Piped videoStreams have: url, format, quality (e.g. "720p"), videoOnly, etc.
      // First try streams that are NOT video-only (have audio)
      const combinedStreams = (videoData.videoStreams || [])
        .filter((s: any) => s.url && !s.videoOnly)
        .map((s: any) => {
          const h = parseInt(s.quality || '0');
          return { ...s, height: h };
        })
        .sort((a: any, b: any) => b.height - a.height);

      selectedStream = combinedStreams.find((s: any) => s.height <= targetHeight) || combinedStreams[0];

      // Fallback to video-only if no combined streams
      if (!selectedStream) {
        const videoOnly = (videoData.videoStreams || [])
          .filter((s: any) => s.url)
          .map((s: any) => {
            const h = parseInt(s.quality || '0');
            return { ...s, height: h };
          })
          .sort((a: any, b: any) => b.height - a.height);

        selectedStream = videoOnly.find((s: any) => s.height <= targetHeight) || videoOnly[0];
      }
    }

    if (!selectedStream || !selectedStream.url) {
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

    console.log(`Selected: ${selectedStream.mimeType || selectedStream.format}, quality: ${selectedStream.quality || 'audio'}`);

    return new Response(
      JSON.stringify({
        status: 'success',
        downloadUrl: selectedStream.url,
        filename,
        quality: selectedStream.quality || 'audio',
        mimeType: selectedStream.mimeType || selectedStream.format,
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

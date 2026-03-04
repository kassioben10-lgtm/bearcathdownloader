import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getVideoInfo(videoId: string) {
  // Fetch the YouTube watch page to extract video info
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(watchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const html = await response.text();

  // Extract ytInitialPlayerResponse
  const playerResponseMatch = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  if (!playerResponseMatch) {
    // Try alternate pattern
    const altMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!altMatch) {
      throw new Error('Could not extract player response from YouTube page');
    }
    return JSON.parse(altMatch[1]);
  }

  return JSON.parse(playerResponseMatch[1]);
}

function extractFormats(playerResponse: any) {
  const streamingData = playerResponse?.streamingData;
  if (!streamingData) {
    throw new Error('No streaming data available');
  }

  const formats = [
    ...(streamingData.formats || []),
    ...(streamingData.adaptiveFormats || []),
  ];

  return formats.filter((f: any) => f.url || f.signatureCipher);
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

    // Extract video ID
    const videoIdMatch = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]+)/);
    if (!videoIdMatch) {
      return new Response(
        JSON.stringify({ error: 'URL do YouTube inválida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const videoId = videoIdMatch[1];
    console.log(`Processing video: ${videoId}, format: ${format}, quality: ${quality}`);

    const playerResponse = await getVideoInfo(videoId);
    const formats = extractFormats(playerResponse);

    const isAudio = format === 'audio';

    // Quality mapping
    const qualityMap: Record<string, number> = {
      '2160p (4K)': 2160,
      '1080p (Full HD)': 1080,
      '720p (HD)': 720,
      '480p': 480,
      '360p': 360,
    };

    const bitrateMap: Record<string, number> = {
      '320kbps': 320000,
      '256kbps': 256000,
      '192kbps': 192000,
      '128kbps': 128000,
    };

    let selectedFormat: any = null;

    if (isAudio) {
      // Find audio-only formats sorted by bitrate
      const audioFormats = formats
        .filter((f: any) => f.mimeType?.startsWith('audio/') && f.url)
        .sort((a: any, b: any) => (b.averageBitrate || b.bitrate || 0) - (a.averageBitrate || a.bitrate || 0));

      const targetBitrate = bitrateMap[quality] || 128000;

      // Find closest bitrate
      selectedFormat = audioFormats.find((f: any) => (f.averageBitrate || f.bitrate || 0) <= targetBitrate) || audioFormats[0];
    } else {
      // Find video formats with audio (combined) first
      const combinedFormats = formats
        .filter((f: any) => f.mimeType?.startsWith('video/') && f.url && f.audioQuality)
        .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

      const targetHeight = qualityMap[quality] || 1080;

      // Find best match at or below target quality
      selectedFormat = combinedFormats.find((f: any) => (f.height || 0) <= targetHeight) || combinedFormats[0];

      // If no combined format, try adaptive video
      if (!selectedFormat) {
        const videoFormats = formats
          .filter((f: any) => f.mimeType?.startsWith('video/') && f.url)
          .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

        selectedFormat = videoFormats.find((f: any) => (f.height || 0) <= targetHeight) || videoFormats[0];
      }
    }

    if (!selectedFormat || !selectedFormat.url) {
      // Fallback: return any available format with a URL
      const anyFormat = formats.find((f: any) => f.url);
      if (!anyFormat) {
        return new Response(
          JSON.stringify({
            status: 'error',
            error: 'Nenhum formato de download disponível. O vídeo pode ter restrições.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      selectedFormat = anyFormat;
    }

    const title = playerResponse?.videoDetails?.title || 'download';
    const ext = isAudio ? 'mp3' : 'mp4';
    const filename = `${title.replace(/[^\w\s-]/g, '').trim()}.${ext}`;

    console.log(`Selected format: ${selectedFormat.mimeType}, quality: ${selectedFormat.qualityLabel || selectedFormat.audioQuality}, url length: ${selectedFormat.url?.length}`);

    return new Response(
      JSON.stringify({
        status: 'success',
        downloadUrl: selectedFormat.url,
        filename,
        quality: selectedFormat.qualityLabel || selectedFormat.audioQuality || 'unknown',
        mimeType: selectedFormat.mimeType,
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

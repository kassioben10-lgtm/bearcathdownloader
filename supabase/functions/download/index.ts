import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COBALT_INSTANCES = [
  'https://api.cobalt.tools',
  'https://cobalt-api.kwiatekmiki.com',
  'https://cobalt.api.timelessnesses.me',
];

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

    // Map quality strings to cobalt API values
    const qualityMap: Record<string, string> = {
      '2160p (4K)': '2160',
      '1080p (Full HD)': '1080',
      '720p (HD)': '720',
      '480p': '480',
      '360p': '360',
    };

    const bitrateMap: Record<string, string> = {
      '320kbps': '320',
      '256kbps': '256',
      '192kbps': '192',
      '128kbps': '128',
    };

    const isAudio = format === 'audio';

    const cobaltBody: Record<string, unknown> = {
      url,
      downloadMode: isAudio ? 'audio' : 'auto',
      filenameStyle: 'pretty',
    };

    if (isAudio) {
      cobaltBody.audioFormat = 'mp3';
      cobaltBody.audioBitrate = bitrateMap[quality] || '128';
    } else {
      cobaltBody.videoQuality = qualityMap[quality] || '1080';
      cobaltBody.youtubeVideoCodec = 'h264';
    }

    let lastError = '';

    for (const instance of COBALT_INSTANCES) {
      try {
        console.log(`Trying cobalt instance: ${instance}`);
        const response = await fetch(instance, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(cobaltBody),
        });

        const data = await response.json();
        console.log(`Response from ${instance}:`, JSON.stringify(data));

        if (data.status === 'tunnel' || data.status === 'redirect') {
          return new Response(
            JSON.stringify({
              status: 'success',
              downloadUrl: data.url,
              filename: data.filename || 'download',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (data.status === 'picker' && data.picker?.length > 0) {
          return new Response(
            JSON.stringify({
              status: 'success',
              downloadUrl: data.picker[0].url,
              filename: 'download',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (data.status === 'error') {
          lastError = data.error?.code || 'unknown error';
          console.error(`Cobalt error from ${instance}:`, data.error);
          continue;
        }

        lastError = `Unexpected response status: ${data.status}`;
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'Instance error';
        console.error(`Failed to reach ${instance}:`, lastError);
        continue;
      }
    }

    return new Response(
      JSON.stringify({
        status: 'error',
        error: `Não foi possível processar o download. ${lastError}`,
      }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ status: 'error', error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

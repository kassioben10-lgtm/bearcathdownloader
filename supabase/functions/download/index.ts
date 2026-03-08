import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Public cobalt instances that support YouTube (no API key needed)
const COBALT_INSTANCES = [
  'https://cobalt-api.meowing.de',
  'https://cobalt-backend.canine.tools',
  'https://capi.3kh0.net',
];

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

    const isAudio = format === 'audio';
    const qualityMap: Record<string, string> = {
      '2160p (4K)': '2160', '1080p (Full HD)': '1080', '720p (HD)': '720',
      '480p': '480', '360p': '360',
    };
    const videoQuality = qualityMap[quality] || '1080';

    const audioBitrateMap: Record<string, string> = {
      '320kbps': '320', '256kbps': '256', '192kbps': '192', '128kbps': '128',
    };

    const cobaltBody: Record<string, string> = {
      url,
      videoQuality,
      filenameStyle: 'basic',
    };
    if (isAudio) {
      cobaltBody.downloadMode = 'audio';
      cobaltBody.audioFormat = 'mp3';
      cobaltBody.audioBitrate = audioBitrateMap[quality] || '128';
    } else {
      cobaltBody.downloadMode = 'auto';
    }

    const errors: string[] = [];

    for (const instance of COBALT_INSTANCES) {
      try {
        console.log(`Trying cobalt instance: ${instance}`);

        const cobaltRes = await fetch(`${instance}/`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'BearCatchDownloader/1.0 (+https://bearcathdownloader.lovable.app)',
          },
          body: JSON.stringify(cobaltBody),
        });

        const data = await cobaltRes.json();
        console.log(`${instance} response: ${JSON.stringify(data).substring(0, 300)}`);

        if (data.status === 'error') {
          errors.push(`${instance}: ${data.error?.code || data.text || 'error'}`);
          continue;
        }

        const downloadUrl = data.url;
        if (!downloadUrl) {
          errors.push(`${instance}: no URL returned`);
          continue;
        }

        const filename = data.filename || `download.${isAudio ? 'mp3' : 'mp4'}`;

        if (mode === 'stream') {
          console.log(`Streaming from: ${downloadUrl.substring(0, 80)}...`);
          const fileRes = await fetch(downloadUrl);

          if (!fileRes.ok) {
            errors.push(`${instance}: stream failed ${fileRes.status}`);
            continue;
          }

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
          JSON.stringify({ status: 'success', downloadUrl, filename, quality: videoQuality }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${instance}: ${msg}`);
        console.error(`${instance} error: ${msg}`);
      }
    }

    return new Response(
      JSON.stringify({ status: 'error', error: `Nenhuma instância disponível. ${errors.join('; ')}` }),
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

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

    const cobaltApiKey = Deno.env.get('COBALT_API_KEY');
    const cobaltApiUrl = Deno.env.get('COBALT_API_URL') || 'https://api.cobalt.tools';

    const isAudio = format === 'audio';
    const qualityMap: Record<string, string> = {
      '2160p (4K)': '2160',
      '1080p (Full HD)': '1080',
      '720p (HD)': '720',
      '480p': '480',
      '360p': '360',
    };
    const videoQuality = qualityMap[quality] || '1080';

    const audioBitrateMap: Record<string, string> = {
      '320kbps': '320',
      '256kbps': '256',
      '192kbps': '192',
      '128kbps': '128',
    };
    const audioBitrate = audioBitrateMap[quality] || '128';

    // Build Cobalt API request
    const cobaltBody: Record<string, string> = {
      url,
      videoQuality,
      filenameStyle: 'basic',
    };

    if (isAudio) {
      cobaltBody.downloadMode = 'audio';
      cobaltBody.audioFormat = 'mp3';
      cobaltBody.audioBitrate = audioBitrate;
    } else {
      cobaltBody.downloadMode = 'auto';
    }

    console.log(`Cobalt request: ${JSON.stringify(cobaltBody)}`);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (cobaltApiKey) {
      headers['Authorization'] = `Api-Key ${cobaltApiKey}`;
    }

    const cobaltRes = await fetch(`${cobaltApiUrl}/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(cobaltBody),
    });

    const data = await cobaltRes.json();
    console.log(`Cobalt response status: ${cobaltRes.status}, data: ${JSON.stringify(data).substring(0, 500)}`);

    if (data.status === 'error') {
      throw new Error(data.error?.code || data.text || 'Cobalt API error');
    }

    // Cobalt returns: redirect (direct URL), stream (tunnel URL), or picker
    const downloadUrl = data.url;
    if (!downloadUrl) {
      throw new Error('No download URL returned');
    }

    const filename = data.filename || `download.${isAudio ? 'mp3' : 'mp4'}`;

    if (mode === 'stream') {
      // Proxy the file through this edge function
      console.log(`Streaming from cobalt: ${downloadUrl.substring(0, 100)}...`);
      const fileRes = await fetch(downloadUrl);

      if (!fileRes.ok) {
        throw new Error(`Failed to fetch file: ${fileRes.status}`);
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

    // Default: return URL
    return new Response(
      JSON.stringify({ status: 'success', downloadUrl, filename, quality: videoQuality }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ status: 'error', error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

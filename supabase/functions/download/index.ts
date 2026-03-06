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

    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (!rapidApiKey) {
      return new Response(
        JSON.stringify({ status: 'error', error: 'RAPIDAPI_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing: ${url}, format: ${format}, quality: ${quality}`);

    const isAudio = format === 'audio';

    // Call RapidAPI YouTube Video Download API
    const apiUrl = `https://youtube-video-download-api1.p.rapidapi.com/?url=${encodeURIComponent(url)}`;
    
    const res = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'youtube-video-download-api1.p.rapidapi.com',
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`RapidAPI error: ${res.status} - ${errorText.substring(0, 200)}`);
      throw new Error(`API retornou erro ${res.status}`);
    }

    const data = await res.json();
    console.log(`API response keys: ${Object.keys(data).join(', ')}`);

    if (isAudio) {
      // Look for audio format
      const audioUrl = data.audio?.url || data.mp3?.url;
      if (audioUrl) {
        return new Response(
          JSON.stringify({
            status: 'success',
            downloadUrl: audioUrl,
            filename: `${data.title || 'download'}.mp3`,
            quality: 'audio',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Map quality to preferred resolution
    const qualityMap: Record<string, number> = {
      '2160p (4K)': 2160,
      '1080p (Full HD)': 1080,
      '720p (HD)': 720,
      '480p': 480,
      '360p': 360,
    };
    const targetRes = qualityMap[quality] || 1080;

    // Try to find video download URL from various response formats
    let downloadUrl = '';
    let selectedQuality = '';

    // Format 1: links object with quality keys
    if (data.links) {
      const links = Object.entries(data.links) as [string, any][];
      // Sort by closest to target quality
      const sorted = links
        .filter(([_, v]: [string, any]) => v?.url)
        .sort(([a]: [string, any], [b]: [string, any]) => {
          const aRes = parseInt(a) || 0;
          const bRes = parseInt(b) || 0;
          return Math.abs(aRes - targetRes) - Math.abs(bRes - targetRes);
        });
      if (sorted.length > 0) {
        downloadUrl = (sorted[0][1] as any).url;
        selectedQuality = sorted[0][0];
      }
    }

    // Format 2: formats array
    if (!downloadUrl && data.formats) {
      const formats = (data.formats as any[])
        .filter((f: any) => f.url && f.mimeType?.includes('video'))
        .sort((a: any, b: any) => {
          const aRes = a.height || parseInt(a.qualityLabel) || 0;
          const bRes = b.height || parseInt(b.qualityLabel) || 0;
          return Math.abs(aRes - targetRes) - Math.abs(bRes - targetRes);
        });
      if (formats.length > 0) {
        downloadUrl = formats[0].url;
        selectedQuality = formats[0].qualityLabel || `${formats[0].height}p`;
      }
    }

    // Format 3: direct url field
    if (!downloadUrl && data.url) {
      downloadUrl = data.url;
      selectedQuality = quality;
    }

    // Format 4: mp4 field
    if (!downloadUrl && data.mp4) {
      downloadUrl = typeof data.mp4 === 'string' ? data.mp4 : data.mp4?.url;
      selectedQuality = quality;
    }

    if (!downloadUrl) {
      console.error('No download URL found in response:', JSON.stringify(data).substring(0, 500));
      throw new Error('Não foi possível extrair o link de download');
    }

    return new Response(
      JSON.stringify({
        status: 'success',
        downloadUrl,
        filename: `${data.title || 'download'}.${isAudio ? 'mp3' : 'mp4'}`,
        quality: selectedQuality,
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Fallback list — dynamically fetched list is preferred
const FALLBACK_INSTANCES = [
  'https://cobalt-backend.canine.tools',
  'https://cobalt-api.meowing.de',
  'https://capi.3kh0.net',
  'https://downloadapi.stuff.solutions',
];

async function fetchActiveInstances(): Promise<string[]> {
  try {
    const res = await fetch('https://instances.cobalt.best/api/instances', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const instances = await res.json();
    // Filter: online, has YouTube support (score > 0), prefer no auth
    const urls: string[] = instances
      .filter((i: any) => i.api_online && i.score > 0)
      .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
      .map((i: any) => i.api_url?.replace(/\/$/, ''))
      .filter(Boolean);
    return urls.length > 0 ? urls : FALLBACK_INSTANCES;
  } catch (e) {
    console.log('Failed to fetch instances list, using fallback:', e);
    return FALLBACK_INSTANCES;
  }
}

async function tryCobaltInstance(instance: string, body: Record<string, unknown>, apiKey?: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Api-Key ${apiKey}`;
    }

    const res = await fetch(`${instance}/`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify(body),
    });
    clearTimeout(timeout);

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response: ${text.substring(0, 100)}`);
    }

    // Check for auth errors specifically
    if (data?.error?.code?.includes('auth') || (typeof data?.error === 'string' && data.error.includes('auth'))) {
      throw new Error(data.error?.code || data.error || 'auth required');
    }

    if (!res.ok) {
      throw new Error(data?.error?.code || data?.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
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

    console.log(`Processing: ${url}, format: ${format}, quality: ${quality}`);

    const isAudio = format === 'audio';

    const qualityMap: Record<string, string> = {
      '2160p (4K)': '2160',
      '1080p (Full HD)': '1080',
      '720p (HD)': '720',
      '480p': '480',
      '360p': '360',
    };

    const cobaltBody: Record<string, unknown> = {
      url,
      videoQuality: qualityMap[quality] || '1080',
      youtubeVideoCodec: 'h264',
    };

    if (isAudio) {
      cobaltBody.downloadMode = 'audio';
      cobaltBody.audioFormat = 'mp3';
    }

    // Dynamically fetch active instances
    const instances = await fetchActiveInstances();
    console.log(`Got ${instances.length} instances to try`);

    const errors: string[] = [];
    for (const instance of instances) {
      try {
        console.log(`Trying Cobalt instance: ${instance}`);
        const data = await tryCobaltInstance(instance, cobaltBody);
        console.log(`Cobalt response status: ${data.status}`);

        if (data.status === 'tunnel' || data.status === 'redirect') {
          return new Response(
            JSON.stringify({
              status: 'success',
              downloadUrl: data.url,
              filename: data.filename || `download.${isAudio ? 'mp3' : 'mp4'}`,
              quality: qualityMap[quality] || '1080',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (data.status === 'picker' && data.picker?.length) {
          const item = data.picker[0];
          return new Response(
            JSON.stringify({
              status: 'success',
              downloadUrl: item.url,
              filename: `download.${isAudio ? 'mp3' : 'mp4'}`,
              quality: qualityMap[quality] || '1080',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (data.status === 'error') {
          throw new Error(data.error?.code || data.error || 'cobalt error');
        }

        throw new Error(`Unexpected status: ${data.status}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`Instance ${instance} failed: ${msg}`);
        errors.push(`${instance}: ${msg}`);
      }
    }

    return new Response(
      JSON.stringify({
        status: 'error',
        error: `Nenhuma instância disponível. Erros: ${errors.join('; ')}`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

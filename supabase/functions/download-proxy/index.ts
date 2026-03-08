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
    const { downloadUrl, filename } = await req.json();

    if (!downloadUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing downloadUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Proxying download: ${filename}`);

    // Google video servers require browser-like headers
    const response = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com',
        'Range': 'bytes=0-',
      },
    });

    if (!response.ok && response.status !== 206) {
      console.error(`Upstream error: ${response.status}`);
      throw new Error(`Upstream error: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length') || '';
    const safeName = (filename || 'download.mp4').replace(/[^\w.\-()（）\s]/g, '_');

    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${safeName}"`,
    };
    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength;
    }

    return new Response(response.body, { headers: responseHeaders });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Proxy error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

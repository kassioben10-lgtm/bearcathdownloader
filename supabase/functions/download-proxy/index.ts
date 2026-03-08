import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { downloadUrl, filename } = await req.json();

    if (!downloadUrl) {
      return new Response('Missing downloadUrl', { status: 400, headers: corsHeaders });
    }

    console.log(`Proxying download: ${filename}`);

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Upstream error: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const safeName = (filename || 'download.mp4').replace(/[^\w.-]/g, '_');

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeName}"`,
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Proxy error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

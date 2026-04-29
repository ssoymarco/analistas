// Analistas Proxy Worker
// Sits between the app and SportMonks API.
// The API token never leaves this Worker — it's stored as a Cloudflare secret.

export interface Env {
  SPORTMONKS_TOKEN: string;
  // Optional: restrict to specific origins (e.g. your Expo app or website)
  ALLOWED_ORIGIN?: string;
}

const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return corsResponse(new Response(null, { status: 204 }), env);
    }

    // ── Only allow GET ──────────────────────────────────────────────────────
    if (request.method !== 'GET') {
      return corsResponse(
        new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        }),
        env,
      );
    }

    const url = new URL(request.url);

    // ── Route: /football/<endpoint>?<params> ────────────────────────────────
    // Strip the /football prefix — the Worker is mounted at /football/*
    const pathAfterFootball = url.pathname.replace(/^\/football/, '') || '/';

    // Build the upstream URL, injecting the secret token
    const upstream = new URL(`${SPORTMONKS_BASE}${pathAfterFootball}`);

    // Forward all original query params (includes, filters, etc.)
    url.searchParams.forEach((value, key) => {
      // Block any attempt to override the token from the client
      if (key !== 'api_token') {
        upstream.searchParams.set(key, value);
      }
    });

    // Inject the secret token
    upstream.searchParams.set('api_token', env.SPORTMONKS_TOKEN);

    // ── Proxy the request ───────────────────────────────────────────────────
    let smResponse: Response;
    try {
      smResponse = await fetch(upstream.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Analistas/1.0',
        },
        // @ts-ignore — CF-specific: don't cache at edge (we cache in-app)
        cf: { cacheEverything: false },
      });
    } catch (err) {
      return corsResponse(
        new Response(JSON.stringify({ error: 'Upstream fetch failed', detail: String(err) }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }),
        env,
      );
    }

    // Forward SportMonks response as-is, just adding CORS headers
    const body = await smResponse.arrayBuffer();
    const proxied = new Response(body, {
      status: smResponse.status,
      headers: {
        'Content-Type': smResponse.headers.get('Content-Type') ?? 'application/json',
        'X-RateLimit-Limit': smResponse.headers.get('X-RateLimit-Limit') ?? '',
        'X-RateLimit-Remaining': smResponse.headers.get('X-RateLimit-Remaining') ?? '',
      },
    });

    return corsResponse(proxied, env);
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function allowedOrigin(env: Env): string {
  // In production you can lock this down to your domain.
  // For Expo Go / dev builds, wildcard is fine since the token stays server-side.
  return env.ALLOWED_ORIGIN ?? '*';
}

function corsResponse(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowedOrigin(env));
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

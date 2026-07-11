export function parseAllowedOrigins(value: string) {
  const origins = value.split(",").map(origin => origin.trim()).filter(Boolean);
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (!/^https?:$/.test(url.protocol) || url.origin !== origin) throw new Error();
    } catch {
      throw new Error(`Invalid TV_ALLOWED_ORIGINS entry: ${origin}`);
    }
  }
  if (!origins.length) throw new Error("TV_ALLOWED_ORIGINS must contain at least one origin");
  return new Set(origins);
}

export function requestOriginAllowed(request: Request, allowedOrigins: ReadonlySet<string>, allowOriginless = true) {
  const origin = request.headers.get("Origin");
  return origin ? allowedOrigins.has(origin) : allowOriginless;
}

export function corsHeaders(request: Request, allowedOrigins: ReadonlySet<string>, maxAgeSec = 300) {
  const headers = new Headers({
    "Cache-Control": `public, max-age=${maxAgeSec}`,
    "Vary": "Origin"
  });
  const origin = request.headers.get("Origin");
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export function preflightResponse(request: Request, allowedOrigins: ReadonlySet<string>) {
  if (!requestOriginAllowed(request, allowedOrigins)) return Response.json({ error: "origin not allowed" }, { status: 403 });
  const headers = corsHeaders(request, allowedOrigins, 0);
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { status: 204, headers });
}

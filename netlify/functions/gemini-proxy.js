/**
 * Server-side proxy for the Google Gemini API.
 *
 * ENVIRONMENT VARIABLE REQUIRED:
 *   GEMINI_API_KEY — set in Netlify → Site settings → Environment variables.
 *
 * SUPPORTED MODELS (pass in request body as "model"):
 *   gemini-2.0-flash   — fast, free tier (default)
 *   gemini-2.5-pro     — highest capability
 *
 * REQUEST (POST /api/gemini):
 *   Body: { model?, contents, generationConfig?, systemInstruction?, tools? }
 *   Query: ?stream=true  — enables SSE streaming via streamGenerateContent
 *
 * RESPONSE:
 *   Non-streaming: { candidates, usageMetadata, ... }  (JSON)
 *   Streaming:     SSE stream, each line: data: { candidates: [...] }
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export default async function handler(req, _context) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY not configured in Netlify environment variables." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const wantStream = url.searchParams.get("stream") === "true";
  const model = body.model || "gemini-2.0-flash";
  const { model: _m, ...forwardBody } = body;

  const endpoint = wantStream ? "streamGenerateContent" : "generateContent";
  const geminiUrl = wantStream
    ? `${GEMINI_BASE}/${model}:${endpoint}?alt=sse&key=${apiKey}`
    : `${GEMINI_BASE}/${model}:${endpoint}?key=${apiKey}`;

  try {
    const upstream = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forwardBody),
      signal: AbortSignal.timeout(60000), // chart analysis can take time
    });

    if (wantStream) {
      // Pass the SSE stream straight through to the browser
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no", // disable proxy buffering on Netlify Edge
        },
      });
    }

    const data = await upstream.json();
    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Gemini API request failed", detail: err.message }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Server-side proxy for the Google Gemini API.
 *
 * WHY THIS EXISTS:
 * Browsers cannot call https://generativelanguage.googleapis.com directly
 * without exposing the API key in client code. This function runs server-side,
 * injects GEMINI_API_KEY from Netlify environment variables, and proxies
 * requests through to the Gemini API.
 *
 * ENVIRONMENT VARIABLE REQUIRED:
 *   GEMINI_API_KEY — set in Netlify → Site settings → Environment variables.
 *
 * SUPPORTED MODELS (pass in request body as "model"):
 *   gemini-2.0-flash          — fast, low cost (default if omitted)
 *   gemini-2.5-pro             — highest capability
 *
 * REQUEST (POST /api/gemini):
 *   { model?, contents, generationConfig?, systemInstruction? }
 *   — "contents" follows the Gemini generateContent schema.
 *
 * RESPONSE:
 *   Pass-through from Gemini API — { candidates, usageMetadata, ... }
 *
 * USAGE FROM CLIENT:
 *   const res = await fetch('/api/gemini', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       model: 'gemini-2.0-flash',
 *       contents: [{ role: 'user', parts: [{ text: 'Your prompt' }] }]
 *     })
 *   });
 *   const data = await res.json();
 *   const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
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

  const model = body.model || "gemini-2.0-flash";
  // Strip the model field before forwarding — it goes in the URL, not the body
  const { model: _m, ...forwardBody } = body;

  const geminiUrl = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;

  try {
    const upstream = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forwardBody),
      signal: AbortSignal.timeout(30000),
    });

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

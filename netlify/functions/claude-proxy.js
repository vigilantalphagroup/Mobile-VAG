/**
 * Netlify serverless proxy for the Anthropic Claude API.
 *
 * WHY THIS EXISTS:
 * Browsers block direct calls to https://api.anthropic.com from a
 * frontend origin (CORS). The Anthropic API also requires an API key
 * that cannot safely live in client-side code (anyone can read it in
 * devtools). This function runs server-side on Netlify, receives the
 * request body from the browser, injects the API key from a Netlify
 * environment variable, calls Anthropic, and streams the response back.
 *
 * ENVIRONMENT VARIABLE REQUIRED:
 * Set ANTHROPIC_API_KEY in Netlify → Site settings → Environment variables.
 * The key never appears in any file committed to the repository.
 *
 * SUPPORTED CALL PATTERNS:
 * 1. Ping check (tiny non-streaming POST) — used for API availability check
 * 2. Streaming SSE (stream: true) — used for Roll the Tape and chart analysis
 * 3. Tool-use multi-turn (stream: false) — used for web-search-augmented calls
 *
 * The frontend app calls this function at /api/claude instead of calling
 * https://api.anthropic.com/v1/messages directly. The request body and
 * response are pass-through — no schema changes needed in the app.
 */

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export default async function handler(req, context) {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Retrieve API key from environment (set in Netlify dashboard, never in code)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY environment variable not set. Configure it in Netlify → Site settings → Environment variables." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Parse request body from the browser
  let body;
  try {
    body = await req.json();
  } catch (_) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isStreaming = body.stream === true;

  // Forward the request to Anthropic, injecting the API key server-side
  let anthropicRes;
  try {
    anthropicRes = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Failed to reach Anthropic API: ${err.message}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  if (isStreaming) {
    // Stream SSE response back to the browser as-is.
    // The browser's existing SSE reader in callClaude() reads "data: {...}" lines
    // exactly as Anthropic sends them — this proxy is fully transparent.
    return new Response(anthropicRes.body, {
      status: anthropicRes.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        // CORS header — allows your Netlify frontend origin to read the stream
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Non-streaming: return JSON response as-is
  const data = await anthropicRes.json();
  return new Response(JSON.stringify(data), {
    status: anthropicRes.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Required for Netlify Functions v2 — declares this as an edge/background function
export const config = {
  path: "/api/claude",
};

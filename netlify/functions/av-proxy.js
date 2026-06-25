/**
 * Server-side proxy for the Alpha Vantage API.
 *
 * ENVIRONMENT VARIABLE REQUIRED:
 *   ALPHA_VANTAGE_KEY — set in Netlify → Site settings → Environment variables.
 *   (Also accepted as AV_API_KEY for backwards compatibility.)
 *
 * SUPPORTED AV FUNCTIONS (pass in request body as "function"):
 *   GLOBAL_QUOTE               — real-time quote (price, change%, open, prev close)
 *   TIME_SERIES_DAILY_ADJUSTED — daily OHLCV + splits/dividends
 *   TIME_SERIES_WEEKLY_ADJUSTED— weekly OHLCV (Alpha Cannon weekly bias)
 *   TIME_SERIES_INTRADAY       — intraday OHLCV (interval: 1min/5min/15min/30min/60min)
 *   RSI                        — RSI indicator
 *   ATR                        — ATR indicator
 *   BBANDS                     — Bollinger Bands
 *   ADX                        — Average Directional Index
 *   MACD                       — MACD indicator
 *   NEWS_SENTIMENT             — news + sentiment (tickers param supported)
 *   TOP_GAINERS_LOSERS         — session leadership / rotation context
 *   EARNINGS_CALENDAR          — upcoming earnings (horizon param: 3month/6month/12month)
 *   FEDERAL_FUNDS_RATE         — Fed funds rate history
 *   TREASURY_YIELD             — Treasury yield (maturity: 3month/2year/5year/7year/10year/30year)
 *   REALTIME_OPTIONS           — real-time options chain (symbol required)
 *
 * REQUEST (POST /api/av):
 *   Body: { function: "GLOBAL_QUOTE", symbol: "AAPL", ...other AV params }
 *
 * RESPONSE:
 *   Pass-through of Alpha Vantage JSON response.
 *   On error: { error: "...", detail: "..." }
 */

const AV_BASE = "https://www.alphavantage.co/query";

// AV functions that do NOT require a symbol parameter
const NO_SYMBOL_FUNCTIONS = new Set([
  "TOP_GAINERS_LOSERS",
  "EARNINGS_CALENDAR",
  "FEDERAL_FUNDS_RATE",
  "TREASURY_YIELD",
  "MARKET_STATUS",
]);

export default async function handler(req, _context) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.ALPHA_VANTAGE_KEY || process.env.AV_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ALPHA_VANTAGE_KEY not configured in Netlify environment variables." }),
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

  const { function: avFunction, ...params } = body;

  if (!avFunction) {
    return new Response(JSON.stringify({ error: "Missing required field: function" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!params.symbol && !NO_SYMBOL_FUNCTIONS.has(avFunction)) {
    return new Response(JSON.stringify({ error: `Missing required field: symbol (required for ${avFunction})` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Build AV query string from body params
  const qs = new URLSearchParams({ function: avFunction, apikey: apiKey });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  // Default datatype to json unless caller specified csv
  if (!qs.has("datatype")) qs.set("datatype", "json");

  const avUrl = `${AV_BASE}?${qs.toString()}`;

  try {
    const upstream = await fetch(avUrl, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
    });

    const data = await upstream.json();

    // Alpha Vantage returns 200 even for errors — normalize them
    if (data?.["Error Message"]) {
      return new Response(
        JSON.stringify({ error: "Alpha Vantage error", detail: data["Error Message"] }),
        { status: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }
    if (data?.["Note"]) {
      // Rate limit note — pass through so caller can back off
      return new Response(
        JSON.stringify({ error: "Alpha Vantage rate limit", detail: data["Note"], rateLimit: true }),
        { status: 429, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }
    if (data?.["Information"]) {
      return new Response(
        JSON.stringify({ error: "Alpha Vantage info", detail: data["Information"], rateLimit: true }),
        { status: 429, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }

    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Alpha Vantage request failed", detail: err.message }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

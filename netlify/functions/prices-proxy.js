/**
 * Server-side price fetcher for the V.A.G. co-pilot.
 *
 * WHY THIS EXISTS:
 * Browser calls to Yahoo Finance fail via CORS when allorigins.win is blocked.
 * Running the fetch server-side avoids CORS entirely. Alpha Vantage (which
 * requires a secret API key) is wired as a secondary fallback.
 *
 * ENVIRONMENT VARIABLES:
 *   ALPHA_VANTAGE_KEY — set in Netlify → Site settings → Environment variables.
 *   GEMINI_API_KEY    — reserved for future use (already in your Netlify env).
 *
 * REQUEST:
 *   GET /api/prices?symbols=AAPL,MSFT,ES=F,...
 *
 * RESPONSE:
 *   { quotes: [{ symbol, price, pct, pctOpen, source }] }
 *
 * FLOW:
 *   1. Try Yahoo Finance directly (no key, no CORS server-side) for the whole batch.
 *   2. If Yahoo returns no data, fall back to Alpha Vantage GLOBAL_QUOTE per symbol
 *      (rate-limited to 5 calls/min on free tier — capped at 5 symbols per request).
 */

export default async function handler(req, _context) {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "GET only" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const raw = url.searchParams.get("symbols") || "";
  const symList = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);

  if (!symList.length) {
    return new Response(JSON.stringify({ quotes: [] }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const quotes = [];

  // ── 1. Yahoo Finance (server-side, no CORS) ───────────────────────────────
  try {
    const yahooUrl =
      `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symList.join("%2C")}&range=1d&interval=1d`;
    const res = await fetch(yahooUrl, { signal: AbortSignal.timeout(7000) });
    if (res.ok) {
      const data = await res.json();
      const results = data?.spark?.result || [];
      for (const r of results) {
        const raw = r?.symbol;
        if (!raw) continue;
        const resp    = r?.response?.[0];
        const closes  = resp?.indicators?.quote?.[0]?.close || [];
        const meta    = resp?.meta || {};
        if (!closes.length) continue;
        const price   = Number((meta.regularMarketPrice || closes[closes.length - 1]).toFixed(2));
        const prev    = meta.chartPreviousClose || meta.previousClose || closes[closes.length - 2];
        const pct     = prev ? Number(((price - prev) / prev * 100).toFixed(2)) : 0;
        const open    = meta.regularMarketOpen || meta.chartPreviousClose || price;
        const pctOpen = open ? Number(((price - open) / open * 100).toFixed(2)) : 0;
        quotes.push({ symbol: raw.toUpperCase(), price, pct, pctOpen, source: "yahoo" });
      }
    }
  } catch (_) { /* Yahoo unavailable — fall through to Alpha Vantage */ }

  if (quotes.length > 0) {
    return new Response(JSON.stringify({ quotes }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  // ── 2. Alpha Vantage fallback (requires ALPHA_VANTAGE_KEY) ───────────────
  const avKey = process.env.ALPHA_VANTAGE_KEY || process.env.AV_API_KEY;
  if (avKey) {
    // Free tier: 5 calls/min, 25/day. Cap at 5 symbols to stay safe.
    const avSymbols = symList.filter((s) => !s.includes("=")).slice(0, 5);
    await Promise.allSettled(
      avSymbols.map(async (sym) => {
        try {
          const avUrl =
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${sym}&apikey=${avKey}`;
          const res = await fetch(avUrl, { signal: AbortSignal.timeout(6000) });
          if (!res.ok) return;
          const data = await res.json();
          const q = data["Global Quote"];
          if (!q?.["05. price"]) return;
          const price   = Number(parseFloat(q["05. price"]).toFixed(2));
          const prev    = parseFloat(q["08. previous close"] || "0");
          const open    = parseFloat(q["02. open"] || String(price));
          const pct     = prev ? Number(((price - prev) / prev * 100).toFixed(2)) : 0;
          const pctOpen = open ? Number(((price - open) / open * 100).toFixed(2)) : 0;
          quotes.push({ symbol: sym.toUpperCase(), price, pct, pctOpen, source: "alphavantage" });
        } catch (_) {}
      })
    );
  }

  return new Response(JSON.stringify({ quotes }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

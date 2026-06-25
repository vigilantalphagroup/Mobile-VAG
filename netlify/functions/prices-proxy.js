/**
 * Server-side price fetcher for the V.A.G. co-pilot.
 *
 * ENVIRONMENT VARIABLES:
 *   ALPHA_VANTAGE_KEY — set in Netlify → Site settings → Environment variables.
 *
 * REQUEST:
 *   GET /api/prices?symbols=AAPL,MSFT,ES=F,...
 *
 * RESPONSE:
 *   { quotes: [{ symbol, price, pct, pctOpen, source }] }
 *
 * FLOW:
 *   1. Alpha Vantage GLOBAL_QUOTE — primary for equity symbols (no "=" or "/" prefix).
 *      Free tier: 25 req/day, 5 req/min — capped at 5 equity symbols per request.
 *   2. Yahoo Finance — fallback for futures (ES=F, /NQ etc.) and any equities AV missed.
 *      No key required; runs server-side so no CORS issues.
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
  const fetched = new Set(); // track which symbols already have a quote

  // ── 1. Alpha Vantage (primary — equities only, no futures) ───────────────
  const avKey = process.env.ALPHA_VANTAGE_KEY || process.env.AV_API_KEY;
  if (avKey) {
    // AV doesn't support futures (/NQ, ES=F) — skip those
    const avSymbols = symList
      .filter((s) => !s.startsWith("/") && !s.includes("="))
      .slice(0, 5); // free tier: 5 req/min, 25/day

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
          fetched.add(sym.toUpperCase());
        } catch (_) {}
      })
    );
  }

  // ── 2. Yahoo Finance fallback — futures + any equities AV missed ─────────
  const needYahoo = symList.filter((s) => !fetched.has(s.toUpperCase()));
  if (needYahoo.length) {
    try {
      const yahooUrl =
        `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${needYahoo.join("%2C")}&range=1d&interval=1d`;
      const res = await fetch(yahooUrl, { signal: AbortSignal.timeout(7000) });
      if (res.ok) {
        const data = await res.json();
        const results = data?.spark?.result || [];
        for (const r of results) {
          const sym = r?.symbol;
          if (!sym) continue;
          const resp    = r?.response?.[0];
          const closes  = resp?.indicators?.quote?.[0]?.close || [];
          const meta    = resp?.meta || {};
          if (!closes.length) continue;
          const price   = Number((meta.regularMarketPrice || closes[closes.length - 1]).toFixed(2));
          const prev    = meta.chartPreviousClose || meta.previousClose || closes[closes.length - 2];
          const pct     = prev ? Number(((price - prev) / prev * 100).toFixed(2)) : 0;
          const open    = meta.regularMarketOpen || meta.chartPreviousClose || price;
          const pctOpen = open ? Number(((price - open) / open * 100).toFixed(2)) : 0;
          quotes.push({ symbol: sym.toUpperCase(), price, pct, pctOpen, source: "yahoo" });
        }
      }
    } catch (_) { /* Yahoo unavailable */ }
  }

  return new Response(JSON.stringify({ quotes }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

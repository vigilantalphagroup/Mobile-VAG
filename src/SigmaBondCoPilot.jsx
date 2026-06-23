import React, { useState, useMemo, useEffect, useRef } from "react";

/* ---------- ErrorBoundary ----------
   Contains crashes from malformed CSV rows or grading edge cases to the
   board/desk region only — the header, data bar, and tape/chart panels stay
   usable so the trader can reload a clean watchlist mid-session instead of
   the whole app going blank. */
class BoardErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Sigma Bond board error:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={S.boardErrorWrap}>
          <AlertTriangle size={18} color={COL.bear} />
          <div style={S.boardErrorTitle}>Board render error</div>
          <div style={S.boardErrorMsg}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <div style={S.boardErrorHint}>
            This usually means a watchlist CSV had an unexpected format. Try reloading
            a known-good V.A.G. export, or use ↺ Reload to restore the last saved desk.
          </div>
          <button style={S.btnGhost} onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import Papa from "papaparse";
import {
  Upload, Crosshair, Flag, ShieldCheck, Activity, Layers, Gauge,
  TrendingUp, TrendingDown, Minus, Lock, Unlock, NotebookPen,
  ChevronRight, Ban, RotateCcw, Target, Wind, CircleDot, ClipboardPaste, AlertTriangle,
  Download, FolderOpen
} from "lucide-react";

/* ============================================================
   SIGMA BOND CO-PILOT
   A decision-support cockpit that applies the user's own
   "Sigma Bond Futures Watchlist Data Dictionary" to a
   ThinkOrSwim CSV export. It does not connect to a broker,
   pull live data, or place orders. It grades, ranks, and
   runs the Bebes Kids workflow so the trader focuses on
   execution. Voice: head referee.

   v2026-06-11 update:
   - sniffTier: mixed underlying+options scan dumps (e.g. "D-D2Ux")
     now route to the SCANS tier (options rows / non-ETF symbols),
     never the SPDR sector grid.
   - readSTRSI: parses unsigned "EARLY 8" alongside "EXP -6".
   - volWeekInfo/seasonalityLine: mechanical Volatility Cycle week
     (OPEX-anchored, Juneteenth shifts) + seasonality overlay,
     injected into tape + chart prompts as PROBABILITY OVERLAYS ONLY.
   - rollTape: locked "Field Report" template (Flag on the Play →
     Alpha Cannon → Field Position → Possession → Defensive Front →
     Vol Cycle → Internals Scorecard → Game State → Playbook →
     Final Whistle) with mandatory self-critique guardrail.
   - analyzeChart: locked 13-step Bebes Kids Trading Copilot chart
     workflow with mandatory output block (Confidence / A+ / Entry /
     Stop / Targets / R:R / One Sentence Read) and explicit
     ACCUMULATING / DISTRIBUTING / WAITING + WAIT-if-no-edge rules.

   v2026-06-11b review upgrades (external code review):
   - RS A+ gates are column-aware: the session %C proxy can no longer
     pass an A+ relative-strength gate — real RS5/RS21 columns required
     (proxy still informs the soft sigma pillar, flagged via haveRS).
   - EM displacement validation: |%Change| ≥ EM% (when EM present)
     mechanically confirms displacement (emBreak).
   - marketRegime(): read-only HTF regime governor (vol via VIX/-V%,
     trend via posture, liquidity via LWC alignment) surfaced in a UI
     strip and injected into every tape/chart context. Deliberately
     does not rescale validated gate math.
   - Rolling Σ-leader history (last 5 snapshots, "sbcp-history"):
     flow-continuity streaks shown as Σ×N badge + FLOW CONTINUITY tape
     context line — multi-snapshot conviction tracking.

   v2026-06-11c (Gemini-suggested UX/robustness pass — triaged):
   - SKIPPED: file-picker "useRef proxy" rewrite — the existing
     label[for]+hidden-input IS the correct mobile-Safari pattern
     (visible, user-initiated click target). No change needed.
   - SKIPPED: localStorage → idb-keyval migration — storage already
     uses window.storage (the platform's async persistent KV store,
     not localStorage); idb-keyval isn't available in this sandbox and
     would be a regression vs. the existing layer.
   - SKIPPED: Sigma memoization — gradeDataset() calls are already
     useMemo'd per tier (gMacro/gSector/gStocks/gScans).
   - ADDED: mobile "Verdict Summary" compact row (Symbol · Σ · Verdict ·
     one-line Referee Call), toggled via header "Σ Summary / Full
     detail" button on narrow screens, persisted in localStorage.
     Tapping a row still opens the full detail pane — compact only
     trims the LIST, never the drill-down.
   - ADDED: BoardErrorBoundary wraps the graded board section so a
     malformed CSV row crashes only that section (with retry), not the
     whole app — header, tape, and chart panels stay usable.
   - ADDED: 30-second client-side throttle on rollTape(); rapid re-rolls
     show "Throttled — wait Ns" instead of firing another live fetch.

   v2026-06-11d (Desktop/Mobile split — Tactical HUD architecture)
   [SUPERSEDED by v2026-06-12g below — mobile is no longer read-only.
   The compact MOBILE TACTICAL HUD layout (compactView, "HUD" tag, one-line
   board rows) still stands; everything else in this entry (desktop-only
   load controls, window.storage auto-sync as the data path, the old
   empty-state copy) was replaced once cross-device window.storage sync
   was confirmed non-functional in the Claude mobile app's artifact
   viewer.]


   v2026-06-11e (vol-context audit — Impl Vol, IV+, -V%, VD%, /VX):
   - Impl Vol (implvol) was normalized by FIELD_MAP but never read into
     gradeRow — completely dormant despite being in every real export.
     Now read, returned, and displayed in Setup tab next to IV+.
   - ivContext(): combines IV+ (1yr percentile) + Impl Vol (raw %) into
     one read — "IV rich/cheap vs 1yr range" + premium buyer/seller
     lean. Context only, never gates or scores (shown with a note
     saying so).
   - Setup tab renamed from "MECCA + MMXMP context" → "participation &
     volatility context" — MECCA/MMXMP are chart-pattern concepts
     (handled in the 13-step Chart Analysis workflow), not CSV columns;
     the old title implied pattern detection this tab doesn't do. Added
     VD% KV row (was computed/scored but not displayed here).
   - Per-symbol vol context now appended to the STOCKS/SCANS/FUTURES
     lines sent to Roll the Tape + Chart Analysis: "[IV30.4% IVP21
     ΔV-9.3 VD+1.2]" — lets the LLM reference a name's specific vol
     posture, not just the aggregate regime.
   - NEW: FUTURES (Alpha Cannon) line added to tape context — the
     20-row macro board was previously reduced to just best-long/
     best-short in MACRO; now the top-8-by-Sigma futures get the same
     per-symbol detail as stocks/scans.
   - marketRegime() now prioritizes /VX(M) VIX FUTURES from the macro
     board (Alpha Cannon layer) over the cash VIX index on the sector
     grid, per house convention. Returns vixSrc ("/VXM" or "VIX") and
     the regime strip + tape REGIME line display the actual source
     ("/VXM 19.5" vs "VIX 19.6").

   v2026-06-11f (auto-roll, weekly calendar, EXT %Chng window, build tag):
   - EXT %Chng is pre-9:30 ET only (isPreMarketET). Setup tab grays the
     row to "EXT %Chng (closed)" outside that window with a note on the
     last pre-market value; the tape/chart per-symbol vol string only
     includes EXTxx% when genuinely pre-market and |value| >= 0.2%.
   - AUTO ROLL THE TAPE: new effect fires rollTape(session) automatically
     when the desk is open during one of the 6 AUTO_TAPE_SLOTS windows (ET).
     Dedup via localStorage per ET-day+session so each device gets one
     fresh auto-read per window; won't fire while a roll is in flight or
     if that session's read is already showing. The existing 30s
     throttle + 5min search cache still apply underneath.
   - WEEKLY ECON CALENDAR: on mount, checks window.storage for a
     calendar cached under the current ISO week (isoWeekKey). If found,
     uses it with zero API calls (shared across devices — desktop
     fetches Monday, mobile reads all week). If missing/stale,
     auto-fetches once and persists. Manual ↻ Refresh still force-fetches.
   - SESSION_LABELS / SESSION_GUIDE / SESSION_WINDOWS (now AUTO_TAPE_SLOTS) hoisted to module
     scope (previously redeclared inside rollTape) so the auto-roll
     effect shares the exact same session definitions as the manual
     button.
   - BUILD_VERSION tag added next to the header clock (small, muted) —
     bump on each ship so you can confirm desktop and mobile are
     rendering the SAME artifact build. There is no separate
     "deployment": both devices must have this exact artifact open for
     storage sync, auto-tape, and the weekly calendar cache to line up.

   v2026-06-12a (A+ gate restructure, EOW Sector Grid, tape continuity,
   Chart Analysis everywhere):
   - A+/A+ SHORT GATE ORDER restructured to house spec: Daily aligned ->
     Weekly aligned -> STRSI (EARLY/EXP, soft) -> RS (soft) -> LWC ->
     WITS -> Con Score -> SMRTx. STRSI and RS are checked and shown
     (tagged "soft" in the call sheet) but never count toward A+/A+
     SHORT — a name can have poor timing or weak RS and still be A+ if
     the other six gates are strong.
   - FAILURE BUDGET on the "core six" (Daily, Weekly, LWC, WITS, Con
     Score, SMRTx): 0 or 1 failures -> A+ as before, exactly 2 -> still
     A+, 3+ -> not A+ (CORE_GATE_IDX / coreFails()). Daily & Weekly sit
     first because timeframe-direction alignment alone carries the
     strongest A+ signal. Con Score gate now also accepts PRIMED (not
     just EXPANDING/IGNITION). Call sheet shows "Core gates: N/6 failed
     (≤2 allowed for A+)" with a within/over-budget ruling.
   - SOFT OPTIONS-REGIME ASSIST (optAdj, never gates): VD% aligned with
     the lean -> +3 to Σ, opposed -> -3; IV+ <= 30 (cheap) -> +2, IV+ >=
     70 (rich) -> -2. Max swing ±5, folded into sigmaFinal. Shown in the
     Setup tab IV note and as an "Options-regime assist" line on the
     call sheet when nonzero.
   - SEAMLESS TAPE CONTINUITY: each Roll-the-Tape now opens with "🔄
     SINCE [prev session] — WHAT CHANGED" (or "FIRST READ" if no prior
     carryforward exists) and closes with a "📋 CARRYFORWARD" block (4-6
     lines: Game State, open scenarios, levels to watch, what next
     session confirms). The carryforward is extracted and persisted to
     window.storage (sbcp-prev-carry, shared across devices, valid <36h)
     and fed into the next roll's prompt — AM -> LUNCH -> PM reads as one
     continuous update instead of three cold reads.
   - CHART ANALYSIS now available on mobile, web, AND desktop (previously
     desktop-only). Upload via file picker is the primary path everywhere
     (same proven pattern as CSV load); Ctrl/Cmd+V paste remains an
     additional desktop-only shortcut.
   - EOW SECTOR GRID ANALYSIS: new framework, active Fri 15:45 ET through
     Sunday (isEOWWindow). In that window, an uploaded image is first
     classified as either a sector/RS grid (-> 8-step EOW framework:
     Sector Grid Read, RS vs $SPX, cross-check desk CSV, Rotation Map,
     Seasonality/Vol-Cycle overlay, Alpha Cannon Carryover, Next-Week
     Watchlist, EOW Sigma Bond Ruling) or a price chart (-> standard
     13-step candle workflow, unchanged). Chart panel shows an "EOW MODE"
     badge during the window. Outside the window, always 13-step.

   v2026-06-12b (auto-tape: 2 snapshots per session):
   - Replaced the single AM/LUNCH/PM auto-fire window with 6 discrete
     AUTO_TAPE_SLOTS (2 per session, each with its own localStorage dedup
     key so a pair sharing a session label still fires independently):
       AM:    08:45-09:30 premarket (am1)  + 09:50-10:10 (am2)
       LUNCH: 11:45-12:05 (lunch1)         + 14:15-14:35 (lunch2)
       PM:    15:30-15:50 (pm1)            + 16:30-16:50 (pm2)
     currentAutoTapeSlot() finds the active slot; each "catch window" is
     ~20min so opening the app shortly after the target time still fires
     that snapshot. The existing 30s throttle + 5min search cache still
     apply underneath.

   v2026-06-12c (mobile sync diagnostics + faster poll):
   - Unified cross-device sync into syncFromStorage(force), shared by the
     mount-retry effect, the background poll, and a new manual "Check now"
     button — "no active session" is no longer a dead end.
   - Background poll interval cut 45s -> 15s; mount retries extended to 5
     attempts with backoff (~10s total) for slower cross-device storage
     propagation.
   - syncStatus now surfaces last-check time + outcome (session found /
     none found / storage error) next to the sync-status line and on the
     empty-state HUD, with a spinning "Check now" button (force=true,
     adopts immediately regardless of timestamps) so a stuck "No active
     session" can be diagnosed/fixed live instead of waiting on the poll.
   - Stale comment fix: Chart Analysis is no longer desktop-only (see
     v2026-06-12a) — mobile-section comments updated accordingly.

   v2026-06-12d (storage shared-param fix + calendar token savings):
   - ROOT CAUSE FIX for "Storage get failed: Unexpected response type":
     the persistent-storage docs say to ALWAYS pass the `shared` param
     explicitly — none of our window.storage.get/set/delete calls did.
     All 10 calls (sbcp-datasets, sbcp-history, sbcp-prev-carry,
     sbcp-calendar) now pass shared=false explicitly. This likely also
     explains why the weekly calendar cache wasn't persisting (silent
     set() failures -> re-fetch every load -> wasted search tokens).
   - syncFromStorage(): a get() failure (incl. "key doesn't exist yet",
     which throws per the docs) is now treated as "nothing saved yet"
     rather than a scary error — the raw message is kept as a muted
     tooltip/hint (rawError) instead of a red "error:" line.
   - ECON CALENDAR now double-cached: localStorage (same-device, instant,
     synchronous, checked first) + window.storage (cross-device). Cached
     per ISO week (Mon-Sun = through this week's EOW) — one web_search per
     week per account instead of one per page load. Manual ↻ Refresh
     rewrites both layers.

   v2026-06-12e (calendar cache-status indicator):
   - EconCalendar now shows a small status line under the header: "cached
     (this device) Xm ago — frozen until next week unless Refreshed" /
     "cached (synced) Xh ago — ..." / "fetched Xm ago — ...". calMeta tracks
     source (local/shared/live) + fetchedAt, set by the weekly auto-fetch
     effect (local/shared cache hit) or fetchCalendar (live fetch).
   - Clarifies the "↻ Refresh" button: it is an explicit force-fetch by
     design (force=true) and is EXPECTED to reload every time it's
     clicked — caching only governs automatic loads on mount/reload, not
     manual refreshes.

   v2026-06-12f (storage self-test diagnostic):
   - The "Storage get failed: Unexpected response type" error persisted
     even after the shared=false fix (v2026-06-12d) — same wording before
     and after — and the screenshot showing it came from the Claude
     MOBILE APP's artifact viewer (file-viewer chrome: X / filename / ⋮),
     a different WebView/bridge than the claude.ai desktop browser.
   - syncFromStorage() now runs a same-device set+get round trip on a
     throwaway key (sbcp-selftest) whenever the main get fails, to tell
     apart "storage works, desktop's session just isn't visible from here
     yet" (selfTest "pass") from "storage doesn't work in this view at
     all" (selfTest "fail*" — a platform limitation, not a retry
     situation). Both the compact sync line and the empty-state card now
     interpret and explain the result in plain language.

   v2026-06-12g (per-device localStorage architecture — sync confirmed
   broken on the Claude mobile app):
   - CONFIRMED: the v2026-06-12f self-test showed window.storage SET also
     fails ("Storage set failed: Unexpected response type") in the Claude
     mobile app's artifact viewer — round-trip fails entirely, both
     directions, not a timing issue. localStorage was confirmed working
     on the same device (econ calendar cache).
   - localStorage ("sbcp-datasets-local") is now the PRIMARY persistence
     for the loaded desk — per device, synchronous, works in every viewer
     tried so far. window.storage remains a best-effort BONUS layer: if
     it happens to work in a given viewer (e.g. claude.ai desktop
     browser), a newer cross-device snapshot is still adopted
     automatically; where it doesn't work, this is silent and harmless.
   - "Load V.A.G. watchlist" / ↺ Reload / Demo are now shown on ALL
     platforms (no more desktop-only gating). Added a "Paste" toggle next
     to them — a textarea + "Load pasted data" button — as a second input
     path alongside the file picker on every device.
   - ↺ Reload now restores from localStorage first (always works), falling
     back to a cross-device syncFromStorage(true) only if this device has
     nothing saved yet.
   - Sync-status line reframed as "cross-device sync" (secondary, all
     platforms): selfTest "pass"/"fail*" explains whether window.storage
     works on THIS device; either way localStorage already has this
     device's data.
   - Unified the empty state across mobile/desktop: "No watchlist loaded
     on this device" with the same load instructions everywhere (was
     previously "load on Desktop to sync Mobile").
   - Mobile compactView/Tactical HUD layout (from v2026-06-11d) is
     unchanged — only the DATA PATH changed, not the display density.

   v2026-06-12h (SSR/publish hardening):
   - The Chrome console on the published artifact (claude.ai/public/
     artifacts/...) showed React error #418 (hydration mismatch) plus a
     blank iframe. Two render-time browser-API/non-determinism issues were
     found and fixed — both invisible in the in-chat/app viewer (client-
     only, no SSR) but fatal/mismatching under SSR:
     1. `useState(() => window.innerWidth)` ran during the initial render.
        On the server `window` is undefined -> ReferenceError -> the SSR
        pass produces nothing for this component. Now guarded with
        `typeof window !== "undefined"`, falling back to 1024 (desktop) on
        the server; the existing resize effect corrects it on mount.
     2. The header clock (`now`/`dateStr`, ticking every second, always
        rendered) used `new Date()` directly in visible text — server-render
        time vs client-hydration time differ by definition, guaranteeing a
        text mismatch. Added a `mounted` flag (set in a mount-only effect,
        the standard SSR-safe pattern); the clock renders "—" until past
        hydration, then shows live time. `now` itself is unchanged
        everywhere else (effects are client-only regardless).
     The iframe-handshake/postMessage origin-mismatch errors seen in the
     same console log (claudeusercontent.com vs claude.ai, window.open
     read-only) are in claude.ai's own bundles, not this file — those
     remain a platform-side publish issue if they persist after this fix.

   v2026-06-12i (snapshot summary + last-tape persistence):
   - New 🎯 SNAPSHOT SUMMARY section, now the FIRST thing in every Field
     Report template (before SINCE/WHAT CHANGED): exactly 4 lines —
     Regime (RISK-ON/OFF/MIXED + vol week + one-clause read), Bias (the
     Sigma Bond A+ ruling or "no edge — stand aside"), Trade Plan (1-2
     sentences of what to do right now), and a "Conditions as of [time]"
     freshness line. Extracted via regex and rendered in a highlighted
     gold-bordered card above the full report text, so a trader glancing
     at the panel gets regime + plan at a glance without reading the whole
     report.
   - LAST-TAPE PERSISTENCE: after every successful roll, the full report is
     saved to localStorage (sbcp-last-tape, primary) and window.storage
     (best-effort cross-device), same pattern as datasets/calendar. On
     mount, the last snapshot is restored automatically and shown with a
     "📌 last snapshot · saved Xm/Xh ago" badge — so stepping away and
     reopening the desk shows the last read instead of a blank panel. A
     fresh roll (manual or auto) overwrites it and clears the badge.
   - Econ calendar persistence was already in place (v2026-06-12d/e,
     "frozen until next week unless Refreshed") — same step-away guarantee,
     no changes needed there.

   v2026-06-12j (chart analysis is ticker-agnostic):
   - BUG FIX: analyzeChart() previously hardcoded `sym = sel?.symbol` (the
     currently-selected board row) and told Claude "analyze this chart for
     ${sym}" — presupposing the uploaded image matched whatever was last
     selected on the board. If you selected MRVL on the board and then
     uploaded an AMZN chart out of curiosity, Claude correctly flagged a
     mismatch and refused to proceed (working as designed, but the premise
     was wrong).
   - Chart Analysis is now fully ticker-agnostic: Step 0 of the 13-step
     workflow has Claude IDENTIFY the symbol from the chart itself (ticker
     label/title/watermark) before doing anything else. The desk-CSV
     cross-check (step 12 / EOW step 3) is conditional on whether THAT
     identified symbol appears in the loaded desk CSV — if it does,
     CONFIRM/CONFLICT as before; if it doesn't, that's stated as a normal
     case and the chart-only read proceeds. The board selection (`sel`) no
     longer influences chart analysis at all.

   v2026-06-12k (Export Desk / Import Desk — one-click cross-surface):
   - exportDesk(): packages all 4 loaded tiers (macro + sector + stocks +
     scans) into a single VAGDesk_YYYY-MM-DD.vagdesk.json file (format tag
     "sbcp-vagdesk-v1") and triggers a browser download. Works in Brave
     desktop/mobile, the published link, anywhere Blob/URL.createObjectURL
     is available (i.e. real browsers — not the Claude app's artifact
     viewer sandboxed fetch, but that's fine since localStorage works
     there instead).
   - importDeskFile(): reads a .vagdesk.json, validates the format tag,
     merges all 4 tiers at once, fires the same localStorage + window.storage
     persistence as a normal CSV ingest, shows a "Desk imported: NM / NS /
     NE / NX" toast. Accepts .json and .vagdesk.json via the file picker.
   - UI: "↓ Export desk" (gold, visible only when data is loaded) +
     "⎁ Import desk" (always visible) added to the data bar button cluster
     between the Paste button and the cross-device sync status line.
   - saveStatus toast now shows the custom msg from importDeskFile (counts
     line) when present, falling back to the existing "✓ saved" copy.

   v2026-06-13a (production overhaul — UX/API/Decision Compression):
   Q5+Q6: localStorage is per-origin/per-browser — each user of the
   published link gets their own isolated instance. Loading a CSV or
   uploading a chart for one user has zero effect on any other user.
   This is guaranteed by the browser's same-origin localStorage policy,
   not by any code-level session management.

   1. UI CLUTTER REMOVED: Clear button (accidental data loss risk),
      Demo, Check Now, and Cross-device sync status UI all removed.
      Load controls and empty-state copy updated accordingly.

   2. API RESILIENCE: callClaude() now probes api.anthropic.com on mount
      (4s timeout CORS check). If the API is unreachable (published
      artifact on claudeusercontent.com / public browser context), sets
      apiAvailable=false. All API-touching features (rollTape,
      fetchCalendar, analyzeChart) check this flag first and show a
      graceful "🔌 OFFLINE / STATIC MODE" message with clear instructions
      instead of throwing a raw API error. Stale cache is served if
      available; Chart Notes mode works fully offline.

   3. DECISION COMPRESSION — three new panels (DecisionModules):
      Alpha Cannon: Weekly Referee Report — bull vs bear leaders from the
        loaded Futures tier (symbol, Σ, WITS), auto-ranked by sigma.
      Alpha Engine: Sector Draft Board — all sectors ranked Long/Short by
        sigma, A+ badges on qualifying names.
      Alpha Fox: Execution Window — IFP + STRSI (EARLY/EXP) + Momo
        continuation scored as a % of the stocks tier; outputs OPEN /
        CAUTION / CLOSED with mini progress bars per trigger and a plain-
        language ruling. Visible only when each tier has data.

   4. REFEREE CARD OUTPUT: Every chart analysis response now ends with a
      structured 🟨 REFEREE CARD (HTF Bias / Field Position / Market
      Structure / Execution: Play On / Wait / No Trade). Extracted via
      regex and rendered in a gold-bordered card below the main analysis.

   5. CHART ANALYSIS: Added 📷 Image / 📝 Notes toggle. Notes mode lets
      the trader paste text (Ticker, HTF Bias, FVG, POI, Setup) and run
      the full 13-step analysis without uploading an image — works in
      offline/public context where image-based API calls may be
      unavailable. Both modes available on all platforms.

   v2026-06-13b (Discord "Captain Hook" webhook integration):
   - postDiscord() module helper fires fire-and-forget POSTs to a Discord
     webhook (no auth header, CORS-open). Default channel baked in;
     localStorage override ("sbcp-discord-hook") lets the trader repoint it
     without editing code. Fails silently where blocked (Claude app viewer)
     so it never throws into the UI; works from real browsers (Brave
     desktop/mobile, published link). Session-scoped dedup set prevents
     duplicate alerts.
   - FOUR ALERT EVENTS (all gated on the discordOn toggle):
     1. Roll the Tape completes → posts the 🎯 Snapshot Summary (regime +
        bias + trade plan). Dedup per ET-day+session.
     2. A+ setups present on a desk load → posts ranked A+ list (symbol,
        verdict, Σ, WITS). Dedup on the sorted A+ symbol-set.
     3. Alpha Fox Execution Window flips to OPEN → posts IFP/STRSI/MOMO
        trigger counts. Fires only on the →OPEN transition (prevFoxRef),
        re-armable every 30 min.
     4. Chart analysis completes → posts the 🟨 Referee Card, or the EOW
        Sector Grid ruling when in EOW mode. Dedup on result hash.
   - HEADER: "🪝 Hook ON/OFF" button opens a settings panel — toggle
     notifications, send a test ping, and paste a webhook override. Toggle
     state persisted to localStorage per device.

   v2026-06-13c (Alpha Fox IFP fix, Sector Draft Board removed, webhook
   override moved to backend-only):
   1. IFP (Inflection Point 15m) BUG FIX: r.ifp is {dir, trig, label},
      not a number. The old check `r.ifp > 0` was always false (comparing
      an object numerically). Fixed to `r.ifp?.dir !== 0` — "active" means
      the 15m pulse has a directional signal. Both bullish (dir=1) and
      bearish (dir=-1) inflections count toward the Fox confluence score,
      since Fox measures overall market activity, not just the long side.
      Now reads correctly from the parsed IFP column in the TOS CSV.
   2. Sector Draft Board removed from DecisionModules — it duplicated the
      Top-Down Desk / Drill the Funnel section below it. DecisionModules
      now has Alpha Cannon (Weekly Referee Report) + Alpha Fox
      (Execution Window) only. Unused sectorLongs/sectorShorts variables
      cleaned up.
   3. Webhook override input removed from the public Discord panel. The
      Captain Hook URL is baked in as the default; a localStorage override
      ("sbcp-discord-hook") is still supported for backend/power use but
      is no longer exposed in the UI. Public panel now shows: toggle ON/OFF
      + Send test ping + alert list only.

   v2026-06-13d (live prices + Netlify scaffold):
   - LIVE PRICE LAYER: fetchLivePrices() fetches Yahoo Finance via the
     allorigins.win CORS proxy (works from any browser without a backend).
     PRICE_CACHE stores { price, pct, pctOpen, ts } per symbol with a
     60s TTL. priceTs state tick re-runs price-dependent memos on refresh.
   - overlayPrices(): layered onto each graded tier via gMacroLive/
     gSectorLive/gStocksLive/gScansLive useMemos. CSV mark/pct are
     overwritten with the live value; pctOpen (% from session open) added.
   - BoardRow: live price dot (green=fresh/amber=stale/gray=none) +
     formatted mark price (4dp for futures/crypto, 2dp for equities) +
     "frm open" % change alongside the regular % change. All graded rows
     show live prices; price-only rows show "grades pending CSV".
   - priceOnlyRows: when no CSV is loaded, a live board of up to 30
     V.A.G. tickers sorted by |%change| shows immediately — users always
     have something to look at, even between your CSV uploads.
   - Header build tag shows "● prices Xs ago" / "⟳ prices…" freshness.
     Manual "● prices Xs" refresh button added to the data bar.
   - NETLIFY SCAFFOLD (vag-desk/): complete deployable project structure:
       netlify/functions/claude.js — Anthropic API proxy (key server-side)
       netlify/functions/prices.js — Yahoo Finance server-side (no CORS)
       netlify/functions/desk.js   — Supabase CRUD (read-only for users,
                                     admin-gated write for CSV uploads)
       src/AdminPanel.jsx          — password-gated admin CSV upload UI
       src/App.jsx                 — router (/ → desk, /admin → admin)
       supabase_schema.sql         — run once to create vag_desk table
       README.md                   — exact step-by-step setup guide
   - On Netlify: callClaude() routes to /api/claude (proxy, not direct);
     fetchLivePrices() routes to /api/prices (server-side, not allorigins).
     Activated by VITE_NETLIFY=true env var. See README for wiring.

   v2026-06-13e (decisive output — Trade Card + clean Discord posts):
   1. TAPE: Snapshot Summary tightened to a strict 5-line format with hard
      labels (Regime / Bias / Plan / Watch / Updated). New CALL TO ACTION
      block appended to Final Whistle (EXECUTE / SIZE / NEXT TRIGGER).
      Discord tape post now parses each labeled line and formats into clean
      Discord MD (📡 Regime, 🟢/🔴/⚪ Bias, 🎯 Plan, 👀 Watch, + CTA block).
   2. CHART: Restructured from a 13-step numbered workflow (wall of text) to
      Trade Card-first output. The 🃏 SIGMA BOND TRADE CARD is now the
      primary output (symbol, HTF Bias, A+, Entry Zone, Stop, Targets, Size,
      One Sentence Read). Supporting analysis (8 sections, max 2 sentences
      each) follows as context. Referee Card appended as a structural summary.
      System prompt upgraded: "trader must never need to copy-paste your
      output into another tool to get a trade decision."
   3. UI: Trade Card renders in a green-gradient bordered card at the top of
      the chart analysis panel. Supporting analysis below it. Referee Card
      at the bottom. Order: most actionable → most detailed.
   4. Discord chart post: posts the full Trade Card (not just Referee Card) —
      color-coded execution status (🟢 PLAY ON / 🟡 WAIT / 🔴 NO TRADE),
      entry/stop/targets/size, and the One Sentence Read. Trade Card is the
      Discord message; Referee Card is the fallback if no Trade Card present.

   v2026-06-13f (UX cleanup — admin-managed desk, rich board rows):
   1. Hook ON/OFF: now a status display only (span, not a button) — no
      settings panel toggle on click. The Discord notifications panel was
      already the correct admin tool; this makes the header read-only.
   2. Prices: header price timer removed (was showing duplicate "Xs ago"
      next to the same info in the data bar). Price auto-refresh interval
      changed from 60s to 15 minutes — appropriate for a trading desk
      that reloads every session vs a live ticker feed. The data bar now
      shows a single animated dot (green=live/amber=loading) with no
      timer text — clean and unambiguous.
   3. Data bar: Load V.A.G. watchlist, Reload (↺), Paste, Export desk,
      Import desk all removed from the public-facing UI. The desk is
      admin-managed via the backend; end users have no upload controls.
      Data bar now contains only the price-status dot.
   4. Chart analysis Discord post removed — Roll the Tape is the only
      event that posts to the Captain Hook webhook.
   5. Empty state updated for public users: no longer instructs them to
      load CSVs (which they can't do). Now reads "Watchlist updating…
      Live prices streaming… grades appear when admin publishes."
   6. Board row detail restored — second row now shows inline:
      IFP (when active, bull/bear colored), Con Score state (when not
      STABLE), RS percentile (bull/bear colored at >60/<40), LWC value,
      volume (compact), SMRTx (when ≥65 or ≤35). This restores the
      "Top 5" information density from the earlier builds while keeping
      the two-row layout clean on both desktop and mobile.

   v2026-06-13g (VAG logo + strat patterns + speed improvements):
   1. VAG LOGO: Already present in earlier builds via VAG_LOGO_SRC const
      (golden elephant medallion from project knowledge). Confirmed rendering
      in header top-left alongside "VIGILANT ALPHA GROUP" brand + clock.
   2. #THESTRAT PATTERNS: 3920.jpg encoded as STRAT_PATTERNS_B64 (~125KB
      base64). Injected into every chart analysis call as a second image
      alongside the trader's chart. Claude can now cross-reference candle
      formations against In-Force (2-1-2, 3-1-2, etc.) and Actionable
      (2-1-1, 3-1-2, etc.) Strat patterns and name them explicitly in the
      Trade Card. Works for both image-upload and text-notes modes.
   3. SPEED — three improvements:
      a. Chart Analysis now streams via SSE onStream callback. The Trade
         Card starts appearing within 1-2s of pressing the button instead
         of waiting for the full 2200-token response. The "● streaming…"
         indicator shows on the Trade Card title while tokens arrive. The
         Referee Card and Supporting Analysis render only after the full
         response completes.
      b. Tape (CSV-only fallback) now also streams — the progressively
         built report text is shown live while the model writes it.
      c. The tape panel shows partial streaming text with a pulsing dot
         cursor during live generation; the web-search (tool-use) path
         still shows the spinner since multi-turn tool loops can't stream.

   v2026-06-13h (beta upload restored + column coverage audit):
   1. LOAD V.A.G. (BETA): direct CSV upload restored to the data bar,
      labeled "BETA" so it's clear this sits alongside the admin-published
      feed rather than replacing it. Same localStorage-primary persistence
      as before — works per-device, with window.storage as a best-effort
      cross-device bonus. Empty-state copy updated to mention both paths
      (tap Load V.A.G. to upload directly, or wait for the admin feed).
   2. RS10 AUDIT: traced end-to-end — FIELD_MAP correctly resolves "RS10"
      header → rs10 canonical key (verified against the actual Sector
      CSV: zero rows had a missing/blank RS10 value out of 37 symbols).
      The "RS10 = -" seen in chat was an artifact of an ad-hoc Python
      analysis script run outside the app, not a defect in the artifact's
      parsing or rendering — the RS cells in SetupTab/BiasTab already
      correctly display rs5/rs10/rs21 from g.rs5/g.rs10/g.rs21.
   3. FULL COLUMN COVERAGE AUDIT: every field returned by gradeRow() was
      cross-checked against its UI usage. Found one genuine gap — emBreak
      (EM-range breakout confirmation) was computed and folded into the
      displacement flag but never shown to the user as its own readable
      value. Added a new "EM Break" KV row in SetupTab showing
      yes/no + the EM band width when confirmed. Verified via an
      extracted, standalone test harness running the real gradeRow()
      logic against the actual uploaded Sector_Symbols.csv: all 31 CSV
      columns map to a canonical field, all canonical fields are
      surfaced somewhere in the UI (board row, BiasTab, SetupTab,
      ExecuteTab, or TradeCard) with no remaining orphaned values.

   v2026-06-13i (chart analysis fixes — ChatGPT audit response):
   1. DUPLICATE ANALYSIS FIXED: the chart-notes-mode prompt told the model
      to name the Strat pattern "in the Trade Card and Supporting Analysis"
      — directly contradicting the "output ONLY the Trade Card" instruction
      a few lines earlier in the same prompt. That self-contradiction was
      the root cause of the model occasionally writing an extra section.
      Both image-mode and notes-mode prompts now end with an explicit
      "output ONLY those two blocks" reminder. The OUTPUT FORMAT preamble
      was also rewritten as a hard rule with specific forbidden content
      (no Supporting Analysis, no numbered breakdown, no restated workflow,
      no bullet-point reasoning) instead of a single soft sentence. System
      prompt's pre-output self-check now explicitly verifies "is the
      response ONLY the Trade Card and Referee Card with nothing else."
      The render layer also changed: any leftover text after stripping
      both cards is now shown as a flagged "⚠ unexpected output" block
      instead of silently rendered as if it were expected — so a prompt
      regression is visible during QA instead of just blending in.
   2. WEB SEARCH WIRED IN: chart analysis previously had instructions
      telling the model to use "live web-search context" for off-desk
      tickers, but never actually passed the web_search tool to the API
      call — the instruction was unactionable. Now passes
      tools: [{ type: "web_search_20250305", name: "web_search" }].
      DESK CONTEXT GATING language tightened: ON-DESK tickers (found in
      the Futures/Sectors/Stocks/Scans CSV tiers) use full Sigma Bond
      language (Σ, WITS, Con Score, A+); OFF-DESK tickers get a pure
      technicals + web-search read with Sigma Bond terms explicitly
      forbidden, not just "not implied." Since tool-use forced the
      non-streaming path in callClaude, the tool-use loop was rewritten
      so the FINAL text-generation turn (after any tool calls resolve)
      re-issues with stream:true when onStream is provided — on-desk
      charts (no search needed) and off-desk charts (1-2 searches then a
      streamed answer) both now get fast, visible token-by-token output
      instead of off-desk charts going silent for the full round-trip.
   3. TARGET / FIELD POSITION LOGIC REWORKED per the audit:
      - Field Position bug: the old rule banded BALANCED as "within ~5%
        of equilibrium" — a percentage of raw PRICE, which is meaningless
        at a $400 stock (≈$20 band) and absurdly tight at a $2 stock
        (≈$0.10 band). Now computes position% = (price − swing low) /
        range width, a percentage of the RANGE WIDTH, with explicit
        ≥55%/≤45%/between bands — correct at any price level.
      - Target Rule bug: the old rule stated target R-multiples should
        "typically land between 1.5r and 3r" / "2.5r and 5r" — soft
        guidance that could bias the model to pick a level because its
        R-multiple looked clean rather than because it was the nearest
        real level. Rewritten as a strict two-step sequence: (1) find
        the nearest visible chart level first, by proximity only, (2)
        compute the R-multiple from that level second, as an output, not
        an input. Added an explicit self-check: "did I pick this level by
        proximity, or because its R-multiple looked clean? If the latter,
        redo it using proximity only."
      - System prompt's three-part pre-output check now explicitly
        verifies both of these were followed correctly.
   4. ROLL THE TAPE SHOW/HIDE: the full Field Report (Flag on the Play,
      Alpha Cannon, Field Position, Possession Report, Defensive Front,
      Vol Cycle, Internals Scorecard, Playbook, etc.) is now collapsed by
      default behind a "▼ show full report" toggle in the tape panel
      header, mirroring the existing Econ Calendar show/hide pattern.
      The 🎯 SNAPSHOT SUMMARY card — already a tight 5-line always-visible
      read — stays visible regardless of toggle state, so the sleek
      at-a-glance view is the default and the full report is opt-in.
      New tapeReportOpen state resets to collapsed on every fresh
      Roll the Tape call, so each new roll opens in the clean summary
      view rather than staying expanded from a previous session.

   v2026-06-13j (Roll the Tape duplicate-report bug fixed):
   ROOT CAUSE FOUND: the live-search prompt told the model to "search:
   major market-moving news headlines in the last 2 hours" only AFTER
   the live-price fetch instructions, with no instruction to verify
   market status (holidays, early closes, OPEX shifts) before beginning
   to write the template. On a real session (Friday June 19 — Juneteenth
   holiday), the model started writing the Field Report, discovered via
   search partway through that markets were closed, treated that as a
   correction it needed to make, and restarted the ENTIRE template from
   scratch with an inserted "⚠️ DESK NOTICE" — producing two full,
   nearly-identical copies of Snapshot Summary, First Read, Flag on the
   Play, Alpha Cannon, Field Position, and Possession Report back to back
   in a single response. This was a genuine model self-interruption bug,
   not a UI/extraction bug — confirmed by checking that the Snapshot
   Summary regex (.match, non-global) only ever displayed the FIRST
   occurrence, while the "show full report" toggle correctly displayed
   the complete raw (duplicated) text underneath, exactly as built.
   FIX — two layers:
   1. PROMPT (root cause): promptWithSearch now opens with "STEP 1 —
      VERIFY MARKET STATUS FIRST (mandatory, before any other research or
      writing)" — forces the holiday/closure/OPEX-shift check to resolve
      BEFORE any template drafting begins, explicitly stating "you get
      exactly one pass at this report... write the template once, start
      to finish, in order, with no restarts." The system prompt adds a
      matching "CRITICAL OUTPUT DISCIPLINE" clause: complete all research
      before writing the first line; folding in a late-discovered fact is
      fine, writing the template twice is a critical failure.
   2. DEFENSIVE BACKSTOP (render-layer safety net, since LLM output can't
      be 100% guaranteed): new dedupeRestart() function — if the
      "🎯 SNAPSHOT SUMMARY" header appears more than once in the response,
      keeps only the text from the LAST occurrence onward (the model's
      final, most-informed pass) and discards everything before it,
      including any stray mid-report notices. Applied at the single
      choke point right before tapeOutput state is set, so it
      automatically protects every downstream consumer of the text —
      the Snapshot Summary card, the "show full report" panel, the
      localStorage/window.storage persistence snapshot, and the Discord
      (Captain Hook) post — with one fix instead of patching each
      separately. Verified against the actual duplicated transcript:
      correctly isolates the single clean second pass, strips the
      "DESK NOTICE" artifact and the entire first-pass duplicate, and
      leaves no dangling "---" separator at the top of the result.

   v2026-06-13k (Roll the Tape collapse entirely — zero screen clutter by default):
   User feedback: "The macro tape is still show/hide full report, we want
   that section to collapse ENTIRELY to reduce unnecessary screen clutter."
   Previous design (v13j): tape panel was always visible with the Snapshot
   Summary card showing, and a secondary toggle hid/showed the full Field
   Report text behind it. Result: even when "collapsed," the panel still
   occupied vertical space and showed content.
   New design (v13k): the entire tape panel collapses/hides when not in use,
   leaving only a compact button in the header row: "▼ open tape" when
   closed. Clicking expands the full panel to show (1) Snapshot Summary
   card always visible, (2) optional secondary "▼ show details" toggle
   for the full Field Report text. Both toggles reset on every new
   Roll the Tape call, so each fresh roll starts fully collapsed —
   zero screen clutter, zero visual noise, pure desk real estate until
   the trader explicitly opens it. Respects the spirit of the design
   you created for the Econ Calendar (compact header, expand on demand)
   and applies it consistently to Roll the Tape as well.
   Implementation: renamed tapeReportOpen to control the entire panel
   visibility; added tapeDetailOpen to control the secondary report-text
   toggle within the expanded panel. Both reset to false on each rollTape()
   call. The panel header now always displays the session name + timestamp,
   and a single toggle button shows "▼ open tape" / "▲ collapse" — tapping
   it expands the panel or collapses it entirely.

   v2026-06-13k (Roll the Tape now fully collapsible):
   The entire tape panel was already designed with two-level collapse
   (entire panel toggles off by default, then a nested "show full
   report" toggle within it), reducing screen clutter as requested —
   but the button labels were confusing ("collapse" vs "open tape").
   Relabeled for clarity: top-level button now says "▼ show tape" /
   "▲ hide tape" (controls whether the entire panel is visible),
   nested button says "▼ show full report" / "▲ hide full report"
   (controls whether the multi-part Field Report appears when tape is
   open). State declarations already correctly default both to false,
   so tape section is completely collapsed by default, with user
   controlling what detail level they want to see (none, snapshot-only,
   or full report).

   v2026-06-19a (STRSI/Momo hard restriction — house rule alignment):
   User directive: "STRSI exclusively for micro-timing analysis. Momo
   metrics strictly for breakout confirmations." Previously both fed
   Σ/lean math (STRSI as a ±5/±2/−4/−3 sigmaFinal adjustment; Momo as
   one of ten weighted votes in the directional lean). That coupling is
   now removed:
   - votes (lean calc) no longer includes momo.dir. Momo's only
     remaining role is `momoBreakoutOK` (= momo.cont), which feeds
     `displacement` exactly as before — breakout confirmation, nothing
     else. It carries zero directional or scoring weight.
   - sigmaFinal no longer includes strsiAdj. STRSI's stage/value/
     alignment are still computed and exposed as `microTiming`, a
     read-only label (EARLY/EXP/LATE/misaligned) shown in the Bias tab
     STRSI block and nowhere folded into Σ. The A+ checklist's STRSI
     gate was already soft (excluded from CORE_GATE_IDX) — that role is
     unchanged and is now consistent with STRSI's read-only status
     everywhere else in the app.
   - Alpha Fox's Execution Window (IFP+STRSI+Momo confluence) already
     treated both as timing/confirmation signals, not scoring inputs —
     no change needed there; it was already aligned with house rule.
   This is a deliberate, isolated scoring-behavior change made post
   user-confirmation (explicitly requested as a hard restriction rather
   than an additive display-only change) — Σ scores for previously
   graded watchlists may shift slightly versus prior sessions since the
   STRSI timing bonus/penalty no longer contributes.
   ============================================================ */

/* ============================================================
   v2026-06-19b (mobile app retired — single responsive web UI):
   House decision: no standalone mobile app. The UI is now ONE
   responsive web experience that reflows for any screen, rather than a
   desktop UI plus a separate mobile-specific UX layer.

   REMOVED — "Tactical HUD" compact-row layer (v2026-06-11d):
   - compactView constant (was always === stackLayout, so this was a
     redundant alias, not an independent toggle — there was never an
     actual user-facing switch for it despite earlier comments implying
     one; confirmed via grep before removal).
   - BoardRow's compact branch: a stripped one-line "Verdict Summary"
     row (Symbol · Σ · Verdict · one-sentence referee call only) that
     had been silently replacing the full row for EVERY narrow-viewport
     user. Removed along with its options-context compact early-return.
   - "VERDICT" column header no longer hidden on narrow widths; "HUD"
     badge and its hudTag style removed (dead code, nothing referenced
     it after the branch removal).
   NET EFFECT: narrow-viewport (phone-width) users now see the SAME
   full board row as desktop — symbol, live price dot, sector, WITS,
   STRSI tag, fit badge, IFP/Con-Score/RS/LWC/Volume/SMRTx detail line,
   verdict tag, Σ — not a trimmed summary. Only the 5-pillar MiniBars
   column still hides at narrow widths (`!mobile` check, unchanged),
   since that detail is already one tap away in the Setup tab and a
   mini bar chart doesn't compress well below ~760px regardless of
   intent.
   stackLayout (window.innerWidth-driven responsive reflow: single-
   column stacking, board max-height, hiding the pillar column) is
   UNCHANGED — that's ordinary responsive design, not the mobile-app
   layer, and stays exactly as it was.

   RESOLVES the mobile load-path blocker (open since CSV paste was
   removed in v2026-06-12g/h): that blocker existed specifically
   because the Claude mobile APP's artifact-viewer iframe sandbox
   blocks `<input type="file">`. With no standalone mobile app, that
   sandbox no longer applies — the file picker works normally in any
   real mobile browser. House decision (confirmed): keep file-picker-
   only, do not reintroduce CSV paste as a parallel load path.
   ============================================================ */

/* ============================================================
   v2026-06-19c (storage self-test diagnostic removed — sync kept):
   Follow-up to v2026-06-19b. The localStorage+window.storage dual-write
   persistence pattern itself (localStorage primary/same-device,
   window.storage best-effort cross-device sync, adopt-if-newer on
   mount + 15s background poll) is UNCHANGED and was explicitly
   confirmed to stay — cross-device sync (grade on desktop, see it on
   phone browser) is a real feature independent of which mobile app
   exists, and the user confirmed they still want it.
   What WAS removed: the `selfTest` diagnostic inside syncFromStorage's
   catch block (a set+get round trip on a throwaway key, added in
   v2026-06-12f) whose sole purpose was distinguishing "key doesn't
   exist yet" from "window.storage is structurally broken in the old
   Claude mobile app's sandboxed artifact viewer." That distinction no
   longer has a reason to exist — with no standalone mobile app, any
   window.storage failure now is an ordinary transient condition
   (missing key, brief network issue), already handled correctly by
   the existing retry/poll loop without needing a diagnostic branch.
   syncStatus still exists and still records { ts, found, adopted,
   error, rawError } for any future debugging, just without the
   selfTest probe call or its pass/fail interpretation. No UI ever
   displayed syncStatus.selfTest (confirmed via search before removal),
   so this has zero user-visible effect — internal cleanup only.
   ============================================================ */

/* ============================================================
   v2026-06-20 (session summary — relationship-aware gates, option
   grading, report formatting, mobile uniformity):
   Consolidated top-level entry; see inline comments near each change
   (search "v2026-06-20a" through "v2026-06-20e") for full detail.

   20a — BoardRow layout fixes: ticker/price merged inline; fixed a
     real bug where the IFP/Con Score/RS/LWC/Volume/SMRTx detail row's
     `gap` was silently a no-op (S.rSector had no display:flex).

   20b — Mobile horizontal-overflow fix: colVerdict was flexShrink:1
     with non-wrapping text, forcing rows wider than the viewport;
     html/body's overflow-x:hidden then silently clipped instead of
     scrolling. Fixed both: colVerdict is now fixed-width, and
     overflow-x changed to auto (safety net) at shell + html/body.

   20c — Relationship-aware A+ gate redesign (house directive: gates
     should understand column RELATIONSHIPS, not independent thumbs-
     up). Added 3-cluster confluence analysis (Structural Alignment:
     D/W/WITS: Institutional Confirmation: IFP/Con Score/SMRTx/PI+/POI;
     Liquidity/Timing: LWC/STRSI/RS) as informational context shown in
     the Setup tab. CRITICAL CONSTRAINT (house-confirmed, additive-
     only): longChecks/shortChecks themselves are BYTE-IDENTICAL to the
     pre-redesign conditions — verified via direct execution of the
     extracted real function against the actual uploaded Top_5.csv (74
     symbols) and Scans.csv, zero regressions. PI+/POI wired into gate
     reasoning for the first time (previously parsed but never used).
     Applies identically to all four tiers (Macro/Futures, Sector,
     Stocks, Scans all share the same gradeRow — confirmed no tier-
     specific branching exists).

   20e — Option-code grading: option-ticker rows (e.g.
     ".RKT260626C14.5") previously a pure context-only stub now run a
     real 9-gate checklist using house-specified column set (Mark,
     Volume, LWC, IFP, Con Score, PI+, POI, OI/V, trend phase). WITS/
     STRSI/RS/SMRTx correctly excluded as not-applicable (confirmed
     blank/NaN on every real option row checked — these are underlying-
     only concepts, not fabricated for a derivative). Verified against
     real option rows in Scans.csv. Dashboard aggregate stats (A+
     count, long/short tallies) stay stock/sector/macro-only per house
     decision — options graded individually, not merged into those
     totals. BoardRow's options branch updated: graded signals get full
     visibility instead of permanent dimming; ungraded (CTX) rows still
     dim as before.

   20d (this entry) — Report text formatting: new FormattedReport
     component gives the Trade Card, Referee Card, Snapshot Summary,
     and full Field Report real typographic hierarchy (section headers,
     Label:Value line styling, directional-keyword coloring) instead of
     one flat <pre> block — house feedback: "the text from the snapshot
     and trade plan are a bit plain and dull to read." Pure rendering-
     layer change; the AI prompt templates and text-extraction regexes
     are completely untouched. Streaming/partial-text and error-state
     <pre> blocks deliberately left alone (formatting mid-stream text
     risks misfiring on incomplete lines).
     Mobile uniformity: removed a dead CSS rule (.sb-desk-collapse —
     defined but never applied to any element; the desk grid's mobile/
     desktop split was already correctly handled at the JS level via
     the `mobile` prop, so this was inert, not a visible bug). Aligned
     Decision Compression Modules' and Econ Calendar's border-radius
     (14->16) and spacing (added missing marginBottom, removed now-
     redundant flex gap) to match every other top-level panel.
   ============================================================ */

/* ============================================================
   v2026-06-20e/f (chart panel relocation + EOW calendar-gating fix):

   20e — Chart Analysis panel moved. House: "the chart analysis section
   is buried at the bottom of the page, let's move it just underneath
   the symbol section on the left side." Previously the chart panel
   lived at the bottom of the RIGHT column (S.cardCol), below the Trade
   Card — on the stacked mobile layout this put it dead last on the
   page. Moved to directly beneath the board in the LEFT column:
   S.main's 2-column CSS grid is structurally unchanged (still exactly
   2 grid children — a new flex wrapper holding [board, chart panel]
   is grid child 1, the Trade Card <section> is grid child 2), so
   nothing about desktop's column proportions or the mobile collapse
   breakpoint changed — only what's stacked inside column 1.

   20f — Fixed a real bug found via house feedback on an uploaded
   20-symbol RS/sector grid screenshot: sector-grid image classification
   (Step 0 in the chart-analysis prompt: "is this a multi-symbol grid or
   a single candlestick chart") was hard-gated behind isEOWWindow() —
   only active Fri 15:45 ET through Sunday. Uploading a sector-grid
   screenshot at any OTHER time silently skipped classification entirely
   and ran the single-symbol 13-step candlestick workflow against a
   20-panel image, which would have produced a nonsense Trade Card.
   Fixed: classification now always runs, any day/time, based on what
   the image actually contains rather than the calendar. The EOW window
   now only changes FRAMING within the sector-grid analysis itself —
   eowWorkflow's wording is conditional on `eow` (horizonLabel: "next
   week" during the EOW window vs "the rest of this week" mid-week;
   "Next-Week Watchlist" vs "Current Watchlist"; etc.) rather than a
   separate prose instruction trying to override hardcoded "next week"
   template text, which is the more reliable fix. The chart panel's
   badge (previously "EOW MODE", only shown during the window) now
   always shows — "EOW MODE" during the window, "GRID-AWARE" outside
   it — so the UI no longer implies sector-grid capability itself is
   time-gated when it isn't anymore.
   ============================================================ */

/* ============================================================
   v2026-06-20g (markdown rendering + unified Trade/Referee card):
   House feedback: "this section is plain and dull to read, needs to be
   marked down after analysis, and needs nicely formatted trade card/
   ref card together."

   Markdown support added to FormattedReport (MD_HEADER_RE, MD_BULLET_RE,
   MD_NUMBERED_RE, renderInlineMarkdown) — covers hash-prefixed headers,
   dash or star bullet lists, numbered lists, and inline bold, code, and
   italic spans. No markdown library is importable in this single-file
   no-bundler artifact environment, so this extends the formatter built
   last session rather than adding a dependency. Applied to the
   "unexpected output" leftover block specifically (previously raw
   <pre>, now FormattedReport) — the actual trigger for this feedback.

   Trade Card + Referee Card unified into ONE visual result
   (analysisResultWrap) instead of two independently-bordered,
   differently-colored boxes with a gap between them. New shared outer
   card; Trade Card is the primary top section, Referee Card is a
   secondary bottom section separated by a hairline divider rather than
   its own border+background. tradeCard/refereeCard style keys renamed
   to tradeCardSection/refereeCardSection (old keys confirmed to have
   zero remaining references before removal).

   PROCESS NOTE: mid-session, this entry's own documentation text
   accidentally contained the two-character sequence that opens a block
   comment, written out while describing bullet-list syntax in prose.
   Block comments in JS do not nest, and the parser has no concept of
   "inside a string" while scanning comment text — it just looks for the
   matching close sequence character by character — so that stray
   sequence ended the surrounding comment early and left real
   documentation text sitting as unparsed stray code. This happened
   twice in a row while writing this very note about avoiding it, which
   is itself the clearest evidence that eyeballing comment text is not
   sufficient. Caught by switching from a naive bracket-counting
   heuristic (used earlier in this session and shown here to produce
   both false positives on regex character classes and false negatives
   on large files via the bare Node syntax checker, which silently
   no-ops on a file this size rather than reporting errors) to the
   TypeScript compiler's no-emit check against a renamed copy of this
   file with a TSX extension, which gives a real, trustworthy parse of
   the entire file including JSX. That is the correct verification
   method for this file going forward — the bracket-counting habit from
   earlier sessions should be treated as a rough smell-test only, not
   proof of validity, and any large prose comment should be treated as a
   candidate for this same mistake until verified.
   ============================================================ */

/* ============================================================
   v2026-06-20k (extended-hours session gate):
   - NEW: isAfterHoursET() + isExtendedHoursET() helpers (pre-09:30 OR post-16:15 ET).
   - gradeDataset() now passes ctx.extHours=true when outside regular session.
   - gradeRow() lean-vote is session-aware: EXT %Chng gets weight 2 in extended
     hours (vs 1 during session), halved to 1 when volume=0 (illiquid quote).
     %C-WOPEN weight unchanged — acts as weekly context anchor in all sessions.
     Volume gates the EXT read: non-zero = active/liquid, confirms the signal.
   - buildTapeContext() volStr now shows EXT %Chng + compact Volume in ext-hours
     (not just pre-market) so the LLM tape read includes the correct context.
   - UI: EXT HOURS badge in the sync banner when loaded outside session.
   - SetupTab: EXT %Chng row now labelled PRE-MKT / AFTER-HRS / session closed.

   v2026-06-20k (production deploy fixes — WS recursion + proxy routing):
   - FIXED: the WS storage wrapper recursed infinitely whenever window.storage
     EXISTED (claude.ai sandbox): get/set/delete called WS.get/set/delete
     instead of window.storage.get/set/delete. It only "worked" on Netlify
     because window.storage is undefined there (the no-op branch). Now calls
     the real platform methods in the sandbox and no-ops in production.
   - FIXED: callClaude() (and the apiAvailable probe) called api.anthropic.com
     DIRECTLY at every site — the documented proxy routing was never actually
     wired, so Roll the Tape / Chart image mode / Econ Calendar all hit a 404
     on Netlify. Added IN_CLAUDE_SANDBOX detection + CLAUDE_API_URL router:
     api.anthropic.com directly inside the claudeusercontent.com sandbox,
     /api/claude everywhere else. All 4 fetch sites now use CLAUDE_API_URL.
   - DEPLOY REQUIREMENTS (outside this file):
       1. netlify/functions/claude-proxy.js must exist at that exact path.
       2. netlify.toml must rewrite  /api/claude -> /.netlify/functions/claude-proxy
          (status 200, force = true) and the proxy must pass through SSE when
          the request body sets stream:true.
       3. ANTHROPIC_API_KEY set in Netlify -> Site settings -> Environment vars.

   v2026-06-20h (mobile horizontal-scroll architecture fix):
   A real device screenshot (Android, narrow viewport) showed v2026-
   06-20b's fix was insufficient: the page-wide overflow-x:auto safety
   net added to html/body and S.shell was the WRONG SHAPE for the
   problem. It meant any single overflowing element anywhere on the
   page made the ENTIRE PAGE horizontally scrollable — visually
   dragging the header and every board row's rank number off the left
   edge to reveal whatever one element was still too wide, rather than
   clipping just that element locally. The screenshot showed exactly
   this: rank numbers clipped at the left edge, a horizontal scrollbar
   thumb, and the chart panel's Image/Notes toggle buttons cut off at
   the right edge of S.chartPanelHead (which had no flexWrap, so on a
   narrow screen the icon + "CHART ANALYSIS" + EOW badge already filled
   the row width before the toggle could fit).
   Fixed:
   - html/body and S.shell reverted to overflow-x:hidden (the true page
     root should never allow whole-page horizontal scroll).
   - S.boardBody given its own explicit overflowX:hidden — local
     containment for the board's specific scroll region, matching the
     pattern already used by tfGrid/pillarRow/kvGrid/tabBody.
   - S.chartPanelHead given flexWrap:wrap + rowGap so the Image/Notes
     toggle wraps to its own line on narrow screens instead of being
     clipped off-screen.
   The lesson from v2026-06-20b stands (root-cause the actual
   overflowing element, as was done there for VerdictTag/colVerdict) —
   what changed here is WHERE the safety net belongs: local to specific
   scrollable regions, never at the whole-page root.
   On the broader question this was raised alongside (a separate mobile
   app vs. a screen-width detection threshold): the threshold approach
   already exists and is exactly the right architecture — vw state
   (window.innerWidth) drives isNarrow/stackLayout at the 760px
   breakpoint, read throughout the app for column collapse, mobile-
   specific empty states, etc. A separate mobile app isn't needed; the
   responsive system was already built for one codebase to adapt. What
   was actually broken were bugs within that system, now fixed above.

   FOLLOW-UP (same v2026-06-20h, later in this session): colVerdict
   (90px) and SigmaBadge (30px) were still sized with desktop headroom
   even after the fixes above, leaving too little width for the symbol
   column on a true ~360-390px CSS-px phone and pushing content right up
   against boardBody's overflow:hidden clip boundary. Added rowMobile
   (tighter row padding/gap), colVerdictMobile (64px instead of 90px),
   and a smaller SigmaBadge (24px instead of 30px) when `mobile` is
   true — reclaims roughly 50px of width directly, so there's less for
   the local clip to ever need to hide.
   SELF-CORRECTION: mid-edit, an attempt was made to revert shell's,
   html/body's, and boardBody's overflow-x back to "auto", based on a
   surface-level read of the symptom that didn't account for the
   correct, already-documented reasoning above. Caught before shipping
   by reading this changelog block in full rather than re-diagnosing
   from scratch, and reverted back to "hidden". Left as an explicit note
   because it's a useful example of why root-causing AND checking
   existing documentation both matter before changing safety-net code.
   ============================================================ */

/* ============================================================
   v2026-06-19d (classical chart-pattern taxonomy — reasoning aid):
   House directive: integrate a 43-formation classical chart-pattern
   taxonomy (Head & Shoulders, Cup & Handle, flags, wedges, Wyckoff
   phases, etc. — sourced from project knowledge) into chart analysis.
   Explicit scope, per house clarification: "It just to assist you
   identify patterns, that add context to the trade plan when
   available — stacking confluence, no-trade zones, invalidations...
   we are essentially doing the homework for them." Decided NOT to add
   a new Trade Card field; this is reasoning material only.
   - New module-level constant CLASSICAL_PATTERNS_REFERENCE: full
     taxonomy (bullish/bearish/neutral formations with identification
     criteria + breakout direction + measured-move target), the
     Measurement Rule (pattern height -> objective target projection),
     and volume-confirmation logic (contraction during formation,
     expansion on breakout; weak-volume breakout = bull/bear trap risk).
     Text-only per house decision — no reference image, unlike the
     existing #TheStrat sheet (STRAT_PATTERNS_B64), since this is used
     as identification/measurement criteria rather than visual matching.
   - Appended to candleWorkflow (the per-symbol chart prompt) only —
     NOT to eowWorkflow (the sector-grid ranking prompt), since
     multi-candle price-structure patterns aren't the relevant
     vocabulary for a cross-ticker RS ranking read.
   - system prompt gained one explicit sentence: the taxonomy sharpens
     Strat Pattern (confluence when a Strat trigger fires at a
     classical breakout point), Stop (prefer the pattern's own
     invalidation when sharper than the generic swing stop), Target 1/2
     (Measurement Rule is a legitimate candidate level, same
     proximity-first logic as the existing Target Rule), and Execution
     (a weak-volume breakout is now an explicit, named reason to favor
     WAIT/NO TRADE over PLAY ON) — and that the model says nothing
     about it when no pattern is clearly visible, rather than
     force-fitting one onto an ambiguous chart.
   - #TheStrat and this taxonomy are explicitly framed as complementary
     vocabularies, not competing ones: Strat identifies the immediate
     1-3 candle trigger; the classical taxonomy identifies the broader
     multi-candle structure that trigger sits inside. Confluence between
     the two is called out as a stronger signal than either alone.
   Output format is unchanged — still exactly the Trade Card + Referee
   Card, nothing else; this addition only changes what informs field
   values the model was already producing.
   ============================================================ */

/* ============================================================
   v2026-06-19f (UI modernization pass — completed across all panels):
   Follow-up to v2026-06-19e, which scoped the Stripe/Linear-calm
   redesign to header/board/Setup-tab only and left ~200 style entries
   on the old panel/panel2/line/lineSoft tokens. This entry migrates
   every remaining panel to the same COL.surface0-3 / COL.borderSoft /
   COL.borderMed / SP spacing system: Top-Down Desk + tier chips, econ
   calendar, Roll-the-Tape panel + Decision Compression Modules, chart
   analysis panel + regime strip + empty states, mini-bars/RS-bar
   tracks, Execute tab (EM stats, R:R inputs/output), Review tab (hero,
   pillar rows), and the global CSS (.sb-row hover, scrollbar thumb).
   REMOVED — no live code references COL.panel/panel2/raised/line/
   lineSoft anywhere in the file anymore (confirmed via search before
   declaring this done); those five keys remain DEFINED in COL purely
   so nothing throws if some external reference still expects them —
   see the comment on COL itself.
   RENAMED: emptyStateHud -> emptyStateLg. The "Hud" name was a stale
   holdover from the compact-row "Tactical HUD" layer retired in
   v2026-06-19b — this style was never actually part of that layer
   (it's just a larger empty-state variant for narrow viewports), so
   the old name was misleading rather than descriptive.
   PRESERVED INTENTIONALLY: refereeCard's and tradeCard's strong 2px
   gold/teal accent borders were left untouched — those are deliberate
   emphasis devices for the two most decision-critical panels in the
   app, not instances of the flat-default-card problem this whole pass
   exists to fix. Per-instance borderColor-override patterns (tfCell,
   checkDot, posturePill, dcFoxStatus) were checked individually and
   each kept its base `border: "1px solid"` shorthand so the directional
   color cue they carry (bullish/bearish/regime-tone) still renders —
   an earlier edit in this same session briefly broke tfCell this way
   before being caught and fixed; this pass re-verified all four sites
   rather than assuming the same mistake wasn't repeated elsewhere.
   ============================================================ */

/* ---------- palette (named) ---------- */
const COL = {
  ink: "#0B1014",
  panel: "#111A21",
  panel2: "#172430",
  raised: "#1C2A36",
  line: "#243640",
  lineSoft: "#1A2730",
  text: "#E7EEF2",
  mist: "#8DA0AC",
  faint: "#5E727E",
  bull: "#34D6B4",
  bullDim: "#1c6b5c",
  bear: "#FF6B57",
  bearDim: "#7a3a32",
  gold: "#F5B83D",
  info: "#5BA8C9",
  violet: "#8E84F2",

  /* v2026-06-19e (UI modernization — Stripe/Linear-calm pass): a real
     elevation scale, additive to the palette above (nothing existing is
     removed — COL.panel/panel2/raised stay defined for any code not yet
     migrated to the new tokens). Each step is a soft lightness/desaturation
     move, not a new hue, so depth reads as "closer to the light" rather
     than "different colored box" — this is the core fix for the flat,
     same-card-everywhere feeling: previously panel/panel2/raised were used
     near-interchangeably across components with no consistent meaning.
       surface0 = page background (same as ink — the floor)
       surface1 = resting card (sections, the board, the desk panel)
       surface2 = raised/hover/nested-within-a-card content
       surface3 = active/selected/focused state
     Borders move from "always a hairline" to "hairline only where data is
     genuinely tabular" (board rows) — elsewhere, elevation + spacing alone
     separate content, which is the actual Stripe/Linear signature. */
  surface0: "#0B1014",
  surface1: "#121B22",
  surface2: "#18232C",
  surface3: "#1F2E39",
  borderSoft: "rgba(231, 238, 242, 0.06)",
  borderMed: "rgba(231, 238, 242, 0.10)",
  shadowCard: "0 1px 2px rgba(0,0,0,0.24), 0 8px 24px -12px rgba(0,0,0,0.4)",
  shadowRaised: "0 2px 8px rgba(0,0,0,0.3), 0 12px 32px -14px rgba(0,0,0,0.5)",
};

/* v2026-06-19e: consistent 4px-multiple spacing scale, replacing the
   scattergun 7/8/9/10/11/12/14px values found throughout the old S object.
   Not every old value is migrated in this pass (scoped to header/board/
   Setup tab per house decision) — SP is additive and existing inline
   numbers elsewhere are untouched until their turn. */
const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600&display=swap";

/* ---------- mindful lines (original, pre-execution lock) ---------- */
/* A+/A+ SHORT checklist gate order (see gradeRow): 0 Daily, 1 Weekly,
   2 STRSI (soft — never blocks), 3 RS (soft — never blocks), 4 LWC,
   5 WITS, 6 Con Score, 7 SMRTx. The "core six" below tolerate up to 2
   failures; shared between gradeRow's verdict math and the call-sheet UI. */
const CORE_GATE_IDX = [0, 1, 4, 5, 6, 7];
const SOFT_GATE_IDX = [2, 3];

const MINDFUL = [
  "The setup waits. You don't chase the whistle.",
  "Read the field before you move. The edge is in the read, not the rush.",
  "Discipline is the position you hold before the trade.",
  "No advantage, no play. Patience is a stance.",
  "Manage the trade you have, not the one you wanted.",
  "The plan was written when you were calm. Trust the calm version of you.",
];

/* ---------- helpers ---------- */
const num = (v) => {
  if (v === null || v === undefined) return NaN;
  const s = String(v).replace(/[%,$\s]/g, "").replace(/[()]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};
const sign0 = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
/* compact volume / open-interest formatter: 1450000 → "1.45M", 540000 → "540K" */
const fmtCompact = (n) => {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.?0+$/, "") + "K";
  return String(Math.round(n));
};

/* ---------- defensive de-duplication for Roll the Tape ----------
   The model is now instructed (system + user prompt) to write the Field
   Report exactly once, but LLM output isn't 100% guaranteed — it can still
   discover a late fact mid-research (e.g. a market holiday) and restart
   the whole template instead of folding the fact into a single draft.
   This is a belt-and-suspenders backstop: if the SNAPSHOT SUMMARY header
   (the first line of the template) appears a second time later in the
   text, that's an unambiguous signal of a restart — keep only the LAST
   occurrence onward, since the model's final pass is the one that
   incorporates whatever it learned. If only one occurrence exists, the
   text is returned unchanged. */
function dedupeRestart(text) {
  if (!text) return text;
  const headerRe = /🎯[^\n]*SNAPSHOT SUMMARY/gi;
  const matches = [...text.matchAll(headerRe)];
  if (matches.length <= 1) return text;
  // Keep from the LAST header onward — that's the model's final, most-informed pass
  const lastIdx = matches[matches.length - 1].index;
  let out = text.slice(lastIdx >= 0 ? findLineStart(text, lastIdx) : 0).trim();
  // Strip a leading "---" separator line left dangling at the very top after the cut
  out = out.replace(/^-{3,}\s*\n+/, "").trim();
  return out;
}
// walk back from a match index to the start of its line (and consume one
// blank line above it if present, so we don't leave a dangling separator)
function findLineStart(text, idx) {
  let i = text.lastIndexOf("\n", idx - 1);
  i = i < 0 ? 0 : i + 1;
  // also strip a preceding "---" separator line if present immediately above
  const before = text.slice(0, i).trimEnd();
  const sepMatch = before.match(/\n-{3,}\s*$/);
  if (sepMatch) {
    const sepStart = before.length - sepMatch[0].length + 1;
    return sepStart;
  }
  return i;
}

// five-phase → direction. P1 Distribution = bear; P2 Recovery / P3 Driving = bull;
// P4 Weakening = consolidation (neutral); P5 Pullback = neutral.
const phaseDir = (p) => (p === 2 || p === 3 ? 1 : p === 1 ? -1 : 0);

const normKey = (h) =>
  String(h).toLowerCase().replace(/[^a-z0-9]/g, "");

/* ---------- Volatility Cycle Calendar (probability overlay ONLY) ----------
   Anchored to monthly OPEX = third Friday, shifted to Thursday when that
   Friday is a market holiday (Juneteenth: Jun 19 2026 → OPEX Thu Jun 18;
   Jun 19 2027 falls on Saturday, observed Fri Jun 18 → OPEX Thu Jun 17).
   Weeks counted toward the NEXT OPEX:
     OPEX week        = W4 · IV crush, premium sellers favored
     week before      = W3 · vol expansion, highest R:R, premium buyers favored
     two weeks before = W2 · trend formation
     earlier          = W1 · post-OPEX vol reset                              */
const OPEX_FRIDAY_HOLIDAYS = new Set(["2026-06-19", "2027-06-18"]);
function opexOf(year, month /* 0-based */) {
  const first = new Date(Date.UTC(year, month, 1));
  const firstFri = 1 + ((5 - first.getUTCDay() + 7) % 7);
  let opex = new Date(Date.UTC(year, month, firstFri + 14));
  if (OPEX_FRIDAY_HOLIDAYS.has(opex.toISOString().slice(0, 10)))
    opex = new Date(opex.getTime() - 86400000);
  return opex;
}
function volWeekInfo(nowDate = new Date()) {
  const now = new Date(Date.UTC(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()));
  let next = opexOf(now.getUTCFullYear(), now.getUTCMonth());
  if (now > next) {
    const y = now.getUTCFullYear() + (now.getUTCMonth() === 11 ? 1 : 0);
    next = opexOf(y, (now.getUTCMonth() + 1) % 12);
  }
  const monday = (d) => { const m = new Date(d); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7)); return m; };
  const diffWeeks = Math.round((monday(next) - monday(now)) / (7 * 86400000));
  const week = diffWeeks <= 0 ? 4 : diffWeeks === 1 ? 3 : diffWeeks === 2 ? 2 : 1;
  const labels = {
    1: "W1 · post-OPEX vol reset",
    2: "W2 · trend formation",
    3: "W3 · vol expansion — highest R:R window, premium buyers favored",
    4: "W4 · OPEX week — IV crush, premium sellers favored",
  };
  return { week, label: labels[week], opex: next.toISOString().slice(0, 10) };
}
/* Seasonality overlay (probability overlay ONLY — never a standalone signal) */
function seasonalityLine(nowDate = new Date()) {
  const m = nowDate.getMonth(); // 0=Jan
  const bullish = m >= 10 || m <= 3; // Nov–Apr
  return bullish
    ? "Nov–Apr bullish seasonal cluster (best long entries Oct–Dec)"
    : "May–Oct seasonally weak/bearish cluster (best exits Apr–Jun)";
}

/* ---------- ET clock helpers (Roll-the-Tape auto-fire, EXT %Chng window,
   weekly econ calendar) ---------- */
function etMinutesOfDay(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return (h % 24) * 60 + m;
}
function etDateKey(d = new Date()) {
  return d.toLocaleDateString("en-US", { timeZone: "America/New_York" }); // M/D/YYYY
}
/* EXT %Chng (extended-hours % change) is a pre-market-only read — once the
   9:30 ET open prints, the regular session's %Change/Momo take over.
   After 16:15 ET the session closes and extended-hours context resumes. */
function isPreMarketET(d = new Date()) {
  return etMinutesOfDay(d) < 9 * 60 + 30;
}
function isAfterHoursET(d = new Date()) {
  return etMinutesOfDay(d) >= 16 * 60 + 15;
}
function isExtendedHoursET(d = new Date()) {
  return isPreMarketET(d) || isAfterHoursET(d);
}
/* Roll-the-Tape auto-fire slots, in ET minutes-of-day. Two snapshots per
   session per house spec:
     AM:    08:45–09:30 (pre-market)         + 09:50 (catch window to 10:10)
     LUNCH: 11:45 (catch window to 12:05)     + 14:15 (catch window to 14:35)
     PM:    15:30 (catch window to 15:50)     + 16:30 (catch window to 16:50)
   "Catch window" = the trader doesn't need to be staring at the clock —
   opening the app any time within ~20min of the target still fires that
   slot's snapshot. Each slot has its own dedup key so all 6 fire
   independently (am1 and am2 both label as "AM MACRO" but are separate
   snapshots). Shared between the auto-fire effect and SESSION_LABELS. */
const AUTO_TAPE_SLOTS = [
  { id: "am1",    session: "am",    start: 8 * 60 + 45,  end: 9 * 60 + 30 },        // 08:45–09:30 premarket
  { id: "am2",    session: "am",    start: 9 * 60 + 50,  end: 9 * 60 + 50 + 20 },   // 09:50–10:10
  { id: "lunch1", session: "lunch", start: 11 * 60 + 45, end: 11 * 60 + 45 + 20 },  // 11:45–12:05
  { id: "lunch2", session: "lunch", start: 14 * 60 + 15, end: 14 * 60 + 15 + 20 },  // 14:15–14:35
  { id: "pm1",    session: "pm",    start: 15 * 60 + 30, end: 15 * 60 + 30 + 20 },  // 15:30–15:50
  { id: "pm2",    session: "pm",    start: 16 * 60 + 30, end: 16 * 60 + 30 + 20 },  // 16:30–16:50
];
function currentAutoTapeSlot(d = new Date()) {
  const m = etMinutesOfDay(d);
  return AUTO_TAPE_SLOTS.find((s) => m >= s.start && m < s.end) || null;
}
/* ISO week key (Mon-based, YYYY-Www) — used to cache the econ calendar once
   per week in persistent storage, shared across devices via window.storage. */
function isoWeekKey(d = new Date()) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7; // Mon=1..Sun=7
  dt.setUTCDate(dt.getUTCDate() + 1 - day); // back to this week's Monday
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/* EOW (end-of-week) Sector Grid Analysis window: Friday 15:45 ET through the
   end of Sunday (ET). A sector-grid screenshot uploaded in this window
   triggers the EOW framework instead of the per-candle 13-step workflow. */
const ET_WEEKDAY_IDX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function etWeekdayIdx(d = new Date()) {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d);
  return ET_WEEKDAY_IDX[wd] ?? 0;
}
function isEOWWindow(d = new Date()) {
  const idx = etWeekdayIdx(d);
  if (idx === 6 || idx === 0) return true; // Sat or Sun (all day ET)
  if (idx === 5) return etMinutesOfDay(d) >= 15 * 60 + 45; // Fri >= 15:45 ET
  return false;
}

/* Detect TOS options ticker formats:
   .NVDA240621C500  — dot-prefix OCC
   NVDA 240119C500  — space-separated
   NVDA_240621C500  — underscore date
   NVDA Jun 21 2024 500 Call  — TOS display format        */
const isOptionsTicker = (sym) => {
  const s = String(sym || "").trim();
  if (!s) return false;
  if (s.startsWith(".")) return true;                        // dot-prefix OCC
  if (s.includes(" ")) return true;                          // any space = options/compound
  if (/\d{6}[CP]\d/.test(s)) return true;                   // YYMMDDCP embedded
  if (/_\d{6}[CP]/.test(s)) return true;                    // underscore date format
  return false;
};

/* canonical column resolver — keyed to the real TOS header spellings.
   normKey() lowercases and strips non-alphanumerics, so "%C-WOPEN"→"cwopen",
   "Con score"→"conscore", "OI-"→"oi", "-V%"→"v", "Open.Int"→"openint". */
const FIELD_MAP = {
  symbol: ["symbol", "sym", "ticker"],
  sector: ["sector", "assetclass"],
  momo: ["momo", "momentum"],
  em: ["em", "expectedmove"],
  mark: ["mark", "last", "price"],
  pctchange: ["change", "pctchange", "chg"],
  cwopen: ["cwopen", "copen"],
  extchng: ["extchng", "extpctchng", "extchg"],
  bas: ["bas"],
  ivp: ["iv", "ivplus"],
  implvol: ["implvol", "impliedvol"],
  vpct: ["v", "vpct"],
  vd: ["vd", "vdpct"],
  volume: ["volume", "vol"],
  oint: ["openint", "openinterest"],
  oistate: ["oi", "oistate", "oiminus"],
  oiv: ["oiv", "oivol"],
  pi: ["pi", "piplus"],
  poi: ["poi"],
  ifp: ["ifp", "instflow"],
  smrtx: ["smrtx", "smrt"],
  conscore: ["conscore", "convexity"],
  wits: ["wits", "trendstate"],
  strsi: ["strsi"],
  lwc: ["lwc"],
  tf15: ["15m", "m15"],
  tf2h: ["2hr", "2h", "h2"],
  tfd: ["d", "daily"],
  tfw: ["w", "weekly"],
  rs5: ["rs5", "rs05"],
  rs10: ["rs10"],
  rs21: ["rs21"],
};

function resolveRow(raw) {
  const out = {};
  const normIndex = Object.keys(raw).map((k) => [normKey(k), k]);
  for (const [canon, aliases] of Object.entries(FIELD_MAP)) {
    let val = "";
    // exact normalized-key match first
    for (const a of aliases) {
      const hit = normIndex.find(([nk]) => nk === a);
      if (hit) { val = raw[hit[1]]; break; }
    }
    // strict fallback: alias (length ≥ 4) is a substring of a header key.
    // one-directional only — never let a short key absorb a long alias.
    if (val === "") {
      for (const a of aliases) {
        if (a.length < 4) continue;
        const hit = normIndex.find(([nk]) => nk.includes(a));
        if (hit) { val = raw[hit[1]]; break; }
      }
    }
    out[canon] = val ?? "";
  }
  return out;
}

/* ---------- column interpreters (the dictionary) ---------- */
function readWITS(s) {
  const u = String(s).toUpperCase();
  if (u.includes("DRIVING+") || u.includes("DRIVING +")) return { dir: 1, label: "DRIVING+", str: 100 };
  if (u.includes("DRIVING")) return { dir: 1, label: "DRIVING", str: 82 };
  if (u.includes("RECOVERY")) return { dir: 1, label: "RECOVERY", str: 60 };
  if (u.includes("PULLBACK")) return { dir: 0, label: "PULLBACK", str: 0 };
  if (u.includes("WEAKENING")) return { dir: 0, label: "WEAKENING·consol", str: 0 };
  if (u.includes("DISTRIBUTION")) return { dir: -1, label: "DISTRIBUTION", str: 100 };
  if (u.includes("SIDELINE")) return { dir: 0, label: "SIDELINE", str: 0 };
  if (u.includes("RESET")) return { dir: 0, label: "RESET", str: 0 };
  const arrow = u.match(/P?(\d)\s*(?:→|-+>|>)\s*P?(\d)/);
  if (arrow) {
    const target = parseInt(arrow[2], 10);
    const dir = phaseDir(target);
    return { dir, label: `P${arrow[1]}→P${target}`, str: dir !== 0 ? 68 : 0 };
  }
  return { dir: 0, label: s ? String(s) : "—", str: 0 };
}
function readIFP(s) {
  const u = String(s).toUpperCase();
  const trig = u.includes("TRIG");
  let dir = 0;
  if (u.includes("↑") || u.includes("UP") || u.includes("INF↑")) dir = 1;
  if (u.includes("↓") || u.includes("DOWN") || u.includes("INF↓")) dir = -1;
  return { dir, trig, label: s ? String(s) : "—" };
}
function readMomo(s) {
  const u = String(s).toUpperCase().trim();
  const bull = ["TBO", "TYBO", "T2BO", "CYBO", "C2BO"];
  const bear = ["TBD", "TYBD", "T2BD", "CYBD", "C2BD"];
  const cont = ["CYBO", "C2BO", "CYBD", "C2BD"];
  let dir = 0, quality = 0;
  if (bull.includes(u)) dir = 1;
  if (bear.includes(u)) dir = -1;
  if (cont.includes(u)) quality = 1;
  return { dir, cont: quality === 1, label: u || "—" };
}
function readCon(s) {
  const v = num(s);
  let state = "—", str = 0;
  if (Number.isFinite(v)) {
    if (v >= 140) { state = "IGNITION"; str = 88 + clamp((v - 140) / 2, 0, 12); }
    else if (v >= 110) { state = "EXPANDING"; str = 66 + (v - 110) * (22 / 30); }
    else if (v >= 85) { state = "PRIMED"; str = 42 + (v - 85) * (24 / 25); }
    else { state = "STABLE"; str = clamp((v / 85) * 42, 0, 42); }
  } else {
    const u = String(s).toUpperCase();
    if (u.includes("IGNITION")) { state = "IGNITION"; str = 95; }
    else if (u.includes("EXPANDING")) { state = "EXPANDING"; str = 78; }
    else if (u.includes("PRIMED")) { state = "PRIMED"; str = 55; }
    else if (u.includes("STABLE")) { state = "STABLE"; str = 25; }
  }
  return { v, state, str: clamp(str) };
}
function readLWC(s) {
  const v = num(s);
  return { v: Number.isFinite(v) ? v : 0, raw: s };
}
function readPhase(s) {
  // Timeframe columns (15m/2hr/D/W) export the five-phase trend number (1–5):
  //   P1 Distribution → bear, P2 Recovery → bull, P3 Driving → bull,
  //   P4 Consolidation → neutral, P5 Pullback → neutral.
  const v = num(s);
  if (Number.isFinite(v)) {
    const p = Math.round(v);
    return { dir: phaseDir(p), phase: p };
  }
  const u = String(s).toUpperCase();
  if (u.includes("BULL") || u.includes("UP") || u.includes("LONG")) return { dir: 1, phase: null };
  if (u.includes("BEAR") || u.includes("DOWN") || u.includes("SHORT")) return { dir: -1, phase: null };
  return { dir: 0, phase: null };
}
function readSTRSI(s) {
  const u = String(s).toUpperCase().trim();
  let stage = "—";
  if (u.includes("EARLY")) stage = "EARLY";
  else if (u.includes("EXP")) stage = "EXP";
  else if (u.includes("LATE")) stage = "LATE";
  /* Value arrives embedded in the stage word: "EARLY +4", "EXP -6", or the
     newer unsigned "EARLY 8" (unsigned = positive). Bare "-" means no read. */
  const m = u.match(/([-+]?\d+(?:\.\d+)?)/);
  const val = m ? parseFloat(m[1]) : NaN;
  return { stage, val: Number.isFinite(val) ? val : 0 };
}
function readOIstate(s) {
  const u = String(s).toUpperCase();
  if (u.includes("NEW") || u.includes("LOAD")) return 1;
  if (u.includes("EXIT")) return -1;
  return 0;
}
/* IV+ (1yr IV percentile, 0-100) + Impl Vol (current IV%) combined read.
   Both fields are context-only — never gate or score — but together they
   tell you whether current option pricing is rich or cheap relative to the
   name's own history, which is the actual decision-relevant question for
   premium buyers vs. sellers. */
function ivContext(ivp, implvol) {
  if (!Number.isFinite(ivp) && !Number.isFinite(implvol)) return null;
  const ivpTxt = Number.isFinite(ivp) ? `${ivp}p` : "—";
  const ivTxt = Number.isFinite(implvol) ? `${implvol}%` : "—";
  let read = "IV neutral vs 1yr range";
  let dir = 0;
  if (Number.isFinite(ivp)) {
    if (ivp >= 70) { read = "IV rich vs 1yr range — premium selling favored"; dir = 1; }
    else if (ivp <= 30) { read = "IV cheap vs 1yr range — premium buying favored"; dir = -1; }
  }
  return { ivpTxt, ivTxt, read, dir };
}
function readBAS(s) {
  const u = String(s).toUpperCase();
  const v = num(s);
  if (u.includes("GREEN")) return { health: 1, label: "green" };
  if (u.includes("ORANGE")) return { health: 0.5, label: "orange" };
  if (u.includes("MAGENTA")) return { health: 0.1, label: "magenta" };
  if (u.includes("GRAY") || u.includes("GREY")) return { health: 0.4, label: "no data" };
  if (Number.isFinite(v)) {
    if (v <= 1) return { health: 1, label: "tight" };
    if (v <= 5) return { health: 0.5, label: "wide" };
    return { health: 0.1, label: "poor" };
  }
  return { health: 0.6, label: "—" };
}

/* ---------- scoring engine ---------- */
function gradeRow(raw, ctx) {
  const r = resolveRow(raw);
  const sym = String(r.symbol || "—").trim() || "—";

  /* ============================================================
     v2026-06-20e — option-code grading (house directive).
     Previously, option-ticker rows (e.g. ".RKT260626C14.5") were a pure
     stub: displayed as de-emphasized context only, zero grading logic run
     even though real per-contract data exists in the CSV (Mark, Volume,
     %Change, LWC, IFP, Con Score, Impl Vol, 15m/2hr/D trend phase).
     House-confirmed column set for option grading: "Mark, Volume,
     %Change, LWC, IFP, PI+, POI, V/OI, impl vol, and the trend phase
     columns." Explicitly EXCLUDED: Sector, Momo, WITS, STRSI, RS5/10/21,
     SMRTx — confirmed blank/NaN on every real option row checked (these
     are underlying-only concepts: relative-strength-vs-SPX and
     structural trend phase don't cleanly apply to a derivative contract).
     PI+/POI are read generically (already in FIELD_MAP) and used WHEN
     PRESENT — neither real file available during this session's testing
     (Top_5.csv, Scans.csv) carries PI+/POI columns for any tier, options
     included, so they correctly fall back to not-applicable rather than
     failing. If a future export tier does carry them, this works
     automatically with no further change needed.
     House decision: full A+ checklist shape, reusing the SAME
     CORE_GATE_IDX/SOFT_GATE_IDX/coreFails<=2 tolerance pattern as stock
     grading — but populated only with gates that have real option data;
     WITS/STRSI/RS/SMRTx-equivalent lines are marked n/a (applicable:
     false) rather than fabricated or force-fit from the underlying. */
  if (isOptionsTicker(sym)) {
    const optIfp = readIFP(r.ifp);
    const optCon = readCon(r.conscore);
    const optLwc = readLWC(r.lwc);
    const optPct = num(r.pctchange);     // option's own %Change, not the underlying's
    const optVolume = num(r.volume);
    const optImplVol = num(r.implvol);
    const optPi = num(r.pi);
    const optPoi = num(r.poi);
    const optOiv = num(r.oiv);           // OI/V — "commitment behind activity" per data dictionary
    const optD = readPhase(r.tfd), optH2 = readPhase(r.tf2h), opt15 = readPhase(r.tf15);

    /* Directional lean for an option contract: IFP trigger direction is
       the strongest single signal (per dictionary, "one of the most
       important participation columns"); falls back to %Change sign,
       then D-phase direction, when IFP is flat/absent. */
    const optLean = optIfp.dir !== 0 ? optIfp.dir
      : sign0(optPct) !== 0 ? sign0(optPct)
      : phaseDir(optD.phase);

    const optConExp = optCon.v >= 110 || ["EXPANDING", "IGNITION"].includes(optCon.state);
    const optConGateOK = optConExp || optCon.state === "PRIMED";
    const optDPresent = String(r.tfd ?? "").trim() !== "";
    const optH2Present = String(r.tf2h ?? "").trim() !== "";
    const optPiPresent = Number.isFinite(optPi);
    const optPoiPresent = Number.isFinite(optPoi);
    const optOivPresent = Number.isFinite(optOiv);
    /* OI/V bullish = higher values (more open-interest commitment per
       unit volume); no fixed dictionary threshold given, so this is read
       directionally relative to the option's own price direction rather
       than an absolute cutoff — high OI/V backing a move up is bullish
       confirmation, high OI/V backing a move down is bearish confirmation. */
    const optOivConfirmsLong = optOivPresent && optOiv > 1 && optPct > 0;
    const optOivConfirmsShort = optOivPresent && optOiv > 1 && optPct < 0;

    const optLongChecks = [
      ["Mark trending up (%Change > 0)", optPct > 0, Number.isFinite(optPct)],
      ["Volume present (contract active)", Number.isFinite(optVolume) && optVolume > 0, Number.isFinite(optVolume)],
      ["LWC > 0", optLwc.v > 0, String(r.lwc ?? "").trim() !== ""],
      ["IFP = ↑(TRIG) or active bull pulse", optIfp.dir === 1, true],
      ["Con Score EXPANDING/IGNITION/PRIMED", optConGateOK, true],
      ["PI+ confirms participation (>0.75)", optPi >= 0.75, optPiPresent],
      ["POI confirms participation (>0.75)", optPoi >= 0.75, optPoiPresent],
      ["OI/V backs the move (commitment)", optOivConfirmsLong, optOivPresent],
      ["D/2hr trend phase bullish", phaseDir(optD.phase) === 1 && (phaseDir(optH2.phase) === 1 || !optH2Present), optDPresent],
    ];
    const optShortChecks = [
      ["Mark trending down (%Change < 0)", optPct < 0, Number.isFinite(optPct)],
      ["Volume present (contract active)", Number.isFinite(optVolume) && optVolume > 0, Number.isFinite(optVolume)],
      ["LWC < 0", optLwc.v < 0, String(r.lwc ?? "").trim() !== ""],
      ["IFP = ↓(TRIG) or active bear pulse", optIfp.dir === -1, true],
      ["Con Score EXPANDING/IGNITION/PRIMED", optConGateOK, true],
      ["PI+ confirms participation (<0, not confirming reversal)", optPi < 0, optPiPresent],
      ["POI confirms participation (<0)", optPoi < 0, optPoiPresent],
      ["OI/V backs the move (commitment)", optOivConfirmsShort, optOivPresent],
      ["D/2hr trend phase bearish", phaseDir(optD.phase) === -1 && (phaseDir(optH2.phase) === -1 || !optH2Present), optDPresent],
    ];
    /* Same tolerance pattern as stock gates: count applicable failures,
       <=2 tolerated. With 9 lines (vs stocks' 8) and several routinely
       n/a (PI+/POI absent in every file tested), the applicable-only
       denominator keeps this fair rather than auto-failing on missing
       columns the export tier never carried. */
    const optCoreFails = (checks) => checks.reduce((n, c) => n + (c[2] && !c[1] ? 1 : 0), 0);
    const optFailLong = optCoreFails(optLongChecks);
    const optFailShort = optCoreFails(optShortChecks);
    const optAPlusLong = optFailLong <= 2 && optLean === 1;
    const optAPlusShort = optFailShort <= 2 && optLean === -1;

    let optVerdict;
    if (optAPlusLong) optVerdict = "A+ LONG (opt)";
    else if (optAPlusShort) optVerdict = "A+ SHORT (opt)";
    else if (optLean === 1) optVerdict = "WATCH · LONG (opt)";
    else if (optLean === -1) optVerdict = "WATCH · SHORT (opt)";
    else optVerdict = "OPTIONS·CTX";

    return {
      symbol: sym, sector: String(r.sector || "").trim(),
      isOptions: true,
      verdict: optVerdict, vlean: optAPlusLong ? 1 : optAPlusShort ? -1 : optLean, sigma: 0,
      pillars: { part: 0, conv: 0, trend: 0, rs: 0, liq: 0 },
      wits: { dir: 0, label: "—", str: 0 }, ifp: optIfp,
      momo: { dir: 0, cont: false, label: "—" }, con: optCon,
      lwc: optLwc, strsi: { stage: "—", val: 0 }, bas: { health: 0.6, label: "—" },
      microTiming: "N/A", momoBreakoutOK: false,
      structConfluence: 0, institConfluence: 0, liqConfluence: 0, institConfirmed: false,
      piConfirmsLong: optPiPresent ? optPi >= 0.75 : null, piConfirmsShort: optPiPresent ? optPi < 0 : null,
      poiConfirmsLong: optPoiPresent ? optPoi >= 0.75 : null, poiConfirmsShort: optPoiPresent ? optPoi < 0 : null,
      smrtx: NaN, cwopen: num(r.cwopen), pct: optPct,
      vd: num(r.vd), vpct: num(r.vpct),
      pi: optPi, poi: optPoi, oiv: optOiv,
      oistate: readOIstate(r.oistate), ivp: num(r.ivp), implvol: optImplVol,
      ifpPresent: optIfp.dir !== 0, extchng: num(r.extchng),
      volume: optVolume, oint: num(r.oint),
      longChecks: optLongChecks, shortChecks: optShortChecks, noTradeReasons: [], displacement: optIfp.trig || optConExp,
      coreFailLong: optFailLong, coreFailShort: optFailShort, optAdj: 0, vdAdj: 0, ivAdj: 0,
      tf: {
        d: phaseDir(optD.phase), w: 0, h2: phaseDir(optH2.phase), m15: phaseDir(opt15.phase),
        dP: optD.phase, wP: null, h2P: optH2.phase, m15P: opt15.phase,
      },
      em: num(r.em), mark: num(r.mark), emHigh: NaN, emLow: NaN, emBreak: false,
      ref: {
        card: optAPlusLong || optAPlusShort ? "play" : (optLean !== 0 ? "watch" : "stop"),
        text: optAPlusLong
          ? `Contract showing A+ bullish confluence — ${9 - optFailLong}/9 option gates confirm.`
          : optAPlusShort
          ? `Contract showing A+ bearish confluence — ${9 - optFailShort}/9 option gates confirm.`
          : optLean === 1
          ? `Bullish lean but not A+ — ${9 - optFailLong}/9 option gates confirm, short of the A+ bar. Graded on contract-level data only (Mark, Volume, LWC, IFP, Con Score, PI+/POI when present, OI/V, trend phase).`
          : optLean === -1
          ? `Bearish lean but not A+ — ${9 - optFailShort}/9 option gates confirm, short of the A+ bar. Graded on contract-level data only (Mark, Volume, LWC, IFP, Con Score, PI+/POI when present, OI/V, trend phase).`
          : "Option contract — graded on contract-level data only (Mark, Volume, LWC, IFP, Con Score, PI+/POI when present, OI/V, trend phase). WITS/STRSI/RS/SMRTx are underlying-only concepts and don't apply here.",
      },
      rsPct: 0, haveRS: false, rs5: NaN, rs10: NaN, rs21: NaN, rsSlope: NaN,
      lean: optLean, _raw: r,
    };
  }

  const wits = readWITS(r.wits);
  const ifp = readIFP(r.ifp);
  const momo = readMomo(r.momo);
  const con = readCon(r.conscore);
  const lwc = readLWC(r.lwc);
  const strsi = readSTRSI(r.strsi);
  const smrtx = num(r.smrtx);
  const cwopen = num(r.cwopen);
  const pct = num(r.pctchange);
  const vd = num(r.vd);
  const pi = num(r.pi);
  const poi = num(r.poi);
  const oiv = num(r.oiv);
  const oistate = readOIstate(r.oistate);
  const bas = readBAS(r.bas);
  const ivp = num(r.ivp); // 1-yr IV percentile (context only)
  const vpct = num(r.vpct); // -V%: volatility expansion (+) or contraction (−), context only
  const implvol = num(r.implvol); // Impl Vol: current implied volatility %, context only
  const D = readPhase(r.tfd), W = readPhase(r.tfw), H2 = readPhase(r.tf2h), M15 = readPhase(r.tf15);
  const pD = D.dir, pW = W.dir, p2h = H2.dir, p15 = M15.dir;
  const ifpPresent = String(r.ifp).trim() !== "";
  const lwcPresent = String(r.lwc).trim() !== "";
  const wPresent = String(r.tfw).trim() !== "";
  const extchng = num(r.extchng); // overnight gap / open-auction bias (lighter MarketWatch schema)
  const em = num(r.em);
  const mark = num(r.mark);
  const volume = num(r.volume);   // session volume (Informational per dict, key for futures/options)
  const oint = num(r.oint);       // open interest (Informational per dict, key for futures/options)

  /* directional lean — weighted vote.
     v2026-06-19 (hard restriction): Momo removed from the lean vote.
     Per house rule, Momo is used STRICTLY for breakout confirmation
     (see `displacement` below, and momoBreakoutOK in the A+ checklist) —
     it no longer carries directional or scoring weight anywhere upstream
     of that single confirmation role.

     v2026-06-20k SESSION-GATE (extended hours):
     Before 09:30 ET (pre-market) or after 16:15 ET (after-hours) the
     regular session's %Change column is stale/absent.  EXT %Chng becomes
     the primary directional read (weight 2), %C-WOPEN supplies weekly
     context (weight 1), and volume acts as a liquidity gate — if volume
     is zero the EXT %Chng vote is halved (illiquid quote, low conviction).
     During regular session (09:30–16:15) behaviour is unchanged. */
  const extHours = ctx.extHours;                             // true pre-09:30 or post-16:15
  const volOk    = Number.isFinite(volume) && volume > 0;   // any volume = liquid

  // Extended-hours weighting for EXT %Chng
  const extChngWeight = extHours
    ? (volOk ? 2 : 1)    // pre/after-market: primary signal (halved when illiquid)
    : 1;                  // regular session: same lightweight role as before

  // %C-WOPEN (%C-OPEN vs open of week): always meaningful context, unchanged weight
  // Regular session: cwopen represents intra-day drift — sign0 (±1)
  // Extended hours: cwopen = weekly bias anchor — same sign0, same weight

  const votes =
    wits.dir * 2 +
    (ifp.trig ? ifp.dir * 2 : ifp.dir) +
    (smrtx >= 65 ? 2 : smrtx <= 35 ? -2 : 0) +
    sign0(cwopen) +
    sign0(extchng) * extChngWeight +
    sign0(vd) +
    p2h +
    pD +
    pW;
  const lean = votes > 0 ? 1 : votes < 0 ? -1 : 0;
  const L = lean === 0 ? 1 : lean; // for magnitude when neutral

  /* relative strength — real RS5/10/21 percentiles vs SPX (per user's study),
     fall back to session %C-WOPEN proxy only when columns are absent */
  const rs5 = num(r.rs5), rs10 = num(r.rs10), rs21 = num(r.rs21);
  const rsVals = [rs5, rs10, rs21].filter(Number.isFinite);
  const haveRS = rsVals.length > 0;
  const rsAvg = haveRS ? rsVals.reduce((a, b) => a + b, 0) / rsVals.length : NaN;
  const rsSlope = Number.isFinite(rs5) && Number.isFinite(rs21) ? rs5 - rs21 : NaN; // 5v21 proxy for cyan/yellow slope
  const rsMetricFallback = Number.isFinite(cwopen) ? cwopen : Number.isFinite(pct) ? pct : 0;
  const rsPct = haveRS ? rsAvg : ctx.rsRank(rsMetricFallback); // 0..100, higher = stronger vs SPX

  /* ---- pillar scores (0..100 supporting the lean) ---- */
  // Participation (heaviest): IFP trigger, SMRTx, PI+, POI, OI-, OI/V, VD%
  let part = 0;
  part += ifp.trig && ifp.dir === L ? 30 : ifp.dir === L ? 12 : 0;
  if (Number.isFinite(smrtx)) part += clamp((Math.abs(smrtx - 50) / 50) * 24, 0, 24) * ((smrtx >= 50 ? 1 : -1) === L ? 1 : 0.15);
  if (Number.isFinite(pi)) part += pi > 1.5 ? 14 : pi >= 0.75 ? 9 : pi < 0 ? 0 : 4;
  if (Number.isFinite(poi)) part += poi > 1.5 ? 10 : poi >= 0.75 ? 6 : poi < 0 ? 0 : 3;
  part += oistate === L ? 8 : oistate === 0 ? 2 : 0;
  if (Number.isFinite(oiv)) part += clamp(oiv * 4, 0, 8);
  part += sign0(vd) === L ? 6 : 0;
  part = clamp(part);

  // Convexity
  const conv = con.str;

  // Trend quality: WITS aligned + D/W align + 2h
  let trend = wits.dir === L ? wits.str * 0.6 : wits.dir === 0 ? 0 : 8;
  trend += pD === L ? 16 : 0;
  trend += pW === L ? 16 : 0;
  trend += p2h === L ? 8 : 0;
  trend = clamp(trend);

  // Relative strength (proxy)
  const rs = lean === 1 ? rsPct : lean === -1 ? 100 - rsPct : Math.abs(rsPct - 50) * 2 * 0 + rsPct;

  // Liquidity context: LWC aligned + BAS health
  let liq = 0;
  const lwcAligned = sign0(lwc.v) === L;
  liq += lwcAligned ? Math.min(Math.abs(lwc.v), 3) / 3 * 70 : 0;
  liq += bas.health * 30;
  liq = clamp(liq);

  const sigma = Math.round(0.30 * part + 0.22 * conv + 0.22 * trend + 0.13 * rs + 0.13 * liq);

  /* STRSI micro-timing read — per house rule, STRSI is used EXCLUSIVELY
     for micro-timing and no longer adjusts Σ in any way.
     v2026-06-19 (hard restriction): strsiAdj removed from sigmaFinal.
     stage/strsiDir/strsiAligned are retained and surfaced as a dedicated
     micro-timing readout (EARLY = highest R:R entry timing, EXP = still
     timely, LATE = lower R:R / chasing) — informational only, never
     scores or gates. The A+ checklist below already treats STRSI as a
     soft/display-only gate (excluded from CORE_GATE_IDX); that is now
     consistent with its read-only role here too. */
  const strsiDir = sign0(strsi.val); // +1 bullish, -1 bearish from the numeric value
  const strsiAligned = strsi.stage !== "—" && strsiDir === lean;
  const microTiming = strsi.stage === "—" ? "N/A"
    : strsiAligned
      ? (strsi.stage === "EARLY" ? "EARLY (highest R:R)" : strsi.stage === "EXP" ? "EXP (still timely)" : "LATE (lower R:R)")
      : "misaligned / off-lean";

  /* ---- soft "options regime" assist (never gates — enhances/decreases
     sigma only) ----
     Impl Vol vs IV+ (1yr percentile) and VD% nudge sigma to reflect whether
     the options market is positioned WITH or AGAINST the move:
       VD% aligned with the lean -> +3   (volume confirms direction)
       VD% opposed to the lean   -> -3
       IV+ <= 30 (cheap vs 1yr)  -> +2   (premium is cheap to express the trade)
       IV+ >= 70 (rich vs 1yr)   -> -2   (premium is expensive / crowded)
     Max combined swing: ±5. Surfaced in Setup tab for transparency. */
  const vdAdj = Number.isFinite(vd) ? (sign0(vd) === L ? 3 : sign0(vd) === -L ? -3 : 0) : 0;
  const ivAdj = Number.isFinite(ivp) ? (ivp <= 30 ? 2 : ivp >= 70 ? -2 : 0) : 0;
  const optAdj = vdAdj + ivAdj;

  const sigmaFinal = clamp(sigma + optAdj, 0, 100);

  /* ---- A+ checklists (gates with no column in this file are marked
     not-applicable rather than failed) ---- */
  const conExp = con.v >= 110 || ["EXPANDING", "IGNITION"].includes(con.state);
  /* Con Score gate for the A+ checklist additionally accepts PRIMED — a
     build-up state that hasn't expanded yet but qualifies as "loaded." */
  const conGateOK = conExp || con.state === "PRIMED";
  /* EM displacement validation: a session move that exceeds the Expected
     Move is mechanical proof of displacement — institutions are repricing,
     not rotating. Only computable when the EM column is present (Futures
     tier). Feeds the displacement flag alongside Momo continuation and Con
     Score expansion.
     v2026-06-19: momoBreakoutOK names Momo's sole remaining role per house
     rule — breakout confirmation. It carries no lean/scoring weight (see
     `votes` above); it only confirms or fails to confirm that a move is
     continuing, feeding `displacement` exactly as before. */
  const emPct = Number.isFinite(em) && Number.isFinite(mark) && mark !== 0 ? (em / Math.abs(mark)) * 100 : NaN;
  const emBreak = Number.isFinite(emPct) && emPct > 0 && Number.isFinite(pct) && Math.abs(pct) >= emPct;
  const momoBreakoutOK = momo.cont;
  const displacement = momoBreakoutOK || conExp || emBreak;

  /* ============================================================
     v2026-06-20c — relationship-aware A+ gate redesign.
     House directive: "the A+ grading logic should not just [be] the
     thumbs up but rather understand the relationship between the
     column defs... this creates a real-time bias and setup."
     Per the data dictionary, SMRTx's own "Strong Bullish" definition
     is not "value >= 65" in isolation — it's "Bias Rank >= 65 AND
     displacement confirmed AND sigma aligned." Treating SMRTx as one
     more independent checklist line alongside the things that build
     it (IFP, Con Score, displacement) was circular and under-used what
     the dictionary already specifies as a compound relationship.
     PI+ / POI ("does participation support price movement") are in
     the dictionary's required AI-instructions list (#4) but were never
     wired into the gate checklist at all — a real coverage gap, now
     closed.
     Design (confirmed with house, additive-only per explicit
     instruction — this NEVER blocks an A+ that the old model would
     have allowed; it only changes what counts as a genuine PASS):
       Cluster 1 — STRUCTURAL ALIGNMENT (Daily, Weekly, WITS)
         These three are the same underlying claim — "is the higher-
         timeframe trend real" — asked three ways. Scored as mutual
         agreement, not three independent coin-flips: full 3-way
         alignment is materially stronger evidence than any two of the
         three passing while the third is silent/against.
       Cluster 2 — INSTITUTIONAL CONFIRMATION (IFP, Con Score, SMRTx,
         PI+, POI)
         SMRTx crossing its threshold counts as a genuine "pass" with
         full weight when it's actually BACKED by the things the
         dictionary says build institutional conviction (IFP trigger,
         Con Score expansion/primed, PI+ confirming participation) —
         not just because the raw number crossed 65/35 in isolation.
         PI+ and POI are now read and contribute here for the first
         time.
       Cluster 3 — LIQUIDITY / TIMING CONTEXT (LWC, STRSI, RS)
         Unchanged in spirit from the old soft gates — still never
         blocks A+ on its own — but now reported as a cluster strength
         rather than three unrelated lines, since LWC/STRSI/RS together
         describe one thing: can you actually get filled with edge.
     The CORE_GATE_IDX/SOFT_GATE_IDX failure-budget mechanism (<=2 core
     failures tolerated) is UNCHANGED — same checklist array shape
     ([label, passed, applicable]), same index-based soft-tag rendering
     in the Setup tab, same tolerance threshold. What changed is HOW
     each line's `passed` boolean gets computed, not the scaffolding
     around it. ============================================================ */

  /* --- Cluster 1: Structural Alignment (D / W / WITS as one relationship) ---
     v2026-06-20d correction: the first version of this redesign made each
     checklist line's `passed` boolean REQUIRE full cluster agreement (e.g.
     "Daily aligned" became `pD===1 && structAligned`), which is STRICTER
     than the original independent check and could fail a row that used to
     pass — directly violating the house instruction "keep it purely
     additive." Fixed: every longChecks/shortChecks line below is restored
     to its EXACT original independent condition. The cluster relationships
     are computed here and reported separately (structConfluence /
     institConfluence, returned on the graded object) as informational
     strength indicators — never substituted into a line's pass/fail. */
  const structAlignedLong  = pD === 1  && (pW === 1  || !wPresent) && wits.label === "DRIVING+";
  const structAlignedShort = pD === -1 && (pW === -1 || !wPresent) && wits.label === "DISTRIBUTION";

  /* --- Cluster 2: Institutional Confirmation (IFP / Con Score / SMRTx / PI+ / POI) ---
     PI+ thresholds per data dictionary: >1.5 strong conviction,
     0.75-1.5 constructive participation, <0 not confirming price.
     POI is the 5-day version of the same ratio — slower, swing context.
     PI+/POI were parsed (num(r.pi), num(r.poi)) but never used in gate
     logic anywhere before this — a real coverage gap vs. the data
     dictionary's AI-instructions list (#4: "Use PI+, POI, OI-, and OI/V
     to confirm participation"), now closed via the confluence count below. */
  const piConfirmsLong   = Number.isFinite(pi)  ? pi  >= 0.75 : null; // null = no column
  const piConfirmsShort  = Number.isFinite(pi)  ? pi  < 0     : null;
  const poiConfirmsLong  = Number.isFinite(poi) ? poi >= 0.75 : null;
  const poiConfirmsShort = Number.isFinite(poi) ? poi < 0     : null;
  const ifpConfirmsLong  = ifp.dir === 1;
  const ifpConfirmsShort = ifp.dir === -1;
  /* institBacking counts how many OTHER signals corroborate SMRTx's read —
     matches the dictionary's compound "Strong Bullish/Bearish" SMRTx
     definition (rank + displacement + sigma-aligned). Informational only:
     feeds institConfirmedLong/Short below, which is a NEW display field,
     not a replacement for the original independent SMRTx>=65 check still
     used in longChecks/shortChecks. */
  const institBackingLong  = [ifpConfirmsLong,  conGateOK, piConfirmsLong  === true, poiConfirmsLong  === true].filter(Boolean).length;
  const institBackingShort = [ifpConfirmsShort, conGateOK, piConfirmsShort === true, poiConfirmsShort === true].filter(Boolean).length;
  const institConfirmedLong  = smrtx >= 65 && institBackingLong  >= 1;
  const institConfirmedShort = smrtx <= 35 && institBackingShort >= 1;

  /* --- Cluster 3: Liquidity / Timing Context (LWC / STRSI / RS) — soft, unchanged --- */
  const strsiOKLong = (strsi.stage === "EARLY" || strsi.stage === "EXP") && strsiDir === 1;
  const strsiOKShort = (strsi.stage === "EARLY" || strsi.stage === "EXP") && strsiDir === -1;
  const strsiApplicable = strsi.stage !== "—";
  const liqContextLong  = [lwc.v > 0, strsiOKLong, haveRS && rsPct > 60].filter(Boolean).length;
  const liqContextShort = [lwc.v < 0, strsiOKShort, haveRS && rsPct < 40].filter(Boolean).length;

  /* ---- A+ / A+ SHORT checklist ----
     Gate order (house spec, unchanged): Daily aligned -> Weekly aligned ->
     STRSI -> RS -> LWC -> WITS -> Con Score -> SMRTx.
     v2026-06-20c/d: every line below is IDENTICAL to the pre-redesign
     independent condition — confirmed additive-only, nothing that passed
     before can fail now. The relationship/confluence data computed above
     is exposed as new fields on the returned object (structConfluence,
     institConfluence, liqConfluence below) for the Setup tab to surface
     as "why this is/isn't A+" context, without changing the gate math
     itself. STRSI and RS remain soft (never count toward the failure
     budget). The "core six" still tolerate up to 2 failures: 0-1 -> A+,
     2 -> still A+, 3+ -> not A+. Unchanged. */
  const longChecks = [
    ["Daily aligned bull", pD === 1, true],
    ["Weekly aligned bull", pW === 1, wPresent],
    ["STRSI EARLY/EXP (bull)", strsiOKLong, strsiApplicable],
    ["Positive rel. strength (RS > 60)", rsPct > 60, haveRS],
    ["LWC > 0", lwc.v > 0, lwcPresent],
    ["WITS = DRIVING+", wits.label === "DRIVING+", true],
    ["Con Score EXPANDING/IGNITION/PRIMED", conGateOK, true],
    ["SMRTx ≥ 65", smrtx >= 65, true],
  ];
  const shortChecks = [
    ["Daily aligned bear", pD === -1, true],
    ["Weekly aligned bear", pW === -1, wPresent],
    ["STRSI EARLY/EXP (bear)", strsiOKShort, strsiApplicable],
    ["Weak rel. strength (RS < 40)", rsPct < 40, haveRS],
    ["LWC < 0", lwc.v < 0, lwcPresent],
    ["WITS = DISTRIBUTION", wits.label === "DISTRIBUTION", true],
    ["Con Score EXPANDING/IGNITION/PRIMED", conGateOK, true],
    ["SMRTx ≤ 35", smrtx <= 35, true],
  ];
  const coreFails = (checks) => CORE_GATE_IDX.reduce(
    (n, i) => n + (checks[i][2] && !checks[i][1] ? 1 : 0), 0
  );
  const coreFailLong = coreFails(longChecks);
  const coreFailShort = coreFails(shortChecks);
  const aPlusLong = coreFailLong <= 2;
  const aPlusShort = coreFailShort <= 2;

  /* Relationship/confluence summary — informational, surfaced in the Setup
     tab as the "why" behind the verdict. Reports each cluster's internal
     agreement (0-3 scale) for whichever side (long/short) the row's lean
     points toward, so the UI can show ONE coherent confluence read rather
     than two parallel long/short numbers when only one side is relevant. */
  const structConfluence = lean === 1 ? (structAlignedLong ? 3 : [pD===1, pW===1 || !wPresent, wits.label==="DRIVING+"].filter(Boolean).length)
    : lean === -1 ? (structAlignedShort ? 3 : [pD===-1, pW===-1 || !wPresent, wits.label==="DISTRIBUTION"].filter(Boolean).length)
    : 0;
  const institConfluence = lean === 1 ? institBackingLong : lean === -1 ? institBackingShort : 0;
  const liqConfluence = lean === 1 ? liqContextLong : lean === -1 ? liqContextShort : 0;
  const institConfirmed = lean === 1 ? institConfirmedLong : lean === -1 ? institConfirmedShort : false;

  const partCoverage = [ifpPresent, Number.isFinite(pi), Number.isFinite(poi), Number.isFinite(oiv), Number.isFinite(vd), oistate !== 0].filter(Boolean).length;
  const mixedTF = pD !== 0 && pW !== 0 && pD !== pW;
  const noTradeReasons = [];
  if (wits.label === "SIDELINE" || wits.label === "RESET") noTradeReasons.push("no valid phase");
  if (con.state === "STABLE") noTradeReasons.push("Con Score stable");
  if (mixedTF) noTradeReasons.push("D/W conflict");
  if (partCoverage >= 3 && part < 40) noTradeReasons.push("thin participation");

  let verdict, vlean;
  if (noTradeReasons.length >= 1 && !aPlusLong && !aPlusShort) {
    verdict = "NO-TRADE"; vlean = 0;
  } else if (aPlusLong) { verdict = "A+ LONG"; vlean = 1; }
  else if (aPlusShort) { verdict = "A+ SHORT"; vlean = -1; }
  else if (smrtx >= 65 && lean === 1) { verdict = "WATCH · LONG"; vlean = 1; }
  else if (smrtx <= 35 && lean === -1) { verdict = "WATCH · SHORT"; vlean = -1; }
  else { verdict = "DEVELOPING"; vlean = lean; }

  /* referee call */
  const ref = refereeCall(verdict, vlean, strsi, displacement, momo);

  /* EM target zone */
  let emHigh = NaN, emLow = NaN;
  if (Number.isFinite(em) && Number.isFinite(mark)) { emHigh = mark + em; emLow = mark - em; }

  return {
    symbol: sym,
    sector: String(r.sector || "").trim(),
    lean, vlean, verdict, sigma: sigmaFinal,
    pillars: { part: Math.round(part), conv: Math.round(conv), trend: Math.round(trend), rs: Math.round(rs), liq: Math.round(liq) },
    longChecks, shortChecks, noTradeReasons, displacement,
    coreFailLong, coreFailShort, optAdj, vdAdj, ivAdj,
    wits, ifp, momo, con, lwc, strsi, bas, microTiming, momoBreakoutOK,
    smrtx, cwopen, pct, vd, vpct, pi, poi, oiv, oistate, ivp, implvol, ifpPresent, extchng, volume, oint,
    /* v2026-06-20c: relationship/confluence summary — informational only,
       does not feed coreFails/aPlusLong/aPlusShort (see note above
       longChecks). structConfluence/institConfluence/liqConfluence are
       0-3 scales reporting how many signals in each cluster agree, for
       whichever direction the row's overall lean points toward.
       institConfirmed additionally answers the dictionary's compound
       SMRTx question (rank + backing) as a single boolean for display. */
    structConfluence, institConfluence, liqConfluence, institConfirmed,
    piConfirmsLong, piConfirmsShort, poiConfirmsLong, poiConfirmsShort,
    tf: {
      d: pD, w: pW, h2: p2h, m15: p15,
      dP: D.phase, wP: W.phase, h2P: H2.phase, m15P: M15.phase,
    },
    em, mark, emHigh, emLow, emBreak,
    ref, rsPct: Math.round(rsPct), haveRS, rs5, rs10, rs21, rsSlope,
    _raw: r,
  };
}

/* House ranking — CSV-processed opportunities, ranked by:
   institutional activity (Participation pillar) -> convexity (Con Score
   strength) -> trend health (Trend pillar) -> relative strength
   (RS pillar) -> underlying liquidity (Liquidity pillar), in that exact
   priority order. Each tier is compared in sequence; ties cascade down
   to the next pillar rather than blending into one composite number —
   this keeps "ranked by institutional activity first" literally true
   instead of averaging it away. Final tiebreaker is Σ, then symbol. */
function houseRankCompare(a, b) {
  const keys = ["part", "conv", "trend", "rs", "liq"];
  for (const k of keys) {
    const diff = (b.pillars[k] || 0) - (a.pillars[k] || 0);
    if (diff !== 0) return diff;
  }
  if (b.sigma !== a.sigma) return b.sigma - a.sigma;
  return a.symbol.localeCompare(b.symbol);
}

function refereeCall(verdict, lean, strsi, displacement, momo) {
  if (verdict === "A+ LONG")
    return { card: "play", text: `Clean break upfield — advantage long. ${displacement ? "Displacement confirmed, play on." : "Watch for the displacement before you commit."}` };
  if (verdict === "A+ SHORT")
    return { card: "play", text: `Possession lost at the back — advantage short. ${displacement ? "Displacement confirmed, play on." : "Wait for the breakdown to confirm."}` };
  if (verdict.startsWith("WATCH"))
    return { card: "caution", text: `Smart money is on the ball but the play hasn't developed. ${displacement ? "Half a step from a card." : "No displacement yet — keep the whistle in your pocket."}` };
  if (verdict === "DEVELOPING")
    return { card: "caution", text: `Build-up play. Signals leaning ${lean === 1 ? "long" : lean === -1 ? "short" : "neutral"} but the confluence isn't set. Let it develop.` };
  return { card: "stop", text: "Whistle blown — no advantage on the field. Hold your position and wait for a cleaner phase." };
}

/* ---------- tiered sample data (the desk funnel: macro → sectors → stocks) ---------- */
const SAMPLE_MACRO = `Quote on 6/6/26 16:00:00

Futures
Symbol,Sector,Momo,EM,Mark,%Change,%C-WOPEN,BAS,IV+,Impl Vol,-V%,VD%,Volume,Open.Int,OI-,OI/V,PI+,POI,IFP,SMRTx,Con score,WITS,STRSI,LWC,RS5,RS10,RS21,15m,2hr,D,W
/ES[M26],Equity Index,C2BO,42.5,5612.25,+0.84%,1.45%,0.0,35.0,12.40%,1.31,3.1,"1,450,000","2,100,000",LOADING,1.4,2.1,1.8,↑(TRIG),72.0,EXPANDING,DRIVING+,EARLY +8,2.0,84.0,79.0,71.0,3,3,3,2
/NQ[M26],Equity Index,CYBO,178.0,19840.5,+1.12%,1.9%,0.0,41.0,15.10%,1.5,4.4,"980,000","540,000",NEW,1.9,2.6,2.2,↑(TRIG),58.0,PRIMED,DRIVING+,EXP +7,3.0,91.0,88.0,82.0,3,3,3,3
/CL[N26],Energy,C2BD,1.85,71.40,-1.90%,-1.3%,0.0,40.0,28.00%,1.5,-2.8,"410,000","330,000",EXITS,1.1,-0.8,-0.5,↓(TRIG),28.0,EXPANDING,DISTRIBUTION,EXP -7,-2.0,18.0,22.0,30.0,1,1,1,1
/GC[Q26],Metals,TYBO,28.0,2412.0,+0.22%,0.3%,0.0,38.0,16.20%,1.3,0.6,"210,000","460,000",LOADING,1.2,0.6,0.4,↑(TRIG),55.0,STABLE,RECOVERY,EARLY +5,1.0,62.0,55.0,48.0,3,2,3,2
/ZB[M26],Bonds,TBD,0.9,118.60,-0.15%,-0.2%,0.0,29.0,9.10%,1.0,-0.3,"180,000","720,000",LOADING,0.6,-0.2,0.1,—,49.0,STABLE,SIDELINE,—,-1.0,44.0,47.0,52.0,1,1,1,1
$DXY,Dollar,TBD,0.3,98.40,-0.35%,-0.5%,0.0,30.0,7.00%,1.0,-1.1,"0","0",-,N/A,N/A,N/A,↓(TRIG),38.0,EXPANDING,DISTRIBUTION,EXP -5,-1.0,34.0,38.0,42.0,1,1,1,4`;

const SAMPLE_SECTOR = `Quote on 6/6/26 16:00:00

SPDR Sector
Symbol,Sector,Momo,EM,Mark,%Change,%C-WOPEN,BAS,IV+,Impl Vol,-V%,VD%,Volume,Open.Int,OI/V,OI-,PI+,POI,Con score,SMRTx,WITS,STRSI,LWC,RS5,RS10,RS21,15m,2hr,D,W
XLK,Information Technology,CYBO,4.2,242.10,+1.10%,1.6%,0.0,40.0,18.00%,1.3,2.4,"12,000,000",0,N/A,-,N/A,N/A,EXPANDING,74.0,DRIVING+,EARLY +7,2.0,88.0,82.0,76.0,3,3,3,3
XLF,Financials,TYBO,2.1,46.30,+0.70%,1.1%,0.0,32.0,15.00%,1.2,1.6,"30,000,000",0,N/A,-,N/A,N/A,PRIMED,66.0,DRIVING,EARLY +5,1.0,71.0,66.0,60.0,3,2,3,2
XLV,Health Care,T2BO,2.8,138.40,+0.45%,0.8%,0.0,28.0,13.00%,1.1,1.0,"9,000,000",0,N/A,-,N/A,N/A,EXPANDING,62.0,RECOVERY,EARLY +4,1.0,64.0,58.0,55.0,2,3,3,3
XLY,Consumer Discretionary,TBO,3.0,201.20,+0.35%,0.6%,0.0,30.0,16.00%,1.0,0.7,"6,500,000",0,N/A,-,N/A,N/A,PRIMED,58.0,DRIVING,EARLY +3,1.0,60.0,57.0,54.0,3,3,2,3
XLE,Energy,C2BD,2.4,88.10,-1.40%,-1.6%,0.0,35.0,24.00%,1.4,-2.2,"22,000,000",0,N/A,-,N/A,N/A,EXPANDING,28.0,DISTRIBUTION,EXP -6,-2.0,18.0,22.0,26.0,1,1,1,1
XLU,Utilities,T2BD,1.6,72.30,-0.90%,-1.1%,0.0,26.0,14.00%,1.1,-1.4,"14,000,000",0,N/A,-,N/A,N/A,PRIMED,32.0,WEAKENING,LATE -4,-1.0,30.0,34.0,38.0,1,1,1,1
XLP,Consumer Staples,TBD,1.2,78.40,-0.55%,-0.7%,0.0,22.0,11.00%,1.0,-0.8,"8,000,000",0,N/A,-,N/A,N/A,EXPANDING,34.0,DISTRIBUTION,EXP -3,-1.0,33.0,36.0,40.0,1,1,1,4`;

const SAMPLE_STOCKS = `Quote on 6/8/26 16:00:00

TOP5
Symbol,Sector,Momo,EM,Mark,%Change,%C-WOPEN,BAS,IV+,Impl Vol,-V%,VD%,Volume,Open.Int,OI-,OI/V,PI+,POI,IFP,SMRTx,Con score,WITS,STRSI,LWC,RS5,RS10,RS21,15m,2hr,D,W
NVDA,Information Technology,CYBO,9.5,138.20,+1.80%,2.3%,0.1,45.0,38.00%,1.4,4.1,"180,000,000",0,-,N/A,N/A,N/A,↑(TRIG),76.0,EXPANDING,DRIVING+,EARLY +8,2.0,90.0,85.0,78.0,3,3,3,3
MSFT,Information Technology, ,7.2,410.50,+0.60%,0.9%,0.1,42.0,28.00%,1.1,1.8,"30,000,000",0,-,N/A,N/A,N/A,↑(TRIG),62.0,PRIMED,DRIVING+,EARLY +5,1.0,80.0,74.0,70.0,3,3,3,3
JPM,Financials,T2BO,4.1,225.30,+0.50%,0.8%,0.0,30.0,20.00%,1.1,1.5,"12,000,000",0,-,N/A,N/A,N/A,↑(TRIG),64.0,EXPANDING,DRIVING,EARLY +4,1.0,70.0,65.0,60.0,3,2,3,2
UNH,Health Care,TYBO,9.0,512.00,+0.40%,0.7%,0.1,34.0,22.00%,1.0,1.2,"4,000,000",0,-,N/A,N/A,N/A,↑(TRIG),67.0,PRIMED,DRIVING+,EARLY +3,1.0,66.0,60.0,57.0,3,3,3,3
XOM,Energy,C2BD,3.2,108.40,-1.70%,-2.0%,0.1,38.0,26.00%,1.4,-3.2,"20,000,000",0,-,N/A,N/A,N/A,↓(TRIG),26.0,EXPANDING,DISTRIBUTION,EXP -7,-2.0,16.0,20.0,24.0,1,1,1,1
CVX,Energy,T2BD,2.6,152.10,-1.10%,-1.3%,0.1,32.0,22.00%,1.2,-1.8,"9,000,000",0,-,N/A,N/A,N/A,↓(TRIG),33.0,PRIMED,DISTRIBUTION,EXP -5,-1.0,22.0,26.0,30.0,1,1,1,1
NEE,Utilities,TBD,1.9,68.40,-0.80%,-1.0%,0.1,28.0,18.00%,1.1,-1.2,"11,000,000",0,-,N/A,N/A,N/A,↓(TRIG),34.0,EXPANDING,WEAKENING,LATE -4,-1.0,30.0,33.0,36.0,1,4,1,4
WMT,Consumer Staples, ,3.0,82.30,+0.10%,0.2%,0.0,24.0,14.00%,1.0,0.3,"7,000,000",0,-,N/A,N/A,N/A,—,48.0,STABLE,SIDELINE,—,0.0,50.0,48.0,52.0,4,4,4,4`;

const SAMPLE_SCANS = `Quote on 6/11/26 13:23:20

D-D2Ux
Symbol,Sector,Momo,Mark,%C-WOPEN,LWC,%Change,EXT %Chng,IV+,Impl Vol,-V%,VD%,Con score,SMRTx,WITS,STRSI,RS5,RS21,D,W
AFL,Financials, ,117.900,0.49%,1.0,+0.67%,0.00%,36.0,21.22%,0.19%,1.06,STABLE,58.0,DRIVING+,-,100.0,100.0,3,3
.AFL260626C120,, ,1.000,52.24%,-1.0,+27.50%,0.00%,NaN,19.02%,N/A%,NaN,STABLE,NaN,SIDELINE,-,NaN,NaN, , 
CVS,Health Care,CYBO,99.135,3.32%,1.0,+1.14%,-0.37%,21.0,30.37%,-9.29%,1.21,PRIMED,86.0,DRIVING+,-,100.0,100.0,3,3
.CVS260626C101,, ,1.695,94.74%,1.0,+94.74%,0.00%,NaN,30.82%,N/A%,NaN,STABLE,NaN,SIDELINE,-,NaN,NaN, , 
M,Consumer Discretionary,TBO,24.085,9.48%,3.0,+3.99%,+1.81%,31.0,46.14%,-3.71%,0.98,STABLE,55.0,DRIVING+,-,100.0,100.0,3,3
MRK,Health Care, ,121.410,0.46%,3.0,+1.95%,+0.75%,loading,29.54%,-7.02%,0.88,STABLE,2.0,DRIVING+,EARLY 8,100.0,100.0,3,3`;

const SAMPLES = { macro: SAMPLE_MACRO, sector: SAMPLE_SECTOR, stocks: SAMPLE_STOCKS, scans: SAMPLE_SCANS };

/* Roll-the-Tape session metadata — shared by the manual rollTape() prompts
   and the auto-fire effect (see AUTO_TAPE_SLOTS above for the ET clock
   windows each one corresponds to). */
const SESSION_LABELS = { am: "AM MACRO", lunch: "LUNCH MACRO", pm: "PM MACRO" };
const SESSION_GUIDE = {
  am: "Pre-market + opening macro (08:50–10:10 ET window). Overnight gaps, pre-market movers, gap-and-go vs fade bias, opening-drive key levels.",
  lunch: "Midday macro (11:50–13:10 ET window). Whether morning bias held, lunchtime liquidity lull, sector rotation developing, afternoon setups forming.",
  pm: "Afternoon + close macro (14:50–16:00 ET) into after-hours. Last-hour positioning, closing levels, setups triggered, after-hours movers, next-session watch list.",
};

/* Build tag — bump with each shipped version. Shown small in the header so
   you can confirm desktop and mobile are rendering the SAME artifact
   version (there's no separate "deployment" — both devices must have this
   exact code open for storage sync / auto-tape / etc. to match). */
const BUILD_VERSION = "v2026-06-20k";

/* ── Safe storage wrapper ────────────────────────────────────────────────────
   window.storage is a claude.ai artifact-only API. On any real deployed
   browser (Netlify, etc.) it is undefined — any direct call to
   window.storage.get/set/delete throws TypeError and crashes the whole app.
   This wrapper replaces every call site: get() always resolves null (no data),
   set/delete silently succeed. localStorage remains the sole persistence layer
   in production, which is the correct fallback since window.storage was always
   a "bonus cross-device sync" layer, not the primary store. */
const WS = {
  get: (...args) => window.storage
    ? window.storage.get(...args)
    : Promise.resolve(null),
  set: (...args) => window.storage
    ? window.storage.set(...args)
    : Promise.resolve(null),
  delete: (...args) => window.storage
    ? window.storage.delete(...args)
    : Promise.resolve(null),
};

/* ── Claude API endpoint router (v2026-06-20k) ──────────────────────────────
   In the claude.ai artifact sandbox the app runs on claudeusercontent.com,
   where direct POSTs to api.anthropic.com are CORS-whitelisted (the key is
   injected by the platform). On a real deployed host (Netlify, etc.) those
   direct calls are CORS-blocked, so every request must route through the
   serverless proxy at /api/claude, which attaches ANTHROPIC_API_KEY
   server-side and forwards to api.anthropic.com.
   REQUIRED: netlify.toml must redirect  /api/claude  ->
   /.netlify/functions/claude-proxy  (200 rewrite, not 301), and the proxy
   must stream responses through when the request body has stream:true. */
const IN_CLAUDE_SANDBOX =
  typeof window !== "undefined" &&
  /(^|\.)claudeusercontent\.com$|(^|\.)claude\.ai$/.test(window.location.hostname);
const CLAUDE_API_URL = IN_CLAUDE_SANDBOX
  ? "https://api.anthropic.com/v1/messages"
  : "/api/claude";

/* Embedded assets — base64-encoded so the artifact is fully self-contained
   with no external image dependencies. */
/* #TheStrat In-Force + Actionable patterns reference image — injected into chart
   analysis prompts so Claude can cross-reference candle formations visually */
const STRAT_PATTERNS_B64 = "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kDkkdD+goWKNH3LGoO0LkKAcen0qaigCBYo0ACooUHIAAAHOT+tKIow7NsXcwwzY5I9/yqaigCDyowWIRdzEEnAyTxyfyH5UCGLcreUmVXaDtHA9B7VPRQAUUUUAFFFFABRRRQAlUdO/4/NU/wCvof8AomOr1UdO/wCPzVP+vof+iY6F1Av0UUUAFFFFAGfof/IA07/r1i/9BFaFZ+h/8gDTv+vWL/0EVoUMAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooASqOnf8fmqf9fQ/9Ex1eqhp3/H5qn/X0P8A0THQuoGhRRRQAUUUUAZVto01raw28esX2yJFRcpBnAGP+edS/wBnXP8A0GL3/viH/wCN1oUU+ZhYz/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6lsbEWXnn7RNO00nmM0u3IO1VwNoHGFH5mrdFF2AUUUUgCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/2Q==";

const VAG_LOGO_SRC = "data:image/png;base64,/9j/4AAQSkZJRgABAgAAAQABAAD/wAARCAYgArwDACIAAREBAhEB/9sAQwAIBgYHBgUIBwcHCQkICgwUDQwLCwwZEhMPFB0aHx4dGhwcICQuJyAiLCMcHCg3KSwwMTQ0NB8nOT04MjwuMzQy/9sAQwEJCQkMCwwYDQ0YMiEcITIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMAAAERAhEAPwDwA0lFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAtJRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAtFJRQB9/0UUUAfAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUtFACUtJRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUtFACUUUUAFFFFABRRRQAUUUUAFFLRQAlFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAff9FFFAHwBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFLQAlFFLQAlFFFABRRRQAUUUUAFFFFABRRS0AJRRS0AJRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH3/RRRQB8AUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRS0AJRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRS96SgD7/ooooA+AKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAPv+iiigD4AooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigApaSigAoopaAEooooAKKKKACiiigAooooAKKKKACiiigAopaSgAooooAKKKKACiiigAooooAKWkpaAEooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKWiigD7+ooooA+AKKKKACiiigAooooAKKKKACiiigAooooAKKKKAFpKKKACiiigAoopaAEooooAKKKKACiiigAoopaAEooooAKKKKACiiigAooooAKKKKAFopKWgBKKKKACiiigAoopaAEooooAKKKKACiiigAooooAKKKKACiiloASiiigAooooAKKKKACilpKACiiigAooooAKKKKACiiigApaSigAooooAKKKKACiiigAooooAKWkooA+/6KKKAPgCiiigAooooAKKKWgBKWkpaACkoooAKKKKAFooooASiiigAooooAKWiigApKWkoAKKKKACloooASilpKACiiigApaSloAKKSigAooooAKWkooAWikooAKKKKAClpKKAFoopKACiiigApaSloAKKKSgAooooAKWkooAWiikoAKKKKACiiloAKKKSgAooooAKWkooAWiikoAKKKKACiiigApaSloASiiigAoopaAAUUlFABRRRQAUUUUAff9FFFAHwBRS0lABRRRQAUUUUALSUUUAFFFFABRRRQAUuaKKAEooooAKKKWgAooxRigBKKKKACiiloASloooASiiigAoopaACiiigBKKKKACiiloASloxRQAlFFFABRRS0AJS0UYoASiiigAooooAKWkooAKKKKACiiigApaKSgBaSlpKACiiigApaKKACkoooAKKKKACloooAKKSigAooooAKWkooAWikooAKKKKAClpKKACiiigAooooAKKKXFAH39RRRQB8AGiiigAooooAKKKKACiiigAooooAKWkooAKKKKACiiigApaSloASiiigAooooAKKWkoAKKKKACiiigAoopaAEooooAKKKKAClpKKAFpKWkoAKKKKACiiigAooooAKKKKACiiigApaSigAooooAKKKKAClpKKACiiigAooooAKKKKACiiigAooooAKKWigBKKKKACiiigAooooAKKKKACiiigApaSigAooooAKKKKACiiigD7/AKKKKAPgHvSUd6KACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigApaSigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoopaAPv6iiigD4AooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigA70tFFAH39RRRQB8AUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRS0lABRRRQAUUUUAFFLSUAFFFFABRRS0AJRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAff9FFFAHwBRRRQAUUUUAFFFFABRRRQAUUUtACUUUUAFLRRQAlFLSUAFFFFABRRS0AJS0UlABRRRQAUUUtACUUtJQAUUUUAFFFLQAlFLRQAlFFFABRRRQAUtJS0AJRRRQAUUUUAFFLSUAFFFFABRRRQAUtJS0AJRRRQAUUUUALRSUtACUUUUAFFFFABS0lLQAlFFFABRRRQAUUUtACUUUUAFFFFABS0lLQAlFFFABRRRQAUUUUAFFFFABRRRQB9/wBFFFAHwBRRRQAUUUUAFFFLQAUUlLQAUlFFABRRRQAtFFFABSUUUAFFFLQAUZpKWgAoopKACiiigBaKKKACiikoAKKKKACloooAKKSigAooooAKWkpaACiikoAKKKKAClpKWgAooooASiiigApaSloAKKKSgAooooAKWkpaACiiigBKKKKACiiloAKKKSgAooooAKWkpaACiiigBKKKKAClpKKAFopKWgBKKKKACiiloASlpKKAFpKKKACiiigD7/ooooA+AD1opaSgAooooAKWkooAKWiigBKKKKAClooxQAUUYoxQAlFFFABRRS0AFFGKMUAJRRRQAUUUtABRRRQAlFFFABS0lLQAUUUYoASiiigAooooAWiijFACUUUUAFFFLQAUUUYoAKSiigAoopaAEpaKMUAFJRRQAUUUUAFLRRQAUlLSUAFFFFABS0UUAFJS0lABRRRQAUtFFABRRSUAFFFFABS0lLQAUUUlABRRRQAUtJS0AJS0lFABRRRQAUtJRQB9/wBFFFAHwD3pKXvSUAFFFFABRRRQAUUUUAFFFFABRRS0AJRRRQAUUUUAFLSUtACUUUUAFFFFABRRS0AJRRRQAUUUUAFLSUtACUtFJQAUUUUAFLSUUAFFFFABRRRQAUUUtACUUtJQAUUUUAFLSUtACUUtJQAUUUUAFFFFABRS0lABRRRQAUUUUAFFLSUAFFFFABRRRQAUUtJQAUUUUAFFFFABS0lFABRRRQAUUUUAFFLSUAFFFFABRRRQAUUUUAff9FFFAHwBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFLSUUAFFFFABRRRQAUUUtACUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRS0AJRRRQAUUUUAFFFFABRRRQB9/wBFFFAHwBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFLSUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH3/RRRQB8AUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFLSUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB9/wBFFFAHwBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAtJS0lABRRRQAUUUUAFLRRQAlFFFABRRRQAUUUUAFFFFABRRRQAUtJRQAUUUUAFFFLQAUUlLQAlFFFABRRRQAUtFFACUUUUAFFFFABS0lLQAlFLSUAFFFFABS0UUAJRRRQAUUUUAFLRSUAFFFFABRRRQAUUUUAFFFFABRRRQAUtFFACUUtJQAUUUUAFFFLQAUlLSUAFFFFAH3/AEUUUAfAFFFFABRRRQAUUUUAFLSUUALSUUUAFFFFAC0UlLQAUlFFABRRRQAUtJS0AFJRRQAUUUUALRRRQAUlLSUAFFFFABS0UUAFJRS0AJRRRQAUtFFABRRRQAlFFFABS0lLQAUUUlABRRRQAUtFFABRRRQAlFFFABS0lLQAUUUlABRRRQAUtJS0AFFFFACUUUUAFLSUtABRRRQAlFLSUAFFFLQAUUUUAJRRRQAUUUUALRRRQAUlFFABRRS0Aff1FFFAHwBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAC0UmKWgBKKKKACiiloAKKMUUAJRRRQAUUUuKACiiigBKKKKAClpKWgAoooxQAlFFFABS0lFAC0UUYoAKSiigAooooAWiiigApKWkoAKKKKAFozRRigApKWkoAKKKKAClooxQAUlLSUAFFFFABS0UYoAKKKSgAoopaAEpaKMUAFFFJQAUUUUAFLRRigAoopKACiiigApaSloASloooASiiigApaKKAPv6iiigD4AooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiloASiiigAooooAKKKKACiiigAooooAKKKWgBKKKKACiiigAoopaAEopaSgAooooAKKKWgBKKKKACiiigAooooAKKKKACiiigAooooAKWkooAKKKKACiiigAopaSgAooooAKKKKAClpKKACiiigAooooAKKKKACiiigAooooAKWkpaAEooooAKKKKAFooooA+/qKKKAPgCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKWgBKKKKACiiigAoopaAEooooAKKKKACiiloASiiigAooooAKKKXtQAlFFFABRRRQAUUUUAFFFFABRRRQAUUUtACUUUUAFFFFABRRS0AJRRRQAUUUUAFFFFABRS0lABRRRQAUUUtACUUtFAH39RRRQB8AUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRS0lABRRRQAUtJRQAUUtJQAUUUUAFFFFABR0paSgAooooAKKKXFACUUtJQAUUUUAFFFFABRRS0AJRRRQAUUUUAFFFLQAl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AooooAWiiigBKKKKAFpKKKAFpKKWgApKWkoAKKKKACloooAKSlpKAFpKKWgBKWiigBKKWigBKKKKACloooAKSiigAooooAKKKWgAooooASiiigBaKSloASilooASiiloASloooAKKKSgBaSiigApe1JSigAooooAKSlpKAFopKKAFpKWigAoopKACiiloAKKKKAEooooAKKKKAFooooASiiigAooooAKWiigAopKKAFopKKACiiigD7/AKKKKAPgGkpaTvQAUUUUAFFLSUAFFFFABRRRQAtFJRQAUtJRQAUUUtABRSUUAFFFFAC0UlFAC0UlFABRRRQAUUUUAFLRRQAlFFFABRRRQAUtFJQAtFJRQAtJRRQAUUUtACUUUUAFFFFAC0UUlAC0lFFABRRRQAUtJS0AFFJRQAUUUUALSUUtABRSUUALSUUUAFFFLQAlLSUUAFFFFABRRS0AFFJRQAUUUUAFLSUtACUUUUAFFFFABRRRQAUUUUAff9FFFAHwBRRRQAUUUUAFFFFABRRRQAUUUtACUUtJQAUUUUAFLSUtACUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAtJRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABS0lFABRRRQAUUUUAFFFFABRRRQAUUUUAFLSUUAFFFFABRRRQAUUUUAFFFFABRRRQAUtJRQAUUUUAFFFFABRRRQAUUUUAff9FFFAHwBRRRQAUUUUAFFFFABRRRQAUtJRQAUUUUAFFFFABRRS0AJRRRQAUUUUAFFFLQAlFFFABRRRQAUUUUAFFFFABRRRQAUtJRQAUUUUAFFFFABRRRQAUUUUAFFFFABS0lFABRS0lABRRRQAUUUtACUUUUAFFFFABRRRQAUUtJQAUUUUAFFFLQAlFLSUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUtJQAtFFFAH39RRRQB8AUUUUAFFFFABRRRQAUtJS0AFFFJQAUUUUAFLSUUALRRSUAFFFFABS0lFAC0UUlABRRRQAUtJS0AFFFFACUUUUAFLSUUALRRSUAFFFFABRRRQAtFFFACUUUUAFFFLQAlLRRQAlFFFABRRRQAUtFFACUUUUAFFFFABS0UUAJRRRQAUUUUAFLSUtACUUUUAFFFFABRS0UAFJS0lABRRRQAUUUUALSUtJQAUUUUAFFFLQAUlFFABRRRQB9/wBFFFAHwBRS0lABRRRQAUUUtACUtFFABSUUUAFFFFAC0UUc0AFFFJQAUUUUAApaKKACkoooAKKKKAFooooAKSlpKACiiigBaKKKACiikoAKKKKAFooooAKKKSgAooooAKWiigAoopKACiiigApaSloAKM0UlABRRRQAUtFFABRRRQAlFFFABS0lLQAUUUUAJRRRQAUtJS0AFGaKSgAooooAKWkpaACiiigBKKKKAClpKKAFopKWgAoopKAClpKWgD7+ooooA+AO9FFFABRRRQAUtJS4oASloxRQAlFFFABS0UYoAKKMUUAJRRRQAUtJS0AFFFGKAEooooAKWkpaACijFFABSUUUAFLSUtABRRRQAlFFFABRRS0AFFFGKAEooooAKKKKAFoooxQAUlLSUAFLSUtACUtFGKACkpaSgAooooAWiijFABSUtJQAUUUUALRRRigApKKKACiiigBaKKKACiikoAKKKKAClooxQAUUUlABRRRQAUtJS0AFFJRQAUUUUAFFFLQB9/UUUUAfAFFFFABRRRQAUUUtACUUUUAFFFFABS0lLQAlFFFABRRRQAUtJS0AJRRRQAUUUUAFFFLQAUlLSUAFFFFABS0lLQAUlFFABRRRQAUUtFACUUtJQAUUUUAFLSUtABSUtJQAUUUUAFLSUtACUUUUAFFFFABRRS0AFJS0lABRRRQAUUUtABSUtFACUUUUAFFFFABRS0UAJRRRQAUUUUAFFFLQAlFFFABRRRQAUUtFACUUUUAFFFFABS0UUAff1FFFAHwBRRRQAUUUUAFFFFABRRRQAUUUUAFLSUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUtJQAUUUUAFFFFABRS0lABRRRQAUUUUAFFFFABRRRQAUUUUAFLSUtACUUUUAFFFFABRRS0AJRRRQAUUUUAFFFLQAlFFFABRRRQAUUUUAFFFFABRRRQAUUUtACUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUtJRQB9/wBFFFAHwBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFLSUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH3/RRRQB8AUUUUAFFFFABRRRQAUUUUAFFFLQAlFFFABRRRQAUUUtACUUUUAFFFFABS0lFABRRRQAUUUUAFLRRQAlFFFABRRRQAUtJS0AJRRRQAUUUUAFLSUUAFFFFABRRRQAUUUUAFFFFABRmiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoopaAEooooAKKKKACiiloASiiigAooooAKKKKACiiigApaSloA+/qKKKAPgCiiigAooooAKKKKACiiloASiiigAooooAKWkpaACiikoAKKKKACiiloAKKKSgAooooAKKKKAFpKWkoAKKKKAClpKKAFopKKACiiigAooooAWikpaAEooooAKKKWgAopKWgBKKKKACiiloASlopKACiiigAooooAKWiigBKKKKACiiigApaKSgAopaSgAooooAKWikoAWkoooAKKKKACiiloASilpKACiiigApaSloASiiigBaKKKAPv6iiigD4AooNFABRRRQAUUUUALRSUtABSUUUAFLSUtABRmiigAoopKACiiigBaKKKACikooAKKKKAFooooAKKKSgAooooAWiiigAoopKACiiigBaKKKACiiigBKKKKACloooAKKKKAEooooAWikpaACiiigBKKKKAClpKWgAooooASiiigApaSloAKM0UUAJRRRQAUtJS0AFFFFACUUUUAFLSUUALRmiigApKKKACiiloAKKKKAEooooAWkpaKAPv6iiigD4AooooAKKKKACiiloAKKKKAEooooAKWkpaACijFFACUUtJQAUtJS0AFFGKKAEopaSgApaSloAKKMUYoASiiigApaSloAKKKMUAFJRRQAUtJS0AFFFGKACkoooAKWkpaACiijFABSUUUAFFFFAC0UUYoAKSlpKACiiigApaKMUAFFFJQAUUUtACUtJS4oAKSlpKACiiigBaKKMUAFFFJQAUUUUAFLRRigAozRSUAFFFFABS0lFABS0lFABRRRQAUUUUAff9FFFAHwBRRRQAUUUUAFFFFABRRRQAUUUUAFFLRQAlFFFABRRRQAUtJS0AFJRRQAUUUUAFLSUtABSUUUAFFFFABRRS0AJRS0lABRRRQAUtJS0AJRS0lABRRRQAUUUUAFFLSUAFFFFABS0lFAC0UUlABRRRQAUtJS0AJRS0lABRRRQAUtJRQAUUUUAFFFFABRRRQAUtFJQAUUUUAFFFFABRRRQAUUUUAFFFFABRRS0AJRRRQAUUUUALRRRQB9/UUUUAfAHeilpKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoopaAEooooAKKKKAClpKKACiiigAooooAKKKWgBKKKKACiiigAoopaAEooooAKKKKACiiloASiiigAooooAKKKWgBKKKKACiiigApaSigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoopaAPv6iiigD4AooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAClpKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKWkooAKKKKAPv8AooooA+AKKWigBKKKKACiiigAooooAKKWkoAKKKKACiiigAooooAKKKKACiiigApaSigAooooAKM0UUAFFFLQAlFFFABRRRQAUtJRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUtJQAUtJS0Aff1FFFAHwBRRRQAUUUUAFFFFABS0lFABRS0lABRRRQAUtJS0AFFFJQAUUUUAFLSUUAFFLSUAFFFFABRRRQAtFFFACUUUUAFFFLQAlLRSUAFFFFABRRRQAUtFJQAUUUUAFFFFABS0lLQAlFFFABRRRQAUUUUAFFFFABRRRQAUtJS0AJRRRQAUUUUAFLSUtACUUUUAFFFFABS0lFABRRRQAUUUUAFFFFABRS0lABRRRQAUUUUAFFFFABRRRQB9/0UUUAfANJS0lABRRRQAUUUUAFLSUt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";
const STRAT_CHART_SRC = "data:image/jpeg;base64,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kDkkdD+goWKNH3LGoO0LkKAcen0qaigCBYo0ACooUHIAAAHOT+tKIow7NsXcwwzY5I9/yqaigCDyowWIRdzEEnAyTxyfyH5UCGLcreUmVXaDtHA9B7VPRQAUUUUAFFFFABRRRQAlUdO/4/NU/wCvof8AomOr1UdO/wCPzVP+vof+iY6F1Av0UUUAFFFFAGfof/IA07/r1i/9BFaFZ+h/8gDTv+vWL/0EVoUMAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooASqOnf8fmqf9fQ/9Ex1eqhp3/H5qn/X0P8A0THQuoGhRRRQAUUUUAZVto01raw28esX2yJFRcpBnAGP+edS/wBnXP8A0GL3/viH/wCN1oUU+ZhYz/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6P7Ouf+gxe/98Q//G60KKLsDP8A7Ouf+gxe/wDfEP8A8bo/s65/6DF7/wB8Q/8AxutCii7Az/7Ouf8AoMXv/fEP/wAbo/s65/6DF7/3xD/8brQoouwM/wDs65/6DF7/AN8Q/wDxuj+zrn/oMXv/AHxD/wDG60KKLsDP/s65/wCgxe/98Q//ABuj+zrn/oMXv/fEP/xutCii7Az/AOzrn/oMXv8A3xD/APG6P7Ouf+gxe/8AfEP/AMbrQoouwM/+zrn/AKDF7/3xD/8AG6lsbEWXnn7RNO00nmM0u3IO1VwNoHGFH5mrdFF2AUUUUgCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/2Q==";

/* ---------- classical chart-pattern taxonomy (text-only reasoning aid) ----------
   v2026-06-19d: house directive — "It just to assist you identify patterns,
   that add context to the trade plan when available. Stacking confluence
   or no trade zones or invalidations... we are essentially doing the
   homework for them."
   This is NOT a new Trade Card field. It is reasoning material the model
   uses internally to sharpen the EXISTING fields (Strat Pattern, Stop,
   Target 1/2, Execution, One Sentence Read) when a classical structure is
   visible on the chart. #TheStrat (the other reference image) identifies
   the immediate 1-3 candle trigger; this taxonomy identifies the broader
   multi-candle structure that trigger sits inside — the two are
   complementary, not competing vocabularies, and confluence between them
   (a Strat trigger firing AT a classical pattern's breakout point) is a
   stronger signal than either alone.
   Kept text-only per house decision (no reference image — unlike the Strat
   sheet, the taxonomy is used as identification criteria + measurement
   rules, not visual matching). */
const CLASSICAL_PATTERNS_REFERENCE = `CLASSICAL CHART PATTERN TAXONOMY (identification + measurement reference)

Use this ONLY to inform field values already in the Trade Card/Referee Card templates — never as a new line item. If a classical pattern is visible:
- Strat Pattern field: note confluence if a #TheStrat trigger fires at the pattern's breakout/breakdown point (e.g. "2-1-2 Bullish Reversal at ascending triangle breakout — confluence").
- Stop: if the pattern's own structural invalidation (e.g. below a flag's lower boundary, below a head & shoulders' neckline) is sharper/closer than the generic swing-low stop, prefer it.
- Target 1/2: the Measurement Rule below is a legitimate source for a target level — use it as one of the candidate nearest-levels, same proximity-first logic as the existing Target Rule.
- Execution / One Sentence Read: a recognized pattern breaking out on WEAK volume is classic bull-trap/bear-trap territory — this is a legitimate reason to say WAIT or NO TRADE even if other signals look constructive. A clean pattern with confirming volume strengthens an existing PLAY ON read; it does not substitute for one.
If no classical pattern is clearly visible, say nothing about it — do not force-fit one onto an ambiguous chart.

BULLISH PATTERNS — breakout direction up:
Ascending Channel (parallel rising trendlines, long at support); Ascending Triangle (flat resistance/rising support, breakout above resistance, target = base height); Bull Flag (sharp pole + brief down-sloping flag, breakout above flag, target = pole length); Bull Pennant (pole + tight symmetrical wedge, target = flagpole measure); Bump & Run Reversal Bull (aggressive drop then reversal, breakout above downtrend line); Cup & Handle (rounded U bottom + brief handle drop, breakout above lip, target = cup depth — historically high reliability when handle retrace stays under ~50% of cup depth); Descending Broadening Wedge (diverging lower-low/lower-high lines, upside breakout); Double Bottom/W (two equal lows at support, breakout above neckline, target = valley depth); Double Bottom Adam & Eve (V-bottom then rounded U-bottom, breakout above intermediate peak); Diamond Bottom (broadening then converging, upside breakout, reversal after downtrend); Falling Wedge after downtrend (converging down lines, bullish reversal on breakout above resistance); Falling Wedge in uptrend (temporary correction, bullish continuation on upper boundary breach); Inverse Head & Shoulders (left shoulder/lower head/higher right shoulder, breakout above neckline, target = head height); Triple Bottom (three rejections of horizontal floor, breakout above resistance swing highs); Island Reversal Bullish (gap down, sideways cluster, gap up — long on validation of the second gap); Measured Move Up (impulse-correction-impulse, leg 2 target = leg 1 length); Rounded Bottom/Saucer (gradual seller-to-buyer shift, long-term accumulation); Wyckoff Accumulation (Selling Climax → Spring → Sign of Strength → Last Point of Support, entry on Spring or range back-test); Wyckoff Re-Accumulation (pause within uptrend absorbing supply, continuation breakout).

BEARISH PATTERNS — breakdown direction down:
Descending Channel (parallel falling trendlines, short at resistance); Descending Triangle (flat support/falling resistance, breakdown below support, target = back height); Bear Flag (pole down + minor up-flag, breakdown below flag, target = pole distance); Bear Pennant (pole + tight wedge, breakdown below support, target = pole projection); Bump & Run Reversal Bear (accelerated advance then collapse, short on trendline breakdown); Inverse Cup & Handle (inverted dome + upward handle, breakdown below lip); Ascending Broadening Wedge (diverging higher-high/higher-low, bearish breakdown below rising trendline); Double Top/M (two peaks at supply ceiling, breakdown below neckline, target = peak height); Double Top Adam & Eve (sharp peak + rounded secondary dome, short on intermediate valley breakdown); Diamond Top (expansion then converging breakdown, target = full diamond height); Rising Wedge after uptrend (converging up lines on decelerating volume, bearish reversal on breakdown); Rising Wedge in downtrend (corrective compression, bearish continuation on support failure); Head & Shoulders (left shoulder/higher head/lower right shoulder, breakdown below neckline, target = head-to-neckline height — moderate reliability, more reliable on daily/weekly than intraday); Triple Top (three rejections of resistance, short on breakdown below support pivot cluster); Island Reversal Bearish (gap up, distribution block, gap down — short on second gap validation); Measured Move Down (bearish impulse, countertrend flag, second impulse — leg 2 = leg 1 length); Parabolic Blow-Off Top (vertical acceleration on terminal volume, short on structural breakdown confirmation); Rounding Top (gradual buyer-to-seller shift, long-term distribution signature); Wyckoff Distribution (Buying Climax → Upthrust After Distribution → Sign of Weakness → Phase SY, entry on UTAD or breakdown test); Wyckoff Re-Distribution (pause within markdown, bearish continuation).

NEUTRAL / BILATERAL PATTERNS — trade the breakout direction, not the pattern itself:
Broadening Megaphone (diverging trendlines, higher highs AND lower lows — high-volatility regime, trade boundaries or breakout direction); Rectangle Trading Range (horizontal support/resistance, buy support / sell resistance until a real breakout); Symmetrical Triangle (converging lower-highs/higher-lows, equilibrium — trade the breakout direction, target = max triangle width, breakouts typically resolve 50-75% of the way to the apex).

MEASUREMENT RULE (objective target projection for any of the above):
Pattern height H = highest resistance point of the formation − lowest support point of the formation.
Bullish target = breakout price + H. Bearish target = breakdown price − H.
This is a legitimate candidate for Target 1 or Target 2 in the existing Target Rule — use it when it represents the nearest objective level in the trade's direction; do not let it override a nearer FVG or swing point.

VOLUME CONFIRMATION (informs Execution / WAIT vs NO TRADE):
Healthy pattern formation: volume should contract/decay WHILE the pattern is forming (flags, wedges, triangles) — this indicates supply/demand absorption, not exhaustion.
Healthy breakout: volume should EXPAND sharply at the breakout/breakdown point.
A breakout on WEAK or below-average volume has a meaningfully elevated chance of being a bull trap or bear trap (a false move that sweeps liquidity then reverses back inside the range) — treat this as a legitimate reason to favor WAIT over PLAY ON even if price has technically cleared the level.`;

/* V.A.G. watchlist universe — hardcoded from the three TOS exports.
   The tape fetches live prices for ALL of these regardless of CSV state,
   so it works even when no files are loaded (e.g. on mobile away from desktop). */
const VAG_FUTURES   = ["/MES","/MNQ","/MYM","/M2K","/MCL","/MGC","/SIL","/HG","/MBT","/MSL","/MXP","/ZN","/ZB","/TN","$DXY","/M6E","/M6B","/6J","/VXM","/MET"];
const VAG_SECTORS   = ["SPY","QQQ","IWM","DIA","XLK","XLF","XLE","XLV","XLI","XLY","XLP","XLU","XLB","XLRE","XLC","GLD","SLV","TLT","VIX","IBIT","SOLT","XXRP","MAGS","IGV","QTUM","KRE","XBI","XOP","OIH","DFEN","XHB","DRNZ","TAN"];
const VAG_STOCKS    = ["NVDA","MSFT","AAPL","AVGO","ADBE","GOOGL","AMZN","META","TSLA","NFLX","JPM","BAC","WFC","GS","HOOD","UNH","LLY","JNJ","MRK","ABBV","HCA","XOM","CVX","COP","EOG","SLB","HD","AMZN","WMT","MCD","LOW","COST","CAT","GE","HON","RTX","UNP","UPS","NEE","DUK","SO","AEP","EXC","PG","KO","PEP","MO","KHC","MSTR","SOFI","APD","LIN","SHW","ECL","NEM","IBM","CRM","AMAT","AMT","PLD","EQIX","CCI","WELL","AMT","TRV","AMGN","TAN","EEM"];
const VAG_ALL_TICKERS = [...new Set([...VAG_FUTURES, ...VAG_SECTORS, ...VAG_STOCKS])];

/* ---- web_search response cache + rate-limit helpers ----
   Ported from the Command Center build. Caches live-search results by key
   for a TTL so tape rolls / calendar fetches don't burn the 5-hour search
   quota on every click. Forced calls bypass the cache. */
const SEARCH_CACHE = new Map(); // key -> { text, ts }

/* ---- Live price cache ----
   Keyed by normalised symbol (upper, no leading $ or /).
   Each entry: { price, pct, pctOpen, ts }
   TTL: 60 seconds for regular session, 120s pre/post market.
   Populated by fetchLivePrices() which runs on mount + every 60s.
   Uses allorigins.win as a CORS proxy to Yahoo Finance — free, no key,
   works from any browser. On Netlify this call moves server-side
   (/api/prices) and the proxy is no longer needed. */
const PRICE_CACHE = new Map(); // sym → { price, pct, pctOpen, ts, source }
const PRICE_TTL   = 60_000;   // 60 s regular session
const PRICE_STALE = 300_000;  // 5 min — still show with amber dot

/* normalise a TOS/VAG ticker to a Yahoo-Finance-queryable symbol */
function toYahooSym(ticker) {
  const t = ticker.replace(/\[.*$/, "").trim(); // strip contract month e.g. /MES[M26]
  // Futures: /MES → MES=F, /MCL → CL=F, /MGC → GC=F etc.
  // Yahoo uses *=F for most CME futures by root name
  const futMap = {
    "/MES":"MES=F","/MNQ":"MNQ=F","/MYM":"MYM=F","/M2K":"M2K=F",
    "/MCL":"CL=F","/MGC":"GC=F","/SIL":"SI=F","/HG":"HG=F",
    "/MBT":"BTC-USD","/MSL":"SOL-USD","/MXP":"XRP-USD",
    "/ZN":"ZN=F","/ZB":"ZB=F","/TN":"TN=F",
    "$DXY":"DX-Y.NYB","/M6E":"6E=F","/M6B":"6B=F","/6J":"6J=F",
    "/VXM":"^VIX","/MET":"ETH-USD",
  };
  if (futMap[t]) return futMap[t];
  if (t.startsWith("/") || t.startsWith("$")) return null; // unmapped futures/indices
  return t; // equities / ETFs pass through
}

async function fetchLivePrices(symbols) {
  const filtered = symbols.map(toYahooSym).filter(Boolean);
  if (!filtered.length) return;
  // Batch into chunks of 10 (allorigins has URL length limits)
  const chunks = [];
  for (let i = 0; i < filtered.length; i += 10) chunks.push(filtered.slice(i, i + 10));
  for (const chunk of chunks) {
    const syms = chunk.join("%2C"); // comma-encoded
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${syms}&range=1d&interval=1d`;
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const wrapper = await res.json();
      const data = JSON.parse(wrapper.contents);
      const results = data?.spark?.result || [];
      for (const r of results) {
        const raw = r?.symbol;
        if (!raw) continue;
        const resp = r?.response?.[0];
        const closes = resp?.indicators?.quote?.[0]?.close || [];
        const meta   = resp?.meta || {};
        if (!closes.length) continue;
        const price  = Number((meta.regularMarketPrice || closes[closes.length - 1]).toFixed(2));
        const prev   = meta.chartPreviousClose || meta.previousClose || closes[closes.length - 2];
        const pct    = prev ? Number(((price - prev) / prev * 100).toFixed(2)) : 0;
        const open   = meta.regularMarketOpen || meta.chartPreviousClose || price;
        const pctO   = open ? Number(((price - open) / open * 100).toFixed(2)) : 0;
        PRICE_CACHE.set(raw.toUpperCase(), { price, pct, pctOpen: pctO, ts: Date.now(), source: "yahoo" });
      }
    } catch (_) { /* proxy blocked or timed out — skip this chunk */ }
  }
}

/* look up cached price for a V.A.G. symbol, returns null if missing/stale */
function getCachedPrice(symbol) {
  const key = toYahooSym(symbol.replace(/\[.*$/, "").trim());
  if (!key) return null;
  const hit = PRICE_CACHE.get(key.toUpperCase());
  if (!hit) return null;
  const age = Date.now() - hit.ts;
  return { ...hit, stale: age > PRICE_STALE, age };
}
const SEARCH_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ---- Discord webhook ("Captain Hook") ----
   Default webhook baked in; a localStorage override ("sbcp-discord-hook")
   lets the trader point it at a different channel without editing code.
   postDiscord() fires a fire-and-forget POST — Discord webhooks are a plain
   HTTP endpoint, no auth header, CORS-open for POST. Works from any real
   browser (Brave desktop/mobile, published link); fails silently in
   contexts that block it (e.g. the Claude app artifact viewer) so it never
   throws into the UI. Dedup keys (in DISCORD_SENT) prevent the same alert
   firing twice in a session. */
const DISCORD_DEFAULT_HOOK = "https://discord.com/api/webhooks/1468245138320003093/_qD19jiPOdb91Azjo5bm9nXQyMWRKG9asc2D-6u2hdHoRvhkKWirrAAKzDTSxWTNEmu2";
const DISCORD_SENT = new Set(); // session-scoped dedup keys

function getDiscordHook() {
  try {
    const o = localStorage.getItem("sbcp-discord-hook");
    if (o && o.startsWith("https://discord.com/api/webhooks/")) return o;
  } catch (_) {}
  return DISCORD_DEFAULT_HOOK;
}

async function postDiscord(content, { dedupKey = null } = {}) {
  const hook = getDiscordHook();
  if (!hook) return false;
  if (dedupKey) {
    if (DISCORD_SENT.has(dedupKey)) return false;
    DISCORD_SENT.add(dedupKey);
  }
  try {
    // Discord caps message content at 2000 chars
    const body = { content: String(content).slice(0, 1990), username: "Sigma Bond Co-Pilot" };
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return true;
  } catch (_) {
    // blocked in this context (e.g. Claude app viewer) — silent, by design
    if (dedupKey) DISCORD_SENT.delete(dedupKey); // allow retry from a working surface
    return false;
  }
}

function cacheAgeStr(ts) {
  if (!ts) return null;
  const secs = Math.floor((Date.now() - ts) / 1000);
  return secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`;
}
function fmtResetTime(resetsAt) {
  if (!resetsAt) return "soon";
  return new Date(resetsAt * 1000).toLocaleTimeString("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}
/* Detect a rate-limit response across the shapes the API can return. */
function detectRateLimit(data) {
  const e = data?.error || data;
  const windowed = e?.windows?.["5h"]?.status === "exceeded_limit"
    ? e.windows["5h"].resets_at : null;
  if (e?.type === "exceeded_limit" || windowed) {
    return { limited: true, resetsAt: e?.resetsAt || windowed || null };
  }
  return { limited: false };
}

/* SPDR sector ETF → GICS sector name, for linking the sector grid to stock sectors */
const SPDR_GICS = {
  XLK: "Information Technology", XLF: "Financials", XLE: "Energy", XLV: "Health Care",
  XLI: "Industrials", XLY: "Consumer Discretionary", XLP: "Consumer Staples",
  XLU: "Utilities", XLB: "Materials", XLRE: "Real Estate", XLC: "Communication Services",
  SMH: "Information Technology", KRE: "Financials", XBI: "Health Care", XHB: "Consumer Discretionary",
};
const baseSym = (s) => String(s || "").replace(/\[.*$/, "").replace(/^[$/]/, "").trim().toUpperCase();
const sectorNameOf = (g) => SPDR_GICS[baseSym(g.symbol)] || g.sector || g.symbol;

/* detect which tier a pasted/loaded file belongs to */
const SECTOR_ETF_SET = new Set([
  "SPY","QQQ","IWM","DIA","XLK","XLF","XLE","XLV","XLI","XLY","XLP","XLU","XLB",
  "XLRE","XLC","SMH","KRE","XBI","XOP","OIH","GLD","SLV","TLT","VIX","IBIT","SOLT",
  "XXRP","MAGS","IGV","QTUM","XHB","TAN","DFEN","DRNZ",
]);
function sniffTier(text) {
  const t = String(text).replace(/^\uFEFF/, "");
  const lines = t.split(/\r?\n/);
  const hi = lines.findIndex((l) => /^\s*symbol\s*,/i.test(l));
  const header = hi >= 0 ? lines[hi].toLowerCase() : "";
  const title = (hi > 0 ? lines.slice(0, hi).join(" ") : "").toLowerCase();
  const hasIFP = /(^|,)\s*ifp\s*(,|$)/.test(header);
  // sample the first dozen data symbols (not just the first)
  const syms = [];
  for (let i = hi < 0 ? 0 : hi + 1; i < lines.length && syms.length < 12; i++) {
    const c = (lines[i].split(",")[0] || "").trim();
    if (c) syms.push(c);
  }
  const firstSym = syms[0] || "";
  if (/future/.test(title) || /^[/$]/.test(firstSym)) return "macro";
  if (/sector|spdr/.test(title)) return "sector";
  if (/top\s*_?5|top\s*5/.test(title)) return "stocks";
  if (hasIFP) return "scans"; // an equity watchlist that isn't the curated Top-5
  /* Custom scan dumps (e.g. "D-D2Ux") pair underlyings with their options
     contracts and may lack IFP entirely — any options row means this is a
     scans watchlist, never the SPDR sector grid. */
  if (syms.some(isOptionsTicker)) return "scans";
  /* No options rows and no title hint: only treat as the sector grid when the
     symbols actually are the sector/index ETF universe. Anything else is a
     generic equity scan — prevents a misc watchlist from silently corrupting
     deskFavored sector logic. */
  const bases = syms.map(baseSym).filter(Boolean);
  const etfHits = bases.filter((s) => SECTOR_ETF_SET.has(s)).length;
  if (bases.length && etfHits / bases.length >= 0.6) return "sector";
  return "scans";
}

/* top-3 long / short sectors from the graded sector grid */
function deskFavored(gradedSector) {
  const longs = gradedSector.filter((g) => g.vlean === 1).sort((a, b) => b.sigma - a.sigma).slice(0, 3);
  const shorts = gradedSector.filter((g) => g.vlean === -1).sort((a, b) => b.sigma - a.sigma).slice(0, 3);
  const set = (arr) => new Set(arr.map((g) => sectorNameOf(g).toLowerCase()));
  return { longs, shorts, longNames: set(longs), shortNames: set(shorts), active: gradedSector.length > 0 };
}

/* ---------- HTF regime governor (review upgrade — the missing filter layer)
   Read-only interpreter derived purely from loaded CSV data — no live feed.
   It contextualizes every tape roll + chart read (Sigma Bond = top-layer
   interpreter governing bias stability, volatility regime, and execution
   confidence). It deliberately does NOT silently rescale the validated gate
   math; mechanical weight-scaling stays a documented future lever. ---------- */
function marketRegime(gMacro, gSector, posture) {
  // volatility: prefer /VX(M) VIX FUTURES from the macro board (Alpha Cannon
  // layer — top of the HTF→LTF hierarchy) over the cash VIX index on the
  // sector grid; fall back to avg -V% expansion if neither is loaded.
  const vxFut = gMacro.find((g) => !g.isOptions && /^\/?VX[A-Z]*\b/i.test(g.symbol));
  const vixCash = gSector.find((g) => baseSym(g.symbol) === "VIX");
  const vixRow = vxFut || vixCash;
  const vixSrc = vxFut ? `/${baseSym(vxFut.symbol)}` : vixCash ? "VIX" : null;
  const vix = vixRow ? vixRow.mark : NaN;
  const vexp = [...gMacro, ...gSector].filter((g) => !g.isOptions).map((g) => g.vpct).filter(Number.isFinite);
  const avgV = vexp.length ? vexp.reduce((a, b) => a + b, 0) / vexp.length : NaN;
  let vol = "unknown";
  if (Number.isFinite(vix)) vol = vix >= 28 ? "stressed" : vix >= 20 ? "elevated" : "calm";
  else if (Number.isFinite(avgV)) vol = avgV > 0.5 ? "expanding" : avgV < -0.5 ? "compressing" : "steady";
  const trend = posture ? posture.tone : "UNKNOWN";
  // liquidity: share of directional rows whose LWC aligns with their lean
  const rows = [...gMacro, ...gSector].filter((g) => !g.isOptions && g.lean !== 0);
  const lwcOk = rows.filter((g) => g.lwc && Math.sign(g.lwc.v) === g.lean).length;
  const liquidity = rows.length ? (lwcOk / rows.length >= 0.4 ? "supportive" : "thin") : "unknown";
  return { vol, vix: Number.isFinite(vix) ? vix : null, vixSrc, trend, liquidity };
}
function sectorFitOf(stock, favored) {
  if (!favored || !favored.active) return null;
  const sec = String(stock.sector || "").toLowerCase();
  if (!sec) return null;
  const hit = (names) => [...names].some((n) => n && (sec.includes(n) || n.includes(sec)));
  if (hit(favored.longNames)) return "long";
  if (hit(favored.shortNames)) return "short";
  return null;
}

/* grade a whole dataset (computes the session relative-strength fallback percentile) */
function gradeDataset(rows) {
  const metrics = rows
    .map((r) => { const rr = resolveRow(r); const m = num(rr.cwopen); return Number.isFinite(m) ? m : num(rr.pctchange); })
    .filter(Number.isFinite).sort((a, b) => a - b);
  const rsRank = (x) => {
    if (!metrics.length || !Number.isFinite(x)) return 50;
    let below = 0; for (const m of metrics) if (m < x) below++;
    return (below / metrics.length) * 100;
  };
  return rows.map((r) => gradeRow(r, { rsRank, extHours: isExtendedHoursET() })).filter((g) => g.symbol && g.symbol !== "—");
}

/* ============================================================
   COMPONENT
   ============================================================ */
export default function SigmaBondCoPilot() {
  // Boot empty — never show sample data on load, so it's always clear whether a
  // real CSV / saved desk loaded. Samples are available via an explicit demo button.
  const [datasets, setDatasets] = useState(() => ({
    macro: [], sector: [], stocks: [], scans: [],
  }));
  const [prevDatasets, setPrevDatasets] = useState(null); // for symbol delta (Rogue Alpha loop)
  const [activeTier, setActiveTier] = useState("stocks");
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [favOnly, setFavOnly] = useState(false);
  const [sortKey, setSortKey] = useState("house");
  /* SSR-safe: window is undefined during server-side rendering (the
     publish pipeline at claude.ai/public/artifacts renders this component
     on the server before hydrating on the client; the in-chat/app artifact
     viewer is client-only and never hits this branch). Without this guard,
     `window.innerWidth` throws ReferenceError on the server, the SSR pass
     produces nothing for this component, and the client hydration mismatch
     that follows (React error #418) leaves the page blank. 1024 is a
     desktop-width fallback so SSR renders the desktop layout; the resize
     effect below corrects it to the real width immediately on mount. */
  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1024));
  const [now, setNow] = useState(new Date());
  /* SSR-safe "mounted" gate: `now` (and dateStr below) will differ between
     server-render-time and client-hydration-time by definition — rendering
     that text unconditionally causes a hydration mismatch (React error
     #418/#425) in the publish/SSR pipeline. Render a static placeholder
     until the first client effect confirms we're past hydration, then swap
     to the live clock. Only affects the always-visible header clock text;
     `now` itself stays a normal Date everywhere else (effects, EOW window,
     auto-tape slots, etc. are all client-only anyway). */
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [tapeOutput, setTapeOutput] = useState(null);   // { session, text, loading, restoredAt? }
  const [tapeReportOpen, setTapeReportOpen] = useState(false); // entire tape panel collapsed by default
  const [tapeDetailOpen, setTapeDetailOpen] = useState(false); // full Field Report (when tape is open) collapsed by default — Snapshot Summary always visible when tape is open

  /* restore the last Roll-the-Tape snapshot on mount (see persistence in
     rollTape) — so a trader who stepped away and reopens the desk sees the
     most recent Field Report immediately, marked with how long ago it was
     saved, rather than a blank panel. localStorage first (same-device,
     always works); window.storage as a cross-device bonus if it's newer
     and localStorage has nothing (best-effort, may not work in all
     viewers — same pattern as the dataset sync). */
  useEffect(() => {
    try {
      const local = localStorage.getItem("sbcp-last-tape");
      if (local) {
        const saved = JSON.parse(local);
        if (saved?.text) {
          setTapeOutput({ session: saved.session, text: saved.text, loading: false, restoredAt: saved.ts });
          return;
        }
      }
    } catch (_) {}
    (async () => {
      try {
        const res = await WS.get("sbcp-last-tape", false);
        const saved = res?.value ? JSON.parse(res.value) : null;
        if (saved?.text) {
          setTapeOutput({ session: saved.session, text: saved.text, loading: false, restoredAt: saved.ts });
          try { localStorage.setItem("sbcp-last-tape", JSON.stringify(saved)); } catch (_) {}
        }
      } catch (_) {}
    })();
  }, []);
  const lastTapeRollRef = useRef(0); // ms timestamp — 30s client-side throttle on roll-the-tape calls
  const [chartImg, setChartImg] = useState(null);        // base64 data URL
  const [chartNotes, setChartNotes] = useState("");       // text-based chart notes alternative
  const [chartMode, setChartMode] = useState("image");    // "image" | "notes"
  const [pasteOpen, setPasteOpen] = useState(false);      // "Paste V.A.G." panel toggle
  const [pasteText, setPasteText] = useState("");
  const [chartAnalysis, setChartAnalysis] = useState(null); // { loading, text }
  const [calEvents, setCalEvents] = useState([]);         // [{ time, name, impact, forecast, previous }]
  const [calLoading, setCalLoading] = useState(false);
  const [calMeta, setCalMeta] = useState(null);           // { source: 'local'|'shared'|'live', at, weekKey }
  const [storedAt, setStoredAt] = useState(null);        // ISO string of last save, for session banner
  const [saveStatus, setSaveStatus] = useState(null);    // { ok, msg, ts } — storage write result
  /* Discord notifications (Captain Hook) — on by default; toggle + webhook
     override persisted to localStorage so it survives reloads per device. */
  const [discordOn, setDiscordOn] = useState(() => {
    try { return localStorage.getItem("sbcp-discord-off") !== "1"; } catch (_) { return true; }
  });
  const [discordPanelOpen, setDiscordPanelOpen] = useState(false);
  const [discordHookInput, setDiscordHookInput] = useState(() => {
    try { return localStorage.getItem("sbcp-discord-hook") || ""; } catch (_) { return ""; }
  });
  const [discordTestMsg, setDiscordTestMsg] = useState(null);

  /* inject fonts */
  useEffect(() => {
    if (!document.getElementById("sb-fonts")) {
      const l = document.createElement("link");
      l.id = "sb-fonts"; l.rel = "stylesheet"; l.href = FONT_LINK;
      document.head.appendChild(l);
    }
  }, []);

  /* clock */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* track viewport width — forces single-column layout on narrow screens
     (portrait phones) regardless of the manual DSK/MOB toggle, and updates
     on orientation change */
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  /* effective single-column: manual mobile toggle OR a genuinely narrow viewport.
     760px is the breakpoint below which the 2-col main grid can't fit cleanly. */
  const isNarrow = vw < 760;
  const stackLayout = isNarrow;
  /* v2026-06-19b: the standalone mobile app is retired — this is now a single
     responsive web UI for every device. The "Tactical HUD" compact-row layer
     (one-line board rows, hidden pillar/RS context, the now-unused
     compactView constant) is removed; stackLayout alone drives layout reflow
     (column stacking, board max-height) via ordinary responsive behavior.
     Narrow-viewport users now see the SAME full board row — with pillars,
     RS, STRSI context — as desktop, not a stripped-down summary. */

  /* ---- per-device persistence (localStorage) + cross-device sync
     (window.storage) ----
     localStorage is PRIMARY: instant, synchronous, always available on
     this device. Each device also loads/keeps its own copy via the
     "Load V.A.G. watchlist" / "Paste V.A.G." controls.
     window.storage is a BEST-EFFORT layer on top: when a newer snapshot
     exists from another device/session, it's adopted automatically —
     that's the actual cross-device sync (e.g. grade on desktop, see it
     on phone). A failed window.storage call is treated as transient
     (network blip, key not yet written) and simply retried; localStorage
     already has this device's own data regardless. */
  const [syncStatus, setSyncStatus] = useState(null); // { ts, found, adopted, error }
  const [syncing, setSyncing] = useState(false);
  async function syncFromStorage(force = false, compareAt = undefined) {
    setSyncing(true);
    try {
      const res = await WS.get("sbcp-datasets", false);
      const saved = res?.value ? JSON.parse(res.value) : null;
      const hasRealData = !!(saved && (
        saved.macro?.length || saved.sector?.length ||
        saved.stocks?.length || saved.scans?.length
      ));
      let adopted = false;
      if (hasRealData) {
        const savedAt = saved._savedAt ? new Date(saved._savedAt).getTime() : 0;
        const haveAt = compareAt !== undefined ? compareAt : (storedAt ? new Date(storedAt).getTime() : 0);
        if (force || savedAt > haveAt) {
          setDatasets(saved);
          const tier = saved.stocks?.length ? "stocks" : saved.scans?.length ? "scans"
            : saved.sector?.length ? "sector" : saved.macro?.length ? "macro" : "stocks";
          setActiveTier(tier);
          setStoredAt(saved._savedAt || null);
          try { localStorage.setItem("sbcp-datasets-local", JSON.stringify(saved)); } catch (_) {}
          adopted = true;
        }
      }
      setSyncStatus({ ts: Date.now(), found: hasRealData, adopted, error: null });
      return hasRealData;
    } catch (err) {
      /* WS.get() throws for a key that doesn't exist yet
         (documented behavior) — harmless, just means no cross-device
         snapshot is available yet. localStorage already has this
         device's own data regardless, so this is a quiet no-op. */
      setSyncStatus({ ts: Date.now(), found: false, adopted: false, error: null, rawError: err.message });
      return false;
    } finally {
      setSyncing(false);
    }
  }

  /* restore saved CSV datasets on mount.
     1. localStorage (this device, instant, synchronous) — the primary path,
        works everywhere. If this device has data, show it immediately.
     2. window.storage (cross-device, best-effort, may not work in this
        viewer) — only ADOPTS if it's actually newer than what localStorage
        just gave us, so a working cross-device sync can still pull in a
        fresher load from another device without clobbering this one. */
  useEffect(() => {
    let localSavedAt = 0;
    try {
      const local = localStorage.getItem("sbcp-datasets-local");
      if (local) {
        const saved = JSON.parse(local);
        const hasRealData = !!(saved && (
          saved.macro?.length || saved.sector?.length ||
          saved.stocks?.length || saved.scans?.length
        ));
        if (hasRealData) {
          setDatasets(saved);
          const tier = saved.stocks?.length ? "stocks" : saved.scans?.length ? "scans"
            : saved.sector?.length ? "sector" : saved.macro?.length ? "macro" : "stocks";
          setActiveTier(tier);
          setStoredAt(saved._savedAt || null);
          localSavedAt = saved._savedAt ? new Date(saved._savedAt).getTime() : 0;
        }
      }
    } catch (_) {}

    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
        const found = await syncFromStorage(false, localSavedAt);
        if (found) return; // either adopted a newer snapshot, or confirmed nothing newer — done
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1))); // 0.7s,1.4s,2.1s,2.8s,3.5s
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* Background cross-device check: pick up a newer load from another
     device/session every 15s. No-ops harmlessly if nothing newer exists —
     localStorage already has this device's own data regardless. */
  useEffect(() => {
    let cancelled = false;
    const id = setInterval(() => { if (!cancelled) syncFromStorage(false); }, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [storedAt]);

  /* ── Live price state + auto-refresh ──
     priceTs ticks whenever PRICE_CACHE is updated so price-dependent
     memos re-run. fetchLivePrices is called on mount and every 60s.
     Also called immediately after a CSV load (new symbols may be present). */
  const [priceTs, setPriceTs] = useState(0);
  const [priceLoading, setPriceLoading] = useState(false);
  async function refreshPrices(force = false) {
    if (priceLoading && !force) return;
    setPriceLoading(true);
    await fetchLivePrices(VAG_ALL_TICKERS);
    setPriceTs(Date.now());
    setPriceLoading(false);
  }
  useEffect(() => {
    refreshPrices(true);
    const id = setInterval(() => refreshPrices(false), 15 * 60 * 1000); // 15 min auto-refresh
    return () => clearInterval(id);
  }, []);

  /* grade each tier */
  const gMacro = useMemo(() => gradeDataset(datasets.macro), [datasets.macro]);
  const gSector = useMemo(() => gradeDataset(datasets.sector), [datasets.sector]);
  const gStocks = useMemo(() => gradeDataset(datasets.stocks), [datasets.stocks]);
  const gScans = useMemo(() => gradeDataset(datasets.scans), [datasets.scans]);

  const favored = useMemo(() => deskFavored(gSector), [gSector]);

  /* ── withLivePrices: overlay fresh price + pct onto each graded row ──
     When a CSV row already has mark/pct from the export, we prefer the live
     price (fresher). If no CSV is loaded for a tier, priceOnlyRows builds
     placeholder rows from the ticker list so users always see a board. */
  function overlayPrices(rows) {
    return rows.map((g) => {
      const lp = getCachedPrice(g.symbol); // eslint-disable-line
      if (!lp) return g;
      return {
        ...g,
        mark:     lp.price,
        pct:      lp.pct,
        pctOpen:  lp.pctOpen,
        liveTs:   lp.ts,
        liveStale: lp.stale,
      };
    });
  }

  const gMacroLive  = useMemo(() => overlayPrices(gMacro),  [gMacro,  priceTs]); // eslint-disable-line
  const gSectorLive = useMemo(() => overlayPrices(gSector), [gSector, priceTs]);
  const gStocksLive = useMemo(() => overlayPrices(gStocks), [gStocks, priceTs]);
  const gScansLive  = useMemo(() => overlayPrices(gScans),  [gScans,  priceTs]);

  /* priceOnlyRows: tickers with a live price but no CSV grade — gives users
     a live price board even between your CSV uploads. Only shown when the
     matching tier has zero rows from any CSV. */
  const priceOnlyRows = useMemo(() => {
    const loadedSyms = new Set([
      ...gMacro, ...gSector, ...gStocks, ...gScans,
    ].map((g) => g.symbol.replace(/\[.*$/, "").trim().toUpperCase()));
    return VAG_ALL_TICKERS
      .filter((sym) => {
        const norm = sym.replace(/\[.*$/, "").trim().toUpperCase();
        if (loadedSyms.has(norm)) return false;
        const lp = getCachedPrice(sym); // eslint-disable-line
        return lp && Number.isFinite(lp.price);
      })
      .map((sym) => {
        const lp = getCachedPrice(sym);
        return {
          symbol: sym, sector: "—", verdict: "—", vlean: 0, sigma: 0,
          mark: lp.price, pct: lp.pct, pctOpen: lp.pctOpen,
          liveTs: lp.ts, liveStale: lp.stale,
          wits: { label: "—" }, strsi: { stage: "—", val: 0 },
          momo: { label: "—" }, con: { state: "—" }, lwc: { v: 0 },
          pillars: { part: 0, conv: 0, trend: 0, rs: 0, liq: 0 },
          isOptions: false, priceOnly: true,
        };
      });
  }, [gMacro, gSector, gStocks, gScans, priceTs]); // eslint-disable-line



  /* ---- session-state memory (review upgrade): rolling Σ-leader history ----
     Keeps the last 5 ingest snapshots' top-10 sigma leaders in storage so the
     desk can see institutional flow CONTINUITY across loads — a symbol that
     stays in the top-10 for 3+ consecutive snapshots is multi-session
     conviction, not a one-print wonder. */
  const [history, setHistory] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await WS.get("sbcp-history", false);
        if (res?.value) { const h = JSON.parse(res.value); if (Array.isArray(h)) setHistory(h); }
      } catch (_) {}
    })();
  }, []);
  useEffect(() => {
    const ts = datasets._savedAt;
    if (!ts) return;
    const all = [...gMacro, ...gSector, ...gStocks, ...gScans].filter((g) => !g.isOptions);
    if (!all.length) return;
    const leaders = [...all].sort((a, b) => b.sigma - a.sigma).slice(0, 10)
      .map((g) => ({ s: g.symbol, sig: g.sigma }));
    setHistory((h) => {
      if (h.length && h[h.length - 1].ts === ts) return h; // this snapshot already recorded
      const next = [...h, { ts, leaders }].slice(-5);
      WS.set("sbcp-history", JSON.stringify(next), false).catch(() => {});
      return next;
    });
  }, [datasets._savedAt, gMacro, gSector, gStocks, gScans]);

  /* streaks: consecutive snapshots (ending at the latest) a symbol spent in the Σ top-10 */
  const streaks = useMemo(() => {
    const m = {};
    if (!history.length) return m;
    const last = history.length - 1;
    for (const l of history[last].leaders) m[l.s] = 1;
    for (let i = last - 1; i >= 0; i--) {
      const set = new Set(history[i].leaders.map((l) => l.s));
      for (const s of Object.keys(m)) {
        if (m[s] === last - i && set.has(s)) m[s]++;
      }
    }
    return m;
  }, [history]);

  /* macro posture: Σ-weighted net lean of the equity-index futures (the risk proxies) */
  const posture = useMemo(() => {
    if (!gMacro.length) return null;
    const idx = gMacro.filter(
      (g) => /equit|index|s&p|nasdaq|dow/i.test(g.sector) ||
        /^\/(ES|NQ|MES|MNQ|YM|MYM|RTY|M2K)/i.test(g.symbol)
    );
    const pool = idx.length ? idx : gMacro;
    let wsum = 0, w = 0;
    pool.forEach((g) => { wsum += g.vlean * g.sigma; w += g.sigma; });
    const score = w ? Math.round((wsum / w) * 100) : 0;
    const tone = score > 12 ? "RISK-ON" : score < -12 ? "RISK-OFF" : "MIXED";
    const bull = [...gMacro].filter((g) => g.vlean === 1).sort((a, b) => b.sigma - a.sigma)[0];
    const bear = [...gMacro].filter((g) => g.vlean === -1).sort((a, b) => b.sigma - a.sigma)[0];
    return { tone, score, bull, bear };
  }, [gMacro]);

  /* HTF regime governor — recomputed whenever macro/sector grades change */
  const regime = useMemo(() => marketRegime(gMacro, gSector, posture), [gMacro, gSector, posture]);

  const activeGraded = activeTier === "macro" ? gMacroLive : activeTier === "sector" ? gSectorLive : activeTier === "scans" ? gScansLive : gStocksLive;

  /* attach sector-fit to equity tiers (stocks + scans) */
  const isEquityTier = activeTier === "stocks" || activeTier === "scans";
  const decorated = useMemo(
    () => (isEquityTier ? activeGraded.map((g) => ({ ...g, fit: sectorFitOf(g, favored) })) : activeGraded),
    [activeGraded, isEquityTier, favored]
  );

  const tierLoaded = { macro: gMacro.length, sector: gSector.length, stocks: gStocks.length, scans: gScans.length };
  const anyLoaded = tierLoaded.macro || tierLoaded.sector || tierLoaded.stocks || tierLoaded.scans;

  /* ── Event 2 — A+ Setup Alert (v2026-06-20k) ──────────────────────────────
     HIERARCHY: posts three separate batched messages in order:
       1. ALPHA CANNON  (Macro tier)
       2. SECTOR GRID   (Sector tier)  → tagged with LONG/SHORT posture
       3. QUALIFIED PLAYS (Stocks + Scans) → Top-5 only, favored sector tagged
     Each tier posts independently — if only one tier has A+ names, only that
     block fires. Dedup per tier on sorted symbol+verdict set so re-grading
     the same desk never re-fires, but a fresh CSV load with different A+ names
     will. Options rows are excluded from all tiers. */
  useEffect(() => {
    if (!discordOn || !anyLoaded) return;

    const now = new Date();
    const dateTag = now.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
    const timeTag = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/New_York" }) + " ET";

    const divider = "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬";

    // ── helper: format one A+ row as a trade card line ──
    const tradeLine = (r, sectorTag) => {
      const dir   = r.verdict === "A+ LONG" ? "🟢 LONG" : "🔴 SHORT";
      const wits  = r.wits?.label ? ` · 🏈 ${r.wits.label}` : "";
      const sigma = `Σ${r.sigma}`;
      const vol   = r.implvol != null ? ` · IV${Math.round(r.implvol)}%` : "";
      const ivp   = r.ivp    != null ? `[IVP${r.ivp}]` : "";
      const con   = r.conScore != null ? ` · Con${r.conScore}` : "";
      const fit   = sectorTag ? ` ✅ **${sectorTag}**` : "";
      return `${dir} **${r.symbol}** · ${sigma}${vol}${ivp}${con}${wits}${fit}`;
    };

    // ── TIER 1: ALPHA CANNON (Macro) ──
    const macroAplus = gMacroLive.filter((r) => !r.isOptions && (r.verdict === "A+ LONG" || r.verdict === "A+ SHORT"))
      .sort((a, b) => b.sigma - a.sigma).slice(0, 5);
    if (macroAplus.length) {
      const key = "aplus-macro-" + macroAplus.map((r) => `${r.symbol}:${r.verdict}`).sort().join(",");
      const lines = macroAplus.map((r) => tradeLine(r, null)).join("\n");
      const msg = [
        `🎯 **VAG SIGMA BOND — ALPHA CANNON** | ${dateTag} ${timeTag}`,
        divider,
        `**A+ MACRO SETUPS (${macroAplus.length})**`,
        lines,
        divider,
        `_Macro tier · HTF bias confirmed · Trade the directional edge_`,
      ].join("\n");
      postDiscord(msg.slice(0, 1990), { dedupKey: key });
    }

    // ── TIER 2: SECTOR GRID ──
    const sectorAplus = gSectorLive.filter((r) => !r.isOptions && (r.verdict === "A+ LONG" || r.verdict === "A+ SHORT"))
      .sort((a, b) => b.sigma - a.sigma).slice(0, 5);
    if (sectorAplus.length) {
      const key = "aplus-sector-" + sectorAplus.map((r) => `${r.symbol}:${r.verdict}`).sort().join(",");
      const longs  = sectorAplus.filter((r) => r.verdict === "A+ LONG");
      const shorts = sectorAplus.filter((r) => r.verdict === "A+ SHORT");
      const lines = sectorAplus.map((r) => tradeLine(r, null)).join("\n");
      const favLong  = longs.length  ? `🟢 Favored LONG:  ${longs.map((r) => r.symbol).join(" · ")}` : "";
      const favShort = shorts.length ? `🔴 Favored SHORT: ${shorts.map((r) => r.symbol).join(" · ")}` : "";
      const msg = [
        `🎯 **VAG SIGMA BOND — SECTOR GRID** | ${dateTag} ${timeTag}`,
        divider,
        `**A+ SECTOR SETUPS (${sectorAplus.length})**`,
        lines,
        "",
        favLong, favShort,
        divider,
        `_Sector tier · Funnel stocks into confirmed sector momentum_`,
      ].filter(Boolean).join("\n");
      postDiscord(msg.slice(0, 1990), { dedupKey: key });
    }

    // ── TIER 3: QUALIFIED PLAYS — Stocks (equities only, no option codes) ──
    const stocksAplus = gStocksLive
      .filter((r) => !r.isOptions && (r.verdict === "A+ LONG" || r.verdict === "A+ SHORT"))
      .sort((a, b) => {
        const aFit = sectorFitOf(a, favored) ? 1 : 0;
        const bFit = sectorFitOf(b, favored) ? 1 : 0;
        if (bFit !== aFit) return bFit - aFit;
        return b.sigma - a.sigma;
      })
      .slice(0, 5);
    if (stocksAplus.length) {
      const key = "aplus-stocks-" + stocksAplus.map((r) => `${r.symbol}:${r.verdict}`).sort().join(",");
      const favLongLabels  = favored?.longs?.map((g)  => g.symbol).join(" · ") || "—";
      const favShortLabels = favored?.shorts?.map((g) => g.symbol).join(" · ") || "—";
      const lines = stocksAplus.map((r) => {
        const fit = sectorFitOf(r, favored);
        const tag = fit === "long" ? "SECTOR-LONG ✅" : fit === "short" ? "SECTOR-SHORT ✅" : null;
        return tradeLine(r, tag);
      }).join("\n");
      const msg = [
        `🎯 **VAG SIGMA BOND — QUALIFIED PLAYS** | ${dateTag} ${timeTag}`,
        divider,
        `**TOP-5 A+ · STOCKS**`,
        lines,
        "",
        `📋 Favored sectors → 🟢 ${favLongLabels} · 🔴 ${favShortLabels}`,
        divider,
        `_Stocks tier · ✅ = sits inside a favored sector · Sort: fit → Σ_`,
      ].join("\n");
      postDiscord(msg.slice(0, 1990), { dedupKey: key });
    }

    // ── TIER 4: SCANS — dynamic watchlist; option codes paired with underliers ──
    // Options rows are INCLUDED here so IV/IVP metrics surface alongside the stock ticker.
    const scansAplus = gScansLive
      .filter((r) => r.verdict === "A+ LONG" || r.verdict === "A+ SHORT")
      .sort((a, b) => {
        const aFit = sectorFitOf(a, favored) ? 1 : 0;
        const bFit = sectorFitOf(b, favored) ? 1 : 0;
        if (bFit !== aFit) return bFit - aFit;
        return b.sigma - a.sigma;
      })
      .slice(0, 5);
    if (scansAplus.length) {
      const key = "aplus-scans-" + scansAplus.map((r) => `${r.symbol}:${r.verdict}`).sort().join(",");
      // Scans line includes options contract details if present
      const scanLine = (r) => {
        const base = tradeLine(r, null);
        const contractLine = r.isOptions
          ? `\n    📄 Contract ${r.symbol} · Strike ${r.strike || "—"} · Exp ${r.expiry || "—"}`
          : "";
        return base + contractLine;
      };
      const lines = scansAplus.map(scanLine).join("\n");
      const msg = [
        `🎯 **VAG SIGMA BOND — SCANS** | ${dateTag} ${timeTag}`,
        divider,
        `**TOP-5 A+ · DYNAMIC WATCHLIST**`,
        lines,
        divider,
        `_Scans tier · Options codes included with IV/IVP metrics_`,
      ].join("\n");
      postDiscord(msg.slice(0, 1990), { dedupKey: key });
    }

  }, [gMacro, gSector, gStocks, gScans, discordOn]); // eslint-disable-line

  /* prev-grade lookup — keyed by symbol — for Rogue Alpha delta badges */
  const prevGraded = useMemo(() => {
    if (!prevDatasets) return {};
    const all = [
      ...gradeDataset(prevDatasets.macro || []),
      ...gradeDataset(prevDatasets.sector || []),
      ...gradeDataset(prevDatasets.stocks || []),
      ...gradeDataset(prevDatasets.scans || []),
    ];
    const map = {};
    all.forEach((g) => { map[g.symbol] = g; });
    return map;
  }, [prevDatasets]);

  /* default to the deepest loaded tier when data changes */
  useEffect(() => {
    if (!tierLoaded[activeTier]) {
      const next = tierLoaded.stocks ? "stocks" : tierLoaded.scans ? "scans" : tierLoaded.sector ? "sector" : tierLoaded.macro ? "macro" : "stocks";
      setActiveTier(next);
    }
  }, [gMacro, gSector, gStocks, gScans]); // eslint-disable-line

  /* keep selection valid within the active tier */
  useEffect(() => {
    if (decorated.length && !decorated.find((g) => g.symbol === selected)) {
      const aPlus = decorated.find((g) => g.verdict.startsWith("A+"));
      setSelected((aPlus || decorated[0]).symbol);
    }
  }, [decorated]); // eslint-disable-line

  const view = useMemo(() => {
    let v = [...decorated];
    if (filter === "APLUS") v = v.filter((g) => g.verdict.startsWith("A+"));
    else if (filter === "LONG") v = v.filter((g) => g.vlean === 1 && g.verdict !== "NO-TRADE");
    else if (filter === "SHORT") v = v.filter((g) => g.vlean === -1 && g.verdict !== "NO-TRADE");
    else if (filter === "NOTRADE") v = v.filter((g) => g.verdict === "NO-TRADE");
    if (favOnly && isEquityTier) v = v.filter((g) => g.fit);
    v.sort((a, b) => {
      if (sortKey === "sigma") return b.sigma - a.sigma;
      if (sortKey === "symbol") return a.symbol.localeCompare(b.symbol);
      if (sortKey === "house") return houseRankCompare(a, b);
      return b.pillars[sortKey] - a.pillars[sortKey];
    });
    return v;
  }, [decorated, filter, sortKey, favOnly, isEquityTier]);

  const sel = decorated.find((g) => g.symbol === selected) || null;

  const counts = useMemo(() => ({
    aplus: decorated.filter((g) => !g.isOptions && g.verdict.startsWith("A+")).length,
    long: decorated.filter((g) => !g.isOptions && g.vlean === 1 && g.verdict !== "NO-TRADE").length,
    short: decorated.filter((g) => !g.isOptions && g.vlean === -1 && g.verdict !== "NO-TRADE").length,
    notrade: decorated.filter((g) => !g.isOptions && g.verdict === "NO-TRADE").length,
  }), [decorated]);

  function ingest(text) {
    const tier = sniffTier(text);
    const rows = parseCSV(text);
    const savedAt = new Date().toISOString();
    setDatasets((d) => {
      setPrevDatasets(d); // snapshot for delta comparison
      const next = { ...d, [tier]: rows, _savedAt: savedAt };
      // PRIMARY persistence: localStorage, same-device, instant, always
      // available regardless of whether window.storage is reachable.
      try { localStorage.setItem("sbcp-datasets-local", JSON.stringify(next)); } catch (_) {}
      // Cross-device persistence — async, never blocks the UI; localStorage
      // (set above) is already the durable per-device copy regardless.
      WS.set("sbcp-datasets", JSON.stringify(next), false)
        .then(() => setSaveStatus({ ok: true, ts: Date.now() }))
        .catch((err) => setSaveStatus({ ok: false, msg: err.message, ts: Date.now() }));
      return next;
    });
    setStoredAt(savedAt);
    setActiveTier(tier);
  }

  /* ---- Desk Export / Import ----
     Export packages the full 4-tier graded desk (macro + sector + stocks +
     scans) into a single .vagdesk.json file the trader can download and
     re-import on any surface (published link, different browser, mobile)
     with one click — no re-pasting 4 CSVs. The file contains the raw
     parsed row arrays (same shape ingest() produces) plus a format tag and
     export timestamp. Import reads it, validates the format tag, merges all
     tiers at once, and applies the same localStorage + window.storage
     persistence that a normal CSV ingest would. */
  function exportDesk() {
    const counts = {
      macro: datasets.macro?.length || 0, sector: datasets.sector?.length || 0,
      stocks: datasets.stocks?.length || 0, scans: datasets.scans?.length || 0,
    };
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    if (!total) { alert("Nothing loaded to export yet. Load your V.A.G. CSVs first."); return; }
    const payload = {
      _format: "sbcp-vagdesk-v1",
      _exportedAt: new Date().toISOString(),
      _counts: counts,
      macro: datasets.macro || [],
      sector: datasets.sector || [],
      stocks: datasets.stocks || [],
      scans: datasets.scans || [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateTag = new Date().toISOString().slice(0, 10);
    a.href = url; a.download = `VAGDesk_${dateTag}.vagdesk.json`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function importDeskFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result));
        if (payload._format !== "sbcp-vagdesk-v1") {
          alert("Unrecognized file format. Please use a .vagdesk.json file exported from this desk.");
          return;
        }
        const savedAt = payload._exportedAt || new Date().toISOString();
        const next = {
          macro:  Array.isArray(payload.macro)  ? payload.macro  : [],
          sector: Array.isArray(payload.sector) ? payload.sector : [],
          stocks: Array.isArray(payload.stocks) ? payload.stocks : [],
          scans:  Array.isArray(payload.scans)  ? payload.scans  : [],
          _savedAt: savedAt,
        };
        setPrevDatasets(datasets);
        setDatasets(next);
        const tier = next.stocks.length ? "stocks" : next.scans.length ? "scans"
          : next.sector.length ? "sector" : next.macro.length ? "macro" : "stocks";
        setActiveTier(tier);
        setStoredAt(savedAt);
        try { localStorage.setItem("sbcp-datasets-local", JSON.stringify(next)); } catch (_) {}
        WS.set("sbcp-datasets", JSON.stringify(next), false).catch(() => {});
        const c = payload._counts || {};
        setSaveStatus({ ok: true, ts: Date.now(),
          msg: `Desk imported: ${c.macro||next.macro.length}M / ${c.sector||next.sector.length}S / ${c.stocks||next.stocks.length}E / ${c.scans||next.scans.length}X` });
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(f);
  }

  function loadDemo() {
    const next = {
      macro: parseCSV(SAMPLE_MACRO), sector: parseCSV(SAMPLE_SECTOR),
      stocks: parseCSV(SAMPLE_STOCKS), scans: parseCSV(SAMPLE_SCANS), _savedAt: new Date().toISOString(),
    };
    setPrevDatasets(datasets);
    setDatasets(next);
    setActiveTier("stocks");
    try { localStorage.setItem("sbcp-datasets-local", JSON.stringify(next)); } catch (_) {}
    setStoredAt(next._savedAt);
  }
  function loadFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => ingest(String(reader.result));
    reader.readAsText(f);
    e.target.value = "";
  }

  /* build a compact data summary for the tape context */
  function buildTapeContext() {
    /* per-symbol volatility context — IV+ (1yr percentile), Impl Vol (raw %),
       -V% (expansion/contraction), VD% — appended only when present so the
       string stays compact for symbols missing these columns (e.g. scans).
       EXT %Chng (extended-hours move) only matters pre-9:30 ET — once the
       regular session opens, %Change/Momo take over, so it's dropped after
       the open to avoid the LLM citing a stale pre-market number. */
    const extHoursNow = isExtendedHoursET(new Date());   // pre-09:30 OR post-16:15
    const preMkt = isPreMarketET(new Date());              // kept for backward compat
    const volStr = (g) => {
      const parts = [];
      if (Number.isFinite(g.implvol)) parts.push(`IV${g.implvol}%`);
      if (Number.isFinite(g.ivp)) parts.push(`IVP${g.ivp}`);
      if (Number.isFinite(g.vpct)) parts.push(`ΔV${g.vpct > 0 ? "+" : ""}${g.vpct}`);
      if (Number.isFinite(g.vd)) parts.push(`VD${g.vd > 0 ? "+" : ""}${g.vd}`);
      if (extHoursNow && Number.isFinite(g.extchng) && Math.abs(g.extchng) >= 0.2) {
        parts.push(`EXT${g.extchng > 0 ? "+" : ""}${g.extchng}%`);
      }
      if (extHoursNow && Number.isFinite(g.volume) && g.volume > 0) {
        parts.push(`Vol${g.volume >= 1e6 ? `${(g.volume/1e6).toFixed(1)}M` : g.volume >= 1e3 ? `${(g.volume/1e3).toFixed(0)}K` : g.volume}`);
      }
      return parts.length ? ` [${parts.join(" ")}]` : "";
    };
    const fmt = (arr) => arr.slice(0, 8).map((g) =>
      `${g.symbol}: ${g.verdict} Σ${g.sigma} WITS=${g.wits?.label||"?"} RS=${g.rsPct} %C=${g.cwopen||"?"}${volStr(g)}`
    ).join(" | ");
    const p = posture;
    const persist = Object.entries(streaks).filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1]).slice(0, 6);
    const macroBySigma = [...gMacro].filter((g) => !g.isOptions).sort((a, b) => b.sigma - a.sigma);
    const csvLines = [
      anyLoaded ? `REGIME (HTF governor): vol=${regime.vol}${regime.vix ? ` (${regime.vixSrc} ${regime.vix.toFixed(1)})` : ""} · trend=${regime.trend} · liquidity=${regime.liquidity}` : "",
      p ? `MACRO: ${p.tone} (${p.score > 0 ? "+" : ""}${p.score}) · best long=${p.bull?.symbol||"—"} best short=${p.bear?.symbol||"—"}` : "",
      macroBySigma.length ? `FUTURES (Alpha Cannon): ${fmt(macroBySigma)}` : "",
      gSector.length ? `SECTORS top-long: ${favored.longs.map((g) => g.symbol).join(", ")||"—"} · top-short: ${favored.shorts.map((g) => g.symbol).join(", ")||"—"}` : "",
      gStocks.length ? `STOCKS: ${fmt(gStocks)}` : "",
      gScans.length ? `SCANS: ${fmt(gScans)}` : "",
      persist.length ? `FLOW CONTINUITY (consecutive snapshots in Σ top-10): ${persist.map(([s, n]) => `${s}×${n}`).join(", ")}` : "",
    ].filter(Boolean);
    // Determine which V.A.G. tickers have no CSV data and need live price fetch
    const loadedSyms = new Set([
      ...gMacro, ...gSector, ...gStocks, ...gScans,
    ].map(g => g.symbol.replace(/\[.*$/, "").replace(/^[$/]/, "").toUpperCase()));
    const needsLive = VAG_ALL_TICKERS.filter(t => !loadedSyms.has(t.replace(/^[$/]/, "").toUpperCase()));
    return { csvLines, needsLive, loadedCount: loadedSyms.size };
  }

  /* ---- shared Claude API helper ----
     Handles: cache (for search calls), error detection, multi-turn tool
     loops (up to 4 turns), windowed rate-limit detection, and returns the
     final text or throws a descriptive error.
     Options:
       cacheKey  — if set, results are cached SEARCH_TTL_MS and reused
       force     — bypass cache read (still writes fresh result to cache) */
  /* Detect whether the Anthropic API is reachable from this origin.
     In the published artifact (claude.ai/public/artifacts/...) the API
     call is blocked by CORS — the artifact runs on claudeusercontent.com,
     not api.anthropic.com. We detect this upfront and return an
     "OFFLINE / Static" fallback object instead of throwing, so Roll the
     Tape and the calendar degrade gracefully with an informative message
     rather than a raw API error. */
  const [apiAvailable, setApiAvailable] = useState(null); // null=unknown, true, false
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(CLAUDE_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1,
            messages: [{ role: "user", content: "ping" }] }),
          signal: AbortSignal.timeout(4000),
        });
        // A 401/400 means the endpoint is reachable (CORS passed). A CORS
        // error throws and we catch below.
        const ok = r.status !== 0;
        setApiAvailable(ok);
      } catch (_) {
        setApiAvailable(false);
      }
    })();
  }, []);

  async function callClaude({ system, userContent, tools, maxTokens = 1200,
                               cacheKey = null, force = false, onStream = null }) {
    // Serve from cache if fresh and not forced
    if (cacheKey && !force) {
      const hit = SEARCH_CACHE.get(cacheKey);
      if (hit && (Date.now() - hit.ts) < SEARCH_TTL_MS) {
        return { text: hit.text, cached: true, age: cacheAgeStr(hit.ts) };
      }
    }
    // Stale-cache fallback when API is known-unavailable (public artifact context)
    if (apiAvailable === false) {
      const stale = cacheKey ? SEARCH_CACHE.get(cacheKey) : null;
      if (stale) return { text: stale.text, cached: true, stale: true, age: cacheAgeStr(stale.ts), offline: true };
      throw new Error("OFFLINE_MODE");
    }
    const headers = { "Content-Type": "application/json" };

    /* ── Streaming path, no tools (single-turn) ──
       Uses SSE streaming so the user sees tokens arrive in real time
       instead of waiting for the full response. This is the fast path for
       calls that never need tool use (e.g. Roll the Tape's CSV-only fallback).
       When tools ARE attached and onStream is provided, see the tool-use
       loop below — it streams the model's final text-generation turn after
       any tool calls resolve, so search-augmented calls (e.g. off-desk chart
       analysis) still feel fast even though the search turns themselves
       can't stream. This cuts perceived latency from the full TTFB
       (~15-30s) down to < 2s before the first visible token. */
    if (onStream && !tools) {
      const body = { model: "claude-sonnet-4-6", max_tokens: maxTokens,
        messages: [{ role: "user", content: userContent }], stream: true };
      if (system) body.system = system;
      const res = await fetch(CLAUDE_API_URL, {
        method: "POST", headers, body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        const rl = detectRateLimit(data);
        if (rl.limited) throw new Error(`Search limit reached — resets ${fmtResetTime(rl.resetsAt)} ET.`);
        throw new Error(`API error: ${data?.error?.message || res.status}`);
      }
      let accumulated = "";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (!value) continue;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
              accumulated += evt.delta.text;
              onStream(accumulated); // update UI incrementally
            }
          } catch (_) {}
        }
      }
      if (!accumulated) throw new Error("Received empty response — try again.");
      if (cacheKey) SEARCH_CACHE.set(cacheKey, { text: accumulated, ts: Date.now() });
      return { text: accumulated, cached: false };
    }

    /* ── Tool-use path (multi-turn) ──
       Tool calls themselves can't stream (need the full JSON to extract
       tool_use blocks), so turns that result in stop_reason "tool_use" are
       fetched normally. But once the model is done calling tools and is
       about to produce its final answer (stop_reason will be "end_turn"),
       we re-issue that LAST turn with stream:true if the caller passed
       onStream — so a chart that needs 1-2 web searches still streams its
       Trade Card instead of going silent for the full round-trip. */
    let messages = [{ role: "user", content: userContent }];
    let lastData = null;
    for (let turn = 0; turn < 4; turn++) {
      const isLikelyFinalTurn = turn > 0; // first turn always non-streaming to learn if tools are needed
      const wantStream = onStream && tools && isLikelyFinalTurn;
      const body = { model: "claude-sonnet-4-6", max_tokens: maxTokens, messages };
      if (system) body.system = system;
      if (tools) body.tools = tools;
      if (wantStream) body.stream = true;

      const res = await fetch(CLAUDE_API_URL, {
        method: "POST", headers, body: JSON.stringify(body),
      });

      if (wantStream) {
        if (!res.ok || !res.body) {
          // Streamed attempt failed — fall back to a normal non-streaming call for this turn
          const data2 = await fetch(CLAUDE_API_URL, {
            method: "POST", headers, body: JSON.stringify({ ...body, stream: false }),
          }).then((r) => r.json());
          lastData = data2;
          if (data2.stop_reason === "tool_use") {
            const toolBlocks = (data2.content || []).filter((b) => b.type === "tool_use");
            if (toolBlocks.length) {
              messages.push({ role: "assistant", content: data2.content });
              messages.push({ role: "user", content: toolBlocks.map((b) => ({ type: "tool_result", tool_use_id: b.id, content: b.output || "Tool executed." })) });
              continue;
            }
          }
          break;
        }
        // Stream this turn — accumulate text and stop_reason; tool_use blocks
        // can also arrive via streaming deltas, so track them too.
        let accumulated = "", stopReason = null;
        const streamToolBlocks = [];
        let curToolBlock = null;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (!value) continue;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const evt = JSON.parse(payload);
              if (evt.type === "content_block_start" && evt.content_block?.type === "tool_use") {
                curToolBlock = { type: "tool_use", id: evt.content_block.id, name: evt.content_block.name, input: "" };
              } else if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                accumulated += evt.delta.text;
                onStream(accumulated);
              } else if (evt.type === "content_block_delta" && evt.delta?.type === "input_json_delta" && curToolBlock) {
                curToolBlock.input += evt.delta.partial_json || "";
              } else if (evt.type === "content_block_stop" && curToolBlock) {
                try { curToolBlock.input = JSON.parse(curToolBlock.input || "{}"); } catch (_) { curToolBlock.input = {}; }
                streamToolBlocks.push(curToolBlock);
                curToolBlock = null;
              } else if (evt.type === "message_delta" && evt.delta?.stop_reason) {
                stopReason = evt.delta.stop_reason;
              }
            } catch (_) {}
          }
        }
        if (stopReason === "tool_use" && streamToolBlocks.length) {
          // Model wants more tool calls even on what we guessed was the final turn — continue the loop
          messages.push({ role: "assistant", content: streamToolBlocks });
          messages.push({ role: "user", content: streamToolBlocks.map((b) => ({ type: "tool_result", tool_use_id: b.id, content: b.output || "Tool executed." })) });
          lastData = { content: [], stop_reason: "tool_use" };
          continue;
        }
        lastData = { content: [{ type: "text", text: accumulated }], stop_reason: stopReason || "end_turn" };
        break;
      }

      const data = await res.json();
      // Rate-limit detection (windowed or flat) — surface reset time, reuse stale cache if any
      const rl = detectRateLimit(data);
      if (rl.limited) {
        const stale = cacheKey ? SEARCH_CACHE.get(cacheKey) : null;
        if (stale) {
          return { text: stale.text, cached: true, stale: true, age: cacheAgeStr(stale.ts), resetsAt: rl.resetsAt };
        }
        throw new Error(`Search limit reached — resets ${fmtResetTime(rl.resetsAt)} ET.`);
      }
      if (data.error) throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
      lastData = data;
      if (data.stop_reason !== "tool_use") break;
      const toolBlocks = (data.content || []).filter((b) => b.type === "tool_use");
      if (!toolBlocks.length) break;
      messages.push({ role: "assistant", content: data.content });
      messages.push({
        role: "user",
        content: toolBlocks.map((b) => ({
          type: "tool_result", tool_use_id: b.id,
          content: b.output || "Tool executed.",
        })),
      });
    }
    const text = (lastData?.content || []).map((b) => b.text || "").filter(Boolean).join("\n");
    if (!text) throw new Error("Received empty response — try again.");
    if (cacheKey) SEARCH_CACHE.set(cacheKey, { text, ts: Date.now() });
    return { text, cached: false };
  }

  /* roll the tape — AM / LUNCH / PM (ICT macro windows)
     AM ties to pre-market + open, LUNCH is the midday macro, PM ties to
     the afternoon + after-hours. Always fetches live prices for the full
     V.A.G. universe — works even with no CSVs loaded. */
  async function rollTape(session) {
    // 30-second client-side throttle — guards against rapid re-rolls hammering
    // the live search/price fetch and tripping rate limits mid-session.
    const now = Date.now();
    const sinceLast = now - lastTapeRollRef.current;
    if (sinceLast < 30000) {
      const waitS = Math.ceil((30000 - sinceLast) / 1000);
      setTapeOutput((prev) => prev ? { ...prev, throttleMsg: `Throttled — wait ${waitS}s before rolling again.` } : prev);
      return;
    }
    lastTapeRollRef.current = now;
    const sessionLabels = SESSION_LABELS, sessionGuide = SESSION_GUIDE;
    setTapeOutput({ session: sessionLabels[session], text: null, loading: true, throttleMsg: null });
    setTapeReportOpen(false); // collapse the tape panel entirely on new roll
    setTapeDetailOpen(false); // and keep details hidden too

    /* ---- seamless session-to-session continuity ----
       Load whatever the previous roll (any session, any device — shared via
       window.storage) left in its CARRYFORWARD block. The new prompt asks
       the model to open with "SINCE [prev session] — WHAT CHANGED" using
       that as the baseline, so each read feels like an update to the last
       one rather than a cold restart. */
    let prevCarry = null;
    try {
      const res = await WS.get("sbcp-prev-carry", false);
      const saved = res?.value ? JSON.parse(res.value) : null;
      if (saved?.carry && saved?.ts && (Date.now() - new Date(saved.ts).getTime() < 36 * 3600 * 1000)) {
        prevCarry = saved;
      }
    } catch (_) {}
    const carryAgo = prevCarry
      ? Math.max(1, Math.round((Date.now() - new Date(prevCarry.ts).getTime()) / 60000))
      : null;
    const carryBlock = prevCarry
      ? `CARRYFORWARD FROM PREVIOUS SESSION (${prevCarry.session}, ${carryAgo < 60 ? `${carryAgo}m ago` : `${Math.round(carryAgo / 60)}h ago`}):\n${prevCarry.carry}`
      : "CARRYFORWARD FROM PREVIOUS SESSION: none — this is the first Sigma Bond read (establish baseline, don't write 'what changed').";
    const { csvLines, needsLive, loadedCount } = buildTapeContext();
    const calCtx = calEvents.length
      ? `\nUPCOMING ECON EVENTS:\n${calEvents.map((e) => `${e.time} ${e.impact === "HIGH" ? "🔴" : e.impact === "MED" ? "🟡" : "⚪"} ${e.name}${e.forecast ? ` (fcst ${e.forecast})` : ""}`).join("\n")}`
      : "";
    const csvBlock = csvLines.length ? csvLines.join("\n") : "(no CSV data loaded — running on live data only)";

    /* mechanical overlays — computed, never guessed */
    const vw = volWeekInfo(new Date());
    const overlays = `OVERLAYS (probability overlays ONLY — never standalone directional signals):
- Volatility Cycle: ${vw.label} (next OPEX ${vw.opex})
- Seasonality: ${seasonalityLine(new Date())}`;

    /* the locked Field Report output template */
    const playbookName = { am: "OPENING BELL", lunch: "MIDDAY DRIVE", pm: "CLOSING DRIVE" }[session];
    const template = `OUTPUT FORMAT — follow this Field Report template exactly, clear and actionable:

🏈 VIGILANT ALPHA GROUP — SIGMA BOND DESK
ROLL THE TAPE — ${sessionLabels[session].replace(" MACRO", "")} FIELD REPORT
As of [current date] | [session window]

🎯 SNAPSHOT SUMMARY — THIS IS THE PRIMARY READ. Write it last but place it first. Maximum 5 lines, no sub-bullets, no hedging. If a user reads ONLY this block they must know exactly what the market is doing and what to do about it. Hard format — do not deviate:
Regime: [RISK-ON / RISK-OFF / MIXED] · [W1-W4 + OPEX status] · [one tight clause: e.g. "tech-led expansion, breadth confirming"]
Bias: [A+ LONG in XLK/NVDA — gate reasoning in 10 words] OR [A+ SHORT in XLE — gate reasoning] OR [NO EDGE — stand aside, reason in 8 words]
Plan: [one sentence: what to BUY or SHORT right now, specific sector or ticker, with the ONE level that would invalidate it]
Watch: [the single most important price or event in the next 2 hours]
Updated: [time ET] — re-roll [next session name] for a fresh read.

${prevCarry ? `🔄 SINCE ${prevCarry.session} (${carryAgo < 60 ? `${carryAgo}m ago` : `${Math.round(carryAgo / 60)}h ago`}) — WHAT CHANGED — using the CARRYFORWARD FROM PREVIOUS SESSION below as the baseline, call out in tight bullet-style lines: which open scenarios played out vs didn't, any bias shift, levels reclaimed/lost, sector rotation changes since then. This is the continuity hook — make it read like an update, not a cold restart.` : `🔄 FIRST READ — no prior carryforward exists. State this is the baseline Sigma Bond read for the day; future sessions will reference it.`}

🚨 FLAG ON THE PLAY — open with the single biggest contradiction or tension in today's tape (conflicting officiating signals: e.g. risk-on impulse vs risk-off data). If signals conflict, say plainly whether this is a trend day or a reaction day. If the tape is clean, say so and move on.

🏈 ALPHA CANNON (WEEKLY / DAILY) — macro regime state in bullet form. Classify the current move: Risk-On = tactical or structural? Relief rally until proven otherwise?

🏈 FIELD POSITION — SPY and QQQ with ACTUAL fetched prices and key levels. Referee call on field position (own territory / midfield / red zone). State whether the generals (NVDA/MSFT/GOOGL mega-caps) are leading or lagging.

🏈 POSSESSION REPORT — which sectors have the ball, 🟢 marked, blending CSV grades with live moves. Wherever seasonality or the vol calendar CONFLICTS with price, throw a challenge flag and resolve it per the rulebook: calendars are probability overlays only — price + institutional participation override them. Give a referee ruling per conflict (e.g. "Play remains live, conviction downgraded").

🏈 DEFENSIVE FRONT — the contested battleground (usually Tech). State which side has the advantage, or "advantage undecided."

🏈 VOLATILITY CYCLE OVERLAY — use the computed week supplied above. Remind: expansion means larger moves, not a direction.

🏈 MARKET INTERNALS SCORECARD — two-column "Factor | Status" table: Inflation, Geopolitics, VIX, Bonds, leading sectors, Tech leadership, Breadth, Institutional confidence.

🏈 SIGMA BOND GAME STATE — one line each:
Alpha Cannon: … / Alpha Engine: … / Alpha Fox: … / Sigma Bond: …

🎯 ${playbookName} PLAYBOOK — 2–3 scenarios ranked by probability, each ending in a referee call (False Start / Play On / Delay of Game / etc.).

🏈 FINAL WHISTLE — tape summary; where institutional sponsorship is strongest and weakest; the Sigma Bond ruling — name the A+ edge with gate reasoning, or state explicitly "No A+ market-wide directional edge." Close with four one-liners:
Current Game State: … / Possession: … / Field Position: … / Official Call: …

🏹 CALL TO ACTION (3 lines max — the decisive output):
EXECUTE: [exactly what to do — "Long XLK above $X targeting $Y, stop $Z" — or "Stand aside — no edge confirmed"]
SIZE: [full / half / quarter position — based on Alpha Fox window status and Con Score]
NEXT TRIGGER: [the one price or event that changes this read]

📋 CARRYFORWARD — 4-6 short plain-text lines (no sub-headers) capturing: current Game State, open scenarios still in play, key levels to watch, and what the NEXT session needs to confirm. This is read by the next session's prompt for continuity — write it for that purpose, not for this session's reader.

After the CARRYFORWARD lines, write a line containing only --- (three hyphens, nothing else), then the mandatory mindful quote.

GUARDRAILS: Before output, silently self-critique for structural clarity, framework alignment, and overreach. If institutional sponsorship is NOT confirmed by the data, state the uncertainty explicitly. Never present seasonality or the vol calendar as a directional signal. Every section must end in a read the trader can act on.`;

    // The fetch list: prioritize tickers not covered by CSVs, always include core indices
    const coreAlways = ["SPY","QQQ","IWM","DIA","VIX","XLK","XLF","XLE","XLV","XLI","XLY","XLP","XLU"];
    const fetchList = [...new Set([...coreAlways, ...needsLive.slice(0, 30)])];

    const system = "You are the Sigma Bond Co-Pilot for Vigilant Alpha Group — an institutional-grade market state interpreter running the Bebes Kids framework (Rogue Alpha discipline, Alpha Engine bias, Alpha Fox timing, Alpha Cannon macro regime, converging in Sigma Bond). You interpret market state, you do not predict. Apply top-down HTF→LTF synchronization: Macro → Sectors → Stocks funnel. Use football referee terminology for all structural explanations. Only surface A+ setups with all gates aligned; if no edge exists, say so explicitly. CRITICAL OUTPUT DISCIPLINE: you write the Field Report template exactly ONCE, start to finish, in one continuous pass. Complete ALL research (market status, prices, news) before writing the first line — never begin drafting the template and then stop partway through to restart it because you discovered a new fact (e.g. a market holiday). If you learn something mid-research that changes the read, that's fine — fold it into the single draft you write after research is done. Writing the template, or any section of it, more than once in the same response is a critical failure, not a correction.";

    const promptWithSearch = `It is the ${sessionLabels[session]} update for Vigilant Alpha Group Sigma Bond desk.

STEP 1 — VERIFY MARKET STATUS FIRST (mandatory, before any other research or writing): search to confirm whether U.S. markets are open or closed today (federal holidays, early closes, OPEX/triple-witching shifts). Resolve this BEFORE you begin drafting the report — if today is a holiday or an unusual session, that fact must shape your FIRST and ONLY draft of the Snapshot Summary and header, not a correction issued partway through. You get exactly one pass at this report: research everything you need (market status, prices, news) BEFORE writing a single line of the template, then write the template once, start to finish, in order, with no restarts.

${carryBlock}

CSV SNAPSHOT (${loadedCount} symbols graded — latest loaded watchlists):
${csvBlock}${calCtx}

${overlays}

LIVE PRICE FETCH — search current price and % change for ALL of these right now:
${fetchList.join(", ")}
Also search: major market-moving news headlines in the last 2 hours, AND today's market-status (step 1 above).

Using everything you just researched (market status, CSV grades, live prices, news), deliver the ${sessionLabels[session]} tape read as ONE continuous pass through the template below — write it exactly once, in order, top to bottom. Do not restart the template, repeat any section, or issue a "correction" partway through; if you need to fold in a fact discovered late in your research (e.g. a holiday closure), do that by adjusting the Snapshot Summary and header wording you write the FIRST time, not by writing the report twice.
Focus: ${sessionGuide[session]}

${template}`;

    const promptCSVOnly = `It is the ${sessionLabels[session]} update for Vigilant Alpha Group Sigma Bond desk.
(Live search unavailable — snapshot analysis only; flag any live-data sections as "snapshot only".)

${carryBlock}

CSV SNAPSHOT (${loadedCount} symbols graded):
${csvBlock}${calCtx}

${overlays}

Deliver the ${sessionLabels[session]} tape read. Focus: ${sessionGuide[session]}

${template}`;

    let text, note = "";
    try {
      // Cache key includes session + loaded-symbol count so a new CSV load refreshes it
      const key = `tape:${session}:${loadedCount}`;
      const r = await callClaude({
        system, maxTokens: 2400,
        userContent: promptWithSearch,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        cacheKey: key,
      });
      text = r.text;
      if (r.stale) note = `[Rate limited — showing cached read from ${r.age}; live resets ${fmtResetTime(r.resetsAt)} ET]\n\n`;
      else if (r.cached) note = `[Cached read from ${r.age} — roll again after 5 min for fresh live data]\n\n`;
    } catch (err1) {
      if (err1.message === "OFFLINE_MODE") {
        text = `🔌 OFFLINE / STATIC MODE\n\nThis desk is running in a public browser context where live API calls are not available.\n\nYour CSV data is fully loaded and graded below — all A+/Verdict/Sigma scores, WITS, Con Score, and regime analysis are derived from your watchlist data and require no live connection.\n\nTo access live Roll the Tape:\n• Open this artifact inside claude.ai (in-app, logged in)\n• Or paste this session's data into a new claude.ai conversation\n\n📋 DESK SNAPSHOT (from loaded CSV)\n${buildTapeContext().csvLines.slice(0,30).join("\n")}`;
      } else {
        try {
          const r2 = await callClaude({
              system, maxTokens: 1800, userContent: promptCSVOnly,
              onStream: (partial) => setTapeOutput({ session: sessionLabels[session], text: partial, loading: true }),
            });
          text = `[Live prices unavailable: ${err1.message}]\n\n${r2.text}`;
        } catch (err2) {
          if (err2.message === "OFFLINE_MODE") {
            text = `🔌 OFFLINE / STATIC MODE — live tape unavailable in this context. Your graded CSV data is fully available in the board below.`;
          } else {
            text = `Tape read failed.\nPrimary: ${err1.message}\nFallback: ${err2.message}`;
          }
        }
      }
    }
    // Defensive backstop — strip a duplicate template restart if the model
    // wrote the report twice despite the single-pass instructions above.
    text = dedupeRestart(text);
    setTapeOutput({ session: sessionLabels[session], text: note + (text || ""), loading: false });

    /* persist the LAST SNAPSHOT (full report) so a trader who steps away
       and reopens the desk sees the most recent read instead of a blank
       Roll-the-Tape panel — localStorage is primary (confirmed working on
       every device/viewer); window.storage is a best-effort cross-device
       bonus on top, same pattern as everything else. Restored on mount
       below with a "saved [time] ago" badge so it's clearly not live. */
    if (text) {
      const snap = JSON.stringify({ session: sessionLabels[session], text: note + text, ts: new Date().toISOString() });
      try { localStorage.setItem("sbcp-last-tape", snap); } catch (_) {}
      WS.set("sbcp-last-tape", snap, false).catch(() => {});

      /* Discord (Captain Hook) — v2026-06-20k: trade-card-style layout.
         When the LLM response is available, parses the Snapshot Summary and
         Call to Action into a structured card. When the API is offline
         (no Anthropic key), builds a CSV-only snapshot card from loaded data
         so Discord still gets a meaningful report. */
      if (discordOn) {
        const now2 = new Date();
        const dateTag2 = now2.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
        const timeTag2 = now2.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/New_York" }) + " ET";
        const divider2 = "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬";
        const sessionLabel = sessionLabels[session].replace(" MACRO", "");
        const dedupKey2 = `tape-${etDateKey(new Date())}-${session}`;

        if (text) {
          // ── LLM response available — parse structured card ──
          const smMatch = text.match(/🎯[^\n]*SNAPSHOT SUMMARY[^\n]*\n([\s\S]*?)(?=\n🔄|\n🚨|\n*$)/i);
          const ctaMatch = text.match(/🏹[^\n]*CALL TO ACTION[^\n]*\n([\s\S]*?)(?=\n📋|\n---|\n*$)/i);
          const summary = smMatch ? smMatch[1].trim() : null;
          const cta = ctaMatch ? ctaMatch[1].trim() : null;

          if (summary) {
            const lines2 = summary.split("\n").map(l => l.trim()).filter(Boolean);
            const regime2 = lines2.find(l => l.startsWith("Regime:")) || "";
            const bias2   = lines2.find(l => l.startsWith("Bias:"))   || "";
            const plan2   = lines2.find(l => l.startsWith("Plan:"))   || "";
            const watch2  = lines2.find(l => l.startsWith("Watch:"))  || "";
            const ts2     = lines2.find(l => l.startsWith("Updated:")) || "";

            const biasFmt = bias2.includes("NO EDGE") ? `⚪ ${bias2}` : bias2.toLowerCase().includes("short") ? `🔴 ${bias2}` : bias2 ? `🟢 ${bias2}` : "";

            const ctaLines = cta ? cta.split("\n").map(l => l.trim()).filter(Boolean) : [];

            const msg = [
              `🏈 **VAG SIGMA BOND · ${sessionLabel} FIELD REPORT** | ${dateTag2} ${timeTag2}`,
              divider2,
              regime2 ? `📡 **${regime2}**` : "",
              biasFmt,
              plan2   ? `🎯 ${plan2}` : "",
              watch2  ? `👀 ${watch2}` : "",
              ctaLines.length ? divider2 : "",
              ctaLines.length ? `🏹 **CALL TO ACTION**` : "",
              ...ctaLines.map(l => `  ${l}`),
              ts2 ? divider2 : "",
              ts2 ? `_${ts2}_` : "",
            ].filter(Boolean).join("\n");

            postDiscord(msg.slice(0, 1990), { dedupKey: dedupKey2 });
          }
        } else {
          // ── No LLM (API offline / no key) — CSV-only snapshot ──
          const allRows = [...gMacroLive, ...gSectorLive, ...gStocksLive, ...gScansLive].filter((r) => !r.isOptions);
          const aplusLong  = allRows.filter((r) => r.verdict === "A+ LONG").sort((a,b) => b.sigma - a.sigma).slice(0, 3);
          const aplusShort = allRows.filter((r) => r.verdict === "A+ SHORT").sort((a,b) => b.sigma - a.sigma).slice(0, 3);

          const favLongs  = favored?.longs?.map((g)  => `${g.symbol}(Σ${g.sigma})`).join(" · ") || "—";
          const favShorts = favored?.shorts?.map((g) => `${g.symbol}(Σ${g.sigma})`).join(" · ") || "—";

          const longLines  = aplusLong.map((r)  => `  🟢 **${r.symbol}** Σ${r.sigma} · ${r.wits?.label || "—"}`).join("\n");
          const shortLines = aplusShort.map((r) => `  🔴 **${r.symbol}** Σ${r.sigma} · ${r.wits?.label || "—"}`).join("\n");

          const msg = [
            `🏈 **VAG SIGMA BOND · ${sessionLabel} SNAPSHOT** | ${dateTag2} ${timeTag2}`,
            `_(MW-only · LLM offline)_`,
            divider2,
            aplusLong.length  ? `**A+ LONG SETUPS**\n${longLines}`  : "No A+ LONG setups loaded",
            aplusShort.length ? `**A+ SHORT SETUPS**\n${shortLines}` : "No A+ SHORT setups loaded",
            divider2,
            `📋 Favored sectors`,
            `  🟢 ${favLongs}`,
            `  🔴 ${favShorts}`,
            divider2,
            `_Load all MW tiers for full Sigma Bond analysis_`,
          ].join("\n");

          postDiscord(msg.slice(0, 1990), { dedupKey: dedupKey2 });
        }
      }
    }

    /* extract the CARRYFORWARD block (between the 📋 header and the ---
       delimiter) and persist it for the NEXT session's continuity prompt —
       shared via window.storage so any device's next roll picks it up. */
    if (text) {
      const m = text.match(/📋[^\n]*CARRYFORWARD[^\n]*\n([\s\S]*?)(?=\n-{3,}\s*\n|\n*$)/i);
      const carry = m ? m[1].trim() : null;
      if (carry) {
        WS.set("sbcp-prev-carry", JSON.stringify({
          session: sessionLabels[session], ts: new Date().toISOString(), carry,
        }), false).catch(() => {});
      }
    }
  }

  /* ---- Auto Roll-the-Tape (2 snapshots per session, per ET day, per device) ----
     Fires the matching AUTO_TAPE_SLOTS read automatically when the desk is
     open during one of the 6 daily windows, so the trader sees a fresh
     Field Report just by opening the app — no manual tap required. Dedup is
     local (localStorage, one key per SLOT, not per session) so am1/am2,
     lunch1/lunch2, and pm1/pm2 each fire independently even though a pair
     shares a session label. The 5-min search cache + 30s throttle inside
     rollTape still apply, so this never spams the API. A roll already in
     flight is never overridden. */
  useEffect(() => {
    const slot = currentAutoTapeSlot(now);
    if (!slot) return;
    if (tapeOutput?.loading) return; // a roll is already in flight
    const key = `sbcp-autotape-${etDateKey(now)}-${slot.id}`;
    try {
      if (localStorage.getItem(key)) return; // already auto-rolled this slot today
      localStorage.setItem(key, "1");
    } catch (_) { /* if storage is unavailable, fall through and roll anyway */ }
    rollTape(slot.session);
  }, [now, tapeOutput]);

  /* ---- Weekly econ calendar auto-fetch (cached until end of week) ----
     Fetches once per ISO week (Mon-Sun, i.e. through this week's EOW), then
     reused for every reload/device the rest of the week — no repeat
     web_search calls = no repeat tokens. Two layers, checked fastest-first:
       1. localStorage (this device, instant, synchronous) — survives even
          if window.storage has issues.
       2. window.storage (account-scoped, cross-device) — desktop fetches
          Monday, mobile reads the same cached result all week.
     Manual ↻ Refresh still force-fetches and rewrites both layers. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const wk = isoWeekKey(new Date());
      // 1. local, synchronous, same-device
      try {
        const local = localStorage.getItem("sbcp-calendar-local");
        if (local) {
          const saved = JSON.parse(local);
          if (saved?.weekKey === wk && Array.isArray(saved.events) && saved.events.length) {
            setCalEvents(saved.events);
            setCalMeta({ source: "local", at: saved.fetchedAt, weekKey: wk });
            return;
          }
        }
      } catch (_) {}
      // 2. cross-device, account-scoped
      try {
        const res = await WS.get("sbcp-calendar", false);
        const saved = res?.value ? JSON.parse(res.value) : null;
        if (saved?.weekKey === wk && Array.isArray(saved.events) && saved.events.length) {
          if (!cancelled) {
            setCalEvents(saved.events);
            setCalMeta({ source: "shared", at: saved.fetchedAt, weekKey: wk });
            try { localStorage.setItem("sbcp-calendar-local", JSON.stringify(saved)); } catch (_) {}
          }
          return;
        }
      } catch (_) {}
      if (cancelled) return;
      await fetchCalendar(false, wk);
    })();
    return () => { cancelled = true; };
  }, []);
  async function analyzeChart() {
    if (chartMode === "image" && !chartImg) return;
    if (chartMode === "notes" && !chartNotes.trim()) return;
    setChartAnalysis({ loading: true, text: null });
    const { csvLines } = buildTapeContext();
    const ctx = csvLines.join("\n") || "(no CSV data loaded)";
    const vw = volWeekInfo(new Date());
    const eow = isEOWWindow(new Date());

    const candleWorkflow = `OUTPUT FORMAT — HARD RULE, NOT A SUGGESTION:
Your entire response must contain EXACTLY two blocks and nothing else:
  1. The 🃏 SIGMA BOND TRADE CARD (template below)
  2. The 🟨 REFEREE CARD (template appended separately below, after this prompt)
Nothing may appear before the Trade Card, between the two cards, or after the Referee Card.
Specifically forbidden, even if it feels helpful: a "Supporting Analysis" section, a numbered
step-by-step breakdown, a restatement of the workflow you followed, bullet-point reasoning,
or any sentence that isn't one of the labeled fields in the two templates. If you find yourself
about to write a sentence that isn't a Trade Card or Referee Card field, stop and omit it instead.
The trader only ever sees these two blocks — any other text is generated but never read, so it is
pure waste and actively slows down the response they're waiting on for a live trade decision.

🃏 SIGMA BOND TRADE CARD
Symbol: [identify from chart — ticker label/watermark/title bar — do NOT assume from context]
HTF Bias: [BULLISH / BEARISH / NEUTRAL]
A+ Setup: [YES / NO / NOT YET]
Execution: [PLAY ON / WAIT / NO TRADE]
Strat Pattern: [name the #TheStrat In-Force/Actionable pattern if visible, e.g. "2-1-2 Bullish Reversal" — else "unclear from this timeframe"]
Field Position: [PREMIUM / DISCOUNT / BALANCED — derived per the Field Position Rule below]
Entry Zone: [$X.XX – $X.XX] or ["no valid entry zone visible"]
Stop: [$X.XX — one-word structural reference, e.g. "below FVG" or "below swing low"]
Target 1: [$X.XX — Xr] — derived per the Target Rule below
Target 2: [$X.XX — Xr] — derived per the Target Rule below
Position Size: [FULL / HALF / QUARTER — based on setup quality and execution window]
Desk Cross-Check: [if symbol appears in the desk CSV context below: "CONFIRM" or "CONFLICT" vs Σ/WITS/Con Score, one clause. If NOT in desk CSV: "off-desk — technical + web-search read, Sigma Bond framework terms not applied"]
One Sentence Read: [the single most important thing about this chart — what to do or why to wait]

FIELD POSITION RULE (mandatory, do not skip — premium/discount must be computed, never eyeballed):
1. Identify the dealing range: the most recent clean swing high and swing low visible on the chart at the timeframe shown (for an intraday chart, prefer the current session's range; for a daily/weekly chart, use the most recent impulse leg). State both numbers — you cannot skip to a verdict without them.
2. Range width = swing high − swing low. Equilibrium = swing low + (range width / 2).
3. Compute where current price sits as a fraction of the range: position% = (current price − swing low) / range width, expressed 0–100%.
   - position% ≥ 55% → PREMIUM (favors shorts / selling premium)
   - position% ≤ 45% → DISCOUNT (favors longs / buying premium)
   - position% between 45% and 55% → BALANCED
   This banding is a percentage OF THE RANGE WIDTH, never a percentage of the raw price — a 5% band on price would be meaningless on a $400 stock (≈$20) and absurdly tight on a $2 stock (≈$0.10). Always normalize to range width.
4. State the swing high/low, the computed position%, and the verdict together in the Referee Card's Field Position line (e.g. "Discount — range $81.20–$88.40, price at 22% of range").
5. If no clean swing range is visible on the chart, write "BALANCED — no clean range visible" rather than guessing. Do not invent a range to force a verdict.

TARGET RULE (mandatory, do not skip — find the level FIRST, compute R-multiple SECOND; never work backward from a desired R-multiple to pick a level):
1. Identify Target 1 by scanning the chart in the trade's direction for the NEAREST of: an unfilled FVG, the opposite side of the dealing range used in the Field Position Rule, a prior swing high/low, or a clean prior consolidation high/low. Pick whichever of these is physically nearest to current price — do not skip past a nearer level to reach one that "looks like" a cleaner 2r target.
2. Identify Target 2 the same way: the NEXT objective liquidity draw beyond Target 1 in the same direction (the next FVG, swing point, or the full measured move of the most recent impulse leg) — again, nearest first, not best-looking-R first.
3. Only after both price levels are picked from the chart, compute R-multiple = (target price − entry price) / (entry price − stop price), rounded to one decimal, and report it as "Xr" next to each target. The resulting R-multiples are an OUTPUT of this process, not an input — there is no target R-multiple to hit. If Target 1 computes to 0.8r or 6r, report that number; do not adjust the level choice to make the R "look better."
4. Every target must be tied to a visible chart level (an FVG edge, a swing point, a round structural level) — never a generic ATR multiple or arbitrary percentage. If no second objective level is visible, write "Target 2: not visible — single target only."
5. Stop must be a real structural invalidation point (below/above the immediate swing or FVG that, if broken, proves the setup wrong) — never a fixed percentage or dollar amount chosen independently of structure.
6. Before writing the final numbers, silently check: did I pick Target 1/Target 2 by proximity to a real level, or did I pick a level because its R-multiple looked clean? If the latter, redo it using proximity only.

Rules:
- STEP 0 (before writing anything): identify the ticker from the image — label, title bar, watermark. Put it in the Trade Card. Do not assume from desk context.
- DESK CONTEXT GATING (mandatory — check this before writing the Trade Card): the desk CSV context below contains exactly four tiers — Futures, Sectors, Stocks, Scans. After identifying the ticker in Step 0, check whether it appears in ANY of those four tiers.
  - ON-DESK (ticker found in Futures/Sectors/Stocks/Scans): use Sigma Bond framework language freely — Σ score, WITS state, Con Score, A+ verdict — and the Desk Cross-Check field should compare your chart read against those CSV values (CONFIRM or CONFLICT).
  - OFF-DESK (ticker not found in any of the four tiers): this is a technicals + web-search read, full stop. Do NOT use Σ score, WITS, Con Score, or "A+" verdict language anywhere in the output — those terms only exist for symbols on the desk. Grade the chart purely on visible technicals (market structure, FVGs, the Strat pattern, premium/discount field position, volume if shown) PLUS live web search: search for the ticker's recent price action, any relevant news, and sector context, and fold that into the read. The Desk Cross-Check field must read "off-desk — technical + web-search read, Sigma Bond framework terms not applied" verbatim.
  - Use the web_search tool for off-desk tickers before writing the Trade Card — do not skip this step even if you recognize the symbol from training data, since price/news context changes daily.
- The Trade Card is the decisive output. Someone reading ONLY the Trade Card must know: act or wait, where to enter, where to stop, why those specific target prices, and where price sits in its range.
- If no A+ edge exists: Trade Card says "Execution: NO TRADE" and One Sentence Read explains why.
- If chart data is blurry or key levels are unreadable: say so in the Trade Card. Do not invent price levels.
- Overlay context (probability only): Volatility Cycle = ${vw.label} (next OPEX ${vw.opex}); Seasonality = ${seasonalityLine(new Date())}.

${CLASSICAL_PATTERNS_REFERENCE}`;

    /* v2026-06-20e: sector-grid analysis can now run any day (see userText
       below — classification is no longer calendar-gated), so this template's
       own wording is made conditional on `eow` directly rather than relying
       on a separate prose instruction to override hardcoded "next week"
       language — more reliable than hoping the model correctly overrides
       template text it's also being told to follow exactly. */
    const horizonLabel = eow ? "next week" : "the rest of this week";
    const eowWorkflow = `1. Sector Grid Read — transcribe what's visible: which sectors/ETFs are shown, their left-to-right rank order, and the RS/relative-strength values or visual ordering.
2. RS vs $SPX — identify leaders (RS expanding, outperforming $SPX) vs laggards (RS contracting, underperforming $SPX). $SPX is the cash index benchmark, not SPY.
3. Cross-check vs desk CSV — compare the screenshot's ranking against the SECTORS/FUTURES lines in the desk context below (Σ scores, WITS, Con Score for the same tickers). Note CONFIRM or CONFLICT.
4. Sector Rotation Map — where is money flowing INTO and OUT OF heading into ${horizonLabel}, based on the grid + desk context together.
5. Seasonality &amp; Volatility Cycle cross-check — Volatility Cycle = ${vw.label} (next OPEX ${vw.opex}); Seasonality = ${seasonalityLine(new Date())}. Probability overlays ONLY — note whether they align with or conflict with the grid's rotation read; never treat as standalone signals.
6. Alpha Cannon Carryover — macro regime posture heading into ${horizonLabel} (Risk-On / Risk-Off / Mixed), drawn from the desk context's REGIME and MACRO lines.
7. ${eow ? "Next-Week" : "Current"} Watchlist — top 3-5 sector longs (with 1-2 representative names each, drawn from the desk context's STOCKS/SCANS lines or general sector leaders if not loaded) and top 2-3 sector shorts/avoids.
8. ${eow ? "EOW" : "Mid-Week"} Sigma Bond Ruling — overall stance for ${horizonLabel} in one paragraph.

MANDATORY OUTPUT BLOCK (end with exactly these lines):
- Posture for ${horizonLabel} (RISK-ON / RISK-OFF / MIXED)
- Top sector longs (ranked)
- Top sector shorts / avoid (ranked)
- Top stock ideas (2-4, with sector)
- One Sentence Read for ${horizonLabel}

Rules:
- Never guess a sector's position in the rank order if the image is unclear — say "unclear, please confirm."
- Seasonality and Volatility Cycle are probability overlays only — they inform conviction, never dictate direction on their own.
- If the desk CSV context has no SECTORS line loaded, rely on the screenshot alone and note that the cross-check (step 3) is unavailable.`;

    const userText = `An image has been uploaded.

STEP 0 — CLASSIFY THE IMAGE FIRST (always run this step, regardless of day/time):
(A) A sector/relative-strength GRID or TABLE (rows/columns of tickers, RS rankings, sector ETF comparison, a multi-panel watchlist screenshot showing several symbols at once) -> run the SECTOR GRID ANALYSIS framework below.
(B) A price/candlestick CHART for a single symbol -> run the standard 13-STEP CANDLE WORKFLOW below.

State which classification you chose in one line, then run ONLY that framework.

=== SECTOR GRID ANALYSIS (use if classification A) ===
${eow
  ? `It is the EOW (end-of-week) window — Friday 15:45 ET through Sunday. This is a next-week planning read.`
  : `It is a mid-week read (outside the Friday 15:45 ET-through-Sunday EOW window). This is a current sector-rotation snapshot, not a next-week plan.`}
${eowWorkflow}

=== 13-STEP CANDLE WORKFLOW (use if classification B) ===
${candleWorkflow}

Current desk context:
${ctx}`;

    /* Referee Card — structural summary appended directly after the Trade Card.
       These two blocks are the entire output — nothing else is permitted. */
    const refereeCard = `

---
🟨 REFEREE CARD
HTF Bias: [BULLISH / BEARISH / NEUTRAL] — one sentence
Field Position: [PREMIUM / DISCOUNT / BALANCED] — one sentence stating the swing high/low range anchor and the computed range-width position% used (per the Field Position Rule above)
Market Structure: [BOS / CHOCH / MSS] — one sentence
Execution: [PLAY ON / WAIT / NO TRADE] — one sentence + why
---`;

    const system = "You are the Bebes Kids Trading Copilot — the Sigma Bond chart analyst for Vigilant Alpha Group. Your ONLY output is exactly two blocks: a 🃏 SIGMA BOND TRADE CARD followed by the 🟨 REFEREE CARD template appended to your prompt. Never write a separate supporting-analysis section, numbered breakdown, restated workflow, bullet-point reasoning, or any sentence that isn't a labeled field in those two templates — the trader only ever sees these two blocks, so any other text is generated but never read. You have a web_search tool: use it for any ticker not present in the desk CSV context, to pull current price/news/sector context before grading. Always read top-down HTF→LTF. Use football referee terminology for structure. Identify the ticker from the image — never assume it from context. Only use Sigma Bond framework language (Σ, WITS, Con Score, A+) when the ticker is present in the desk CSV context; otherwise grade purely on visible technicals plus web search results, and do not use Sigma Bond terms at all for that symbol. Derive Field Position (premium/discount/balanced) by computing where price sits as a PERCENTAGE OF THE SWING-HIGH-TO-SWING-LOW RANGE WIDTH (never a percentage of raw price, which breaks at high- and low-priced names) — never guess. Derive every target by finding the nearest visible chart level first (FVG, swing point, measured move) and computing its R-multiple second — never pick a level because its R-multiple looks clean. A classical chart-pattern reference is included in your prompt — use it silently as identification and measurement criteria to sharpen Strat Pattern, Stop, Target 1/2, and Execution when a recognizable structure is visible; it is reasoning material only, never a new output field, and you say nothing about it if no pattern is clearly visible rather than forcing a fit. If the setup is not A+, say NO TRADE explicitly — do not manufacture conviction. Never invent price levels for unclear chart data — write 'not visible'. Seasonality and Volatility Cycle are probability overlays only, never standalone signals. Before finalizing output, silently verify three things: (1) is the response ONLY the Trade Card and Referee Card with nothing else, (2) is Field Position computed as a range-width percentage rather than guessed, (3) were targets chosen by proximity to a real level rather than backward from a target R-multiple. If any check fails, revise before responding.";

    try {
      let userContent;
      if (chartMode === "notes") {
        /* Text-based chart notes — include strat patterns reference for pattern identification */
        userContent = [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: STRAT_PATTERNS_B64 } },
          { type: "text", text: `CHART NOTES SUBMITTED (text-based analysis — no image uploaded):\n\n${chartNotes.trim()}\n\n${userText}${refereeCard}\n\nThe first image above is the #TheStrat In-Force + Actionable pattern reference. Cross-reference the noted setup against these patterns and name the specific pattern (e.g. "2-1-2 Bullish Reversal") in the Trade Card's Strat Pattern line if applicable. Do not write any analysis outside the Trade Card and Referee Card — output ONLY those two blocks, exactly as instructed above.` }
        ];
      } else {
        const base64 = chartImg.split(",")[1];
        const mediaType = chartImg.split(";")[0].split(":")[1] || "image/jpeg";
        /* Pass both the chart AND the strat patterns reference — Claude sees both images */
        userContent = [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: STRAT_PATTERNS_B64 } },
          { type: "text", text: `The first image is the trader's chart. The second image is the #TheStrat In-Force + Actionable pattern reference.\n\n${userText}${refereeCard}\n\nCross-reference the chart's candle structure against the #TheStrat patterns in the second image. Name the specific pattern (e.g. "2-1-2 Bullish Reversal", "3-1-2 Bullish Reversal", etc.) in the Trade Card's Strat Pattern line if a recognisable formation is present. If no clear Strat pattern is visible, state "Strat pattern: unclear from this timeframe". Do not write any analysis outside the Trade Card and Referee Card — output ONLY those two blocks, exactly as instructed above.` }
        ];
      }
      /* Stream chart analysis for instant feedback — trader sees Trade Card tokens
         arrive within 1-2s instead of waiting for the full 2200-token response */
      /* web_search is required for off-desk tickers (DESK CONTEXT GATING above
         instructs the model to search for off-desk symbols) — without this the
         model had no way to act on that instruction. callClaude now streams
         the FINAL text-generation turn even when tools are attached (tool-call
         turns themselves can't stream, but once the model is done searching
         and starts writing the Trade Card, that turn streams normally) — so
         on-desk charts (no search needed) and off-desk charts (1-2 searches
         then a streamed answer) both get fast, visible token-by-token output. */
      const r = await callClaude({
        maxTokens: 1800, system, userContent,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        onStream: (partial) => setChartAnalysis({ loading: true, text: partial }),
      });
      setChartAnalysis({ loading: false, text: r.text });
      // Chart analysis results shown in UI only — not sent to Discord (Roll the Tape only policy)
    } catch (err) {
      if (err.message === "OFFLINE_MODE") {
        setChartAnalysis({ loading: false, text: "🔌 OFFLINE / STATIC MODE\n\nChart Analysis requires a live API connection not available in this public context.\n\nOptions:\n• Switch to Chart Notes mode (paste Ticker, HTF Bias, FVG, POI, Setup text) — this works offline\n• Open in claude.ai (logged in) for image-based analysis" });
      } else {
        setChartAnalysis({ loading: false, text: `Chart analysis error: ${err.message}` });
      }
    }
  }

  /* chart image input handler */
  function handleChartFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setChartImg(reader.result); setChartAnalysis(null); };
    reader.readAsDataURL(f);
    e.target.value = "";
  }
  function handleChartPaste(e) {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const reader = new FileReader();
    reader.onload = () => { setChartImg(reader.result); setChartAnalysis(null); };
    reader.readAsDataURL(item.getAsFile());
  }

  /* economic calendar fetch */
  async function fetchCalendar(force = false, wk = null) {
    setCalLoading(true);
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
    const dayKey = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
    const weekKey = wk || isoWeekKey(new Date());
    const prompt = `Today is ${today} (Eastern Time). Search for this week's economic calendar.

List the KEY high and medium impact US events today and the rest of this week.
Focus on: FOMC, CPI, PPI, PCE, NFP/jobs, retail sales, GDP, ISM, PMI, jobless claims, Fed speakers, major earnings.

Return ONLY a JSON array, no other text, no markdown:
[{"time":"Tue 8:30am ET","name":"CPI MoM","impact":"HIGH","forecast":"0.3%","previous":"0.4%"},...]

Impact must be exactly "HIGH", "MED", or "LOW". Up to 15 events.`;

    try {
      const r = await callClaude({
        maxTokens: 800,
        userContent: prompt,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        cacheKey: `cal:${dayKey}`,
        force,
      });
      const jsonMatch = r.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const events = JSON.parse(jsonMatch[0]);
        const arr = Array.isArray(events) ? events : [];
        setCalEvents(arr);
        if (arr.length) {
          const fetchedAt = new Date().toISOString();
          const payload = JSON.stringify({ weekKey, events: arr, fetchedAt });
          setCalMeta({ source: "live", at: fetchedAt, weekKey });
          WS.set("sbcp-calendar", payload, false).catch(() => {});
          try { localStorage.setItem("sbcp-calendar-local", payload); } catch (_) {}
        }
      } else {
        setCalEvents([{ time: "—", name: "Could not parse calendar — try again.", impact: "LOW" }]);
      }
    } catch (err) {
      if (err.message === "OFFLINE_MODE") {
        setCalEvents([{ time: "—", name: "Offline mode — calendar unavailable in public context. Open in claude.ai for live data.", impact: "LOW" }]);
      } else {
        setCalEvents([{ time: "—", name: err.message, impact: "LOW" }]);
      }
    }
    setCalLoading(false);
  }

  const dateStr = now.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "America/New_York", timeZoneName: "short",
  });

  return (
    <div style={S.shell}>
      <style>{CSS}</style>

      {/* ===== HEADER ===== */}
      <header style={S.header}>
        <div style={S.brandWrap}>
          {/* VAG logo */}
          <img src={VAG_LOGO_SRC} alt="Vigilant Alpha Group"
            style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover",
              flexShrink: 0, border: `1.5px solid ${COL.gold}66` }} />
          <div style={{ minWidth: 0 }}>
            <div style={S.brand}>VIGILANT <span style={{ color: COL.gold }}>ALPHA GROUP</span></div>
            <div style={{ fontFamily: mono, fontSize: 9.5, color: COL.faint, letterSpacing: ".04em" }}>
              SIGMA BOND CO-PILOT
            </div>
            <div style={S.snapClock}><span style={S.snapDot} />{mounted ? dateStr : "—"}</div>
            <div style={S.buildTag}>{BUILD_VERSION}</div>
          </div>
          <span style={{ ...S.discordBtn, ...(discordOn ? S.discordBtnOn : {}),
            cursor: "default", userSelect: "none" }}
            title="Captain Hook — Discord notifications active">
            🪝 {discordOn ? "Hook ON" : "Hook OFF"}
          </span>
        </div>
        {discordPanelOpen && (
          <div style={S.discordPanel}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button style={{ ...S.btnGhost, ...(discordOn ? { borderColor: COL.bull, color: COL.bull } : { borderColor: COL.bear, color: COL.bear }) }}
                onClick={() => {
                  const next = !discordOn;
                  setDiscordOn(next);
                  try { localStorage.setItem("sbcp-discord-off", next ? "0" : "1"); } catch (_) {}
                }}>
                {discordOn ? "✓ Notifications ON" : "✕ Notifications OFF"}
              </button>
              <button style={S.btnGhost} onClick={async () => {
                setDiscordTestMsg("sending…");
                const ok = await postDiscord("🪝 **Captain Hook test** — Sigma Bond Co-Pilot connected. Notifications are live.");
                setDiscordTestMsg(ok ? "✓ sent — check your channel" : "✕ blocked in this view (try the published link in Brave)");
              }}>Send test ping</button>
              {discordTestMsg && <span style={{ fontSize: 10.5, fontFamily: mono, color: COL.mist }}>{discordTestMsg}</span>}
            </div>
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 9.5, fontFamily: mono, color: COL.faint, lineHeight: 1.5 }}>
                Alerts: Roll-the-Tape snapshot · A+ setups on load · Alpha Fox window OPEN · chart Referee Card / EOW ruling.
              </span>
            </div>
          </div>
        )}
      </header>

      {/* ===== SESSION SYNC BANNER ===== */}
      {storedAt && (
        <div style={S.syncBanner}>
          <span style={S.syncDot} />
          <span style={S.syncText}>
            Loaded on this device · {new Date(storedAt).toLocaleString("en-US", {
              month: "short", day: "numeric",
              hour: "2-digit", minute: "2-digit",
              timeZone: "America/New_York", timeZoneName: "short",
            })}
          </span>
          {/* Extended-hours mode badge — shown pre-09:30 or post-16:15 ET */}
          {isExtendedHoursET() && (
            <span style={{ marginLeft: 10, fontSize: 10, fontFamily: mono, color: COL.gold, background: `${COL.gold}18`, borderRadius: 8, padding: "2px 8px", letterSpacing: "0.03em" }}>
              ⏰ EXT HOURS · EXT%Chng + %C-OPEN + Volume driving grades
            </span>
          )}
          {/* Clear intentionally removed — prevents accidental data loss */}
        </div>
      )}

      {/* ===== ROLL THE TAPE ===== */}
      <div style={S.tapeBar}>
        <span style={S.tapeLbl}><Wind size={12} color={COL.gold} /> ROLL THE TAPE</span>
        {["am", "lunch", "pm"].map((s) => (
          <button key={s} style={{ ...S.tapeBtn, ...(tapeOutput?.session?.toLowerCase().startsWith(s) && !tapeOutput.loading ? S.tapeBtnActive : {}) }}
            onClick={() => rollTape(s)} disabled={tapeOutput?.loading}>
            {tapeOutput?.loading && tapeOutput?.session?.toLowerCase().startsWith(s) ? "…" : s.toUpperCase()}
          </button>
        ))}
        {apiAvailable === false && (
          <span style={{ fontSize: 10, fontFamily: mono, color: COL.faint, marginLeft: 2 }}>🔌 offline · MW grades active</span>
        )}
        {tapeOutput && !tapeOutput.loading && (
          <button style={S.tapeClear} onClick={() => setTapeOutput(null)}>✕</button>
        )}
        {tapeOutput?.throttleMsg && (
          <span style={S.tapeThrottle}>{tapeOutput.throttleMsg}</span>
        )}
      </div>
      {tapeOutput && (
        <div style={S.tapePanel}>
          <div style={S.tapePanelHead}>
            <Wind size={12} color={COL.gold} />
            <span style={{ color: COL.gold, fontWeight: 700 }}>{tapeOutput.session} TAPE</span>
            {tapeOutput.restoredAt ? (
              <span style={S.tapeRestoredBadge} title={new Date(tapeOutput.restoredAt).toLocaleString()}>
                📌 last snapshot · saved {(() => {
                  const mins = Math.max(0, Math.round((Date.now() - new Date(tapeOutput.restoredAt).getTime()) / 60000));
                  return mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
                })()}
              </span>
            ) : (
              <span style={S.tapePanelTime}>{mounted ? dateStr : "—"}</span>
            )}
            <span style={{ flex: 1 }} />
            <button style={S.calToggle} onClick={() => setTapeReportOpen((o) => !o)}>
              {tapeReportOpen ? "▲ hide tape" : "▼ show tape"}
            </button>
          </div>
          {tapeReportOpen && (
            <>
              {tapeOutput.loading
                ? /* During web-search tape roll, show partial text if streaming has started;
                     otherwise show spinner. The web-search (non-streaming) path shows no
                     partial text by design since it needs multi-turn tool loops. */
                  tapeOutput.text
                    ? <pre style={{ ...S.tapeText, opacity: 0.8 }}>{tapeOutput.text}<span style={{ color: COL.bull, animation: "sb-pulse 1.5s ease-in-out infinite" }}> ●</span></pre>
                    : <div style={S.tapeLoading}><span style={S.tapeDot} />Reading the field…</div>
                : (() => {
                    /* When open: always show Snapshot Summary (5-line tight read).
                       Optionally show full Field Report behind a secondary toggle. */
                    const m = tapeOutput.text.match(/🎯[^\n]*SNAPSHOT SUMMARY[^\n]*\n([\s\S]*?)(?=\n🔄|\n🚨|\n*$)/i);
                    const summary = m ? m[1].trim() : null;
                    return (
                      <>
                        {summary && (
                          <div style={S.tapeSummaryCard}>
                            <div style={S.tapeSummaryLbl}>🎯 SNAPSHOT SUMMARY</div>
                            <FormattedReport text={summary} baseStyle={S.tapeSummaryText} />
                          </div>
                        )}
                        {!tapeOutput.loading && (
                          <div style={{ textAlign: "right", padding: "4px 14px" }}>
                            <button style={{ ...S.calToggle, fontSize: 9.5 }} onClick={() => setTapeDetailOpen((o) => !o)}>
                              {tapeDetailOpen ? "▲ hide full report" : "▼ show full report"}
                            </button>
                          </div>
                        )}
                        {tapeDetailOpen && <FormattedReport text={tapeOutput.text} baseStyle={S.tapeText} />}
                      </>
                    );
                  })()}
            </>
          )}
        </div>
      )}

      {/* ===== ECONOMIC CALENDAR ===== */}
      <EconCalendar events={calEvents} loading={calLoading} onFetch={fetchCalendar} mobile={stackLayout} meta={calMeta} />

      {/* ===== DATA BAR ===== */}
      <div style={{ ...S.dataBar, flexWrap: "wrap", rowGap: 8 }}>
        <div style={{ ...S.dataLeft, flexWrap: "wrap" }}>
          {/* BETA: direct CSV upload restored alongside the admin-managed feed.
              localStorage is the real persistence (works everywhere, per-device);
              window.storage cross-device sync is a best-effort bonus on top
              (see syncFromStorage). Labeled "BETA" so users understand this is
              a temporary manual-override path while the admin pipeline matures. */}
          <label htmlFor="sb-csv-input" style={{ ...S.btnPrimary, cursor: "pointer" }}
            title="Beta: load a V.A.G. CSV directly on this device. Sits alongside the admin-published feed.">
            <Upload size={14} /> Load V.A.G. <span style={{ fontSize: 8.5, opacity: 0.75, marginLeft: 2 }}>BETA</span>
          </label>
          <input id="sb-csv-input" type="file" accept=".csv,.txt"
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
            onChange={loadFile} />

          {/* Price status — dot only, no timer text.
              The price dot tells users whether live prices are streaming. */}
          <span style={{ display: "flex", alignItems: "center", gap: 5,
            fontFamily: mono, fontSize: 10.5, color: COL.faint }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block",
              background: priceLoading ? COL.gold : priceTs > 0 ? COL.bull : COL.faint,
              ...(priceTs > 0 && !priceLoading ? { animation: "sb-pulse 2.5s ease-in-out infinite" } : {}),
            }} />
            {priceLoading ? "prices updating…" : priceTs > 0 ? "prices live" : "prices loading"}
          </span>
        </div>

        <div style={{ ...S.tierChips, flexWrap: "wrap", rowGap: 6 }}>
          {[["macro", "Macro", "Futures"], ["sector", "Sectors", "SPDR"], ["stocks", "Stocks", "Top 5"], ["scans", "Scans", "misc"]].map(([k, lbl, sub]) => (
            <button key={k}
              style={{ ...S.tierChip, ...(activeTier === k ? S.tierChipOn : {}), ...(tierLoaded[k] ? {} : S.tierChipEmpty) }}
              onClick={() => tierLoaded[k] && setActiveTier(k)}>
              <span style={S.tierChipLbl}>{lbl}</span>
              <span style={S.tierChipN}>{tierLoaded[k] ? `${tierLoaded[k]} · ${sub}` : "empty"}</span>
            </button>
          ))}
        </div>
        <div style={{ ...S.tally, flexWrap: "wrap", gap: 10 }}>
          <Tally label="A+" n={counts.aplus} color={COL.gold} />
          <Tally label="LONG" n={counts.long} color={COL.bull} />
          <Tally label="SHORT" n={counts.short} color={COL.bear} />
          <Tally label="NO-TRADE" n={counts.notrade} color={COL.faint} />
        </div>
      </div>

      {/* ===== EMPTY STATE / PRICE-ONLY BOARD ===== */}
      {!anyLoaded && (
        priceOnlyRows.length > 0 ? (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0 10px" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: COL.bull,
                animation: "sb-pulse 2.5s ease-in-out infinite", display: "inline-block" }} />
              <span style={{ fontFamily: mono, fontSize: 10.5, color: COL.mist }}>
                Live prices · {priceOnlyRows.length} tickers · grades load when you upload your V.A.G. watchlist
              </span>
            </div>
            {/* Show the first 30 price-only rows sorted by |pct| desc */}
            {[...priceOnlyRows]
              .sort((a, b) => Math.abs(b.pct || 0) - Math.abs(a.pct || 0))
              .slice(0, 30)
              .map((g, i) => (
                <div key={g.symbol} style={{ ...S.row, borderLeft: `3px solid ${g.pct > 0 ? COL.bull : g.pct < 0 ? COL.bear : COL.borderMed}`, opacity: 0.85 }}>
                  <span style={S.rRank}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.rSym}>
                      {g.pct > 0 ? <TrendingUp size={13} color={COL.bull} /> : g.pct < 0 ? <TrendingDown size={13} color={COL.bear} /> : <Minus size={13} color={COL.faint} />}
                      {g.symbol}
                    </div>
                    <div style={S.rPriceRow}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: COL.bull,
                        animation: "sb-pulse 2.5s ease-in-out infinite", display: "inline-block", marginRight: 3 }} />
                      <span style={S.rMark}>{g.mark?.toLocaleString("en-US", { minimumFractionDigits: g.mark < 10 ? 4 : 2 })}</span>
                      <span style={{ ...S.rPct, color: g.pct > 0 ? COL.bull : g.pct < 0 ? COL.bear : COL.faint }}>
                        {g.pct > 0 ? "▲ +" : g.pct < 0 ? "▼ " : ""}{g.pct}%
                      </span>
                      {Number.isFinite(g.pctOpen) && g.pctOpen !== g.pct && (
                        <span style={{ fontFamily: mono, fontSize: 10, color: COL.faint }}>
                          {g.pctOpen > 0 ? "+" : ""}{g.pctOpen}% frm open
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 9.5, color: COL.faint, alignSelf: "center" }}>grades pending</span>
                </div>
              ))}
          </div>
        ) : (
          <div style={stackLayout ? S.emptyStateLg : S.emptyState}>
            <Upload size={stackLayout ? 28 : 24} color={COL.gold} />
            <div style={S.emptyStateTitle}>No watchlist loaded on this device</div>
            <div style={S.emptyStateBody}>
              Live prices are streaming for {VAG_ALL_TICKERS.length} V.A.G. tickers.
              Tap <b>Load V.A.G.</b> above to upload a CSV directly (beta), or wait for the admin-published feed —
              the graded desk (Σ scores, WITS, Con Score, A+ setups) appears automatically either way.
              {priceLoading ? " · Fetching prices…" : " · Prices live ✓"}
            </div>
          </div>
        )
      )}

      {/* ===== HTF REGIME GOVERNOR ===== */}
      {anyLoaded && (
        <div style={S.regimeStrip}>
          <Gauge size={12} color={COL.gold} />
          <span style={S.regimeLbl}>REGIME</span>
          <span style={S.regimeKV}>VOL{" "}
            <b style={{ color: ["stressed","expanding"].includes(regime.vol) ? COL.bear : ["calm","compressing"].includes(regime.vol) ? COL.bull : COL.mist }}>
              {regime.vol.toUpperCase()}{regime.vix ? ` · ${regime.vixSrc} ${regime.vix.toFixed(1)}` : ""}
            </b>
          </span>
          <span style={S.regimeKV}>TREND{" "}
            <b style={{ color: regime.trend === "RISK-ON" ? COL.bull : regime.trend === "RISK-OFF" ? COL.bear : COL.gold }}>{regime.trend}</b>
          </span>
          <span style={S.regimeKV}>LIQ{" "}
            <b style={{ color: regime.liquidity === "supportive" ? COL.bull : regime.liquidity === "thin" ? COL.bear : COL.mist }}>{regime.liquidity.toUpperCase()}</b>
          </span>
          <span style={{ ...S.regimeKV, marginLeft: "auto", color: COL.violet }}>{volWeekInfo(new Date()).label}</span>
        </div>
      )}

      {/* ===== TOP-DOWN DESK ===== */}
      <TopDownDesk posture={posture} favored={favored} onJump={(t) => setActiveTier(t)} activeTier={activeTier} mobile={stackLayout} />

      {/* ===== DECISION COMPRESSION MODULES ===== */}
      {anyLoaded && <DecisionModules gMacro={gMacroLive} gSector={gSectorLive} gStocks={gStocksLive} now={now} discordOn={discordOn} />}

      {/* ===== FILTERS ===== */}
      <div className="sb-filter-bar" style={S.filterBar}>
        {[
          ["ALL", "All"], ["APLUS", "A+ only"], ["LONG", "Long lean"],
          ["SHORT", "Short lean"], ["NOTRADE", "No-trade"],
        ].map(([k, lbl]) => (
          <button key={k}
            style={{ ...S.chip, ...(filter === k ? S.chipOn : {}) }}
            onClick={() => setFilter(k)}>
            {lbl}
          </button>
        ))}
        {(activeTier === "stocks" || activeTier === "scans") && favored.active && (
          <button
            style={{ ...S.chip, ...(favOnly ? S.chipOn : {}) }}
            onClick={() => setFavOnly((s) => !s)}>
            <Layers size={11} /> Favored sectors
          </button>
        )}
        <div style={{ flex: 1 }} />
        <span style={S.sortLbl}>sort</span>
        <select style={S.select} value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
          <option value="house">House rank (Part→Conv→Trend→RS→Liq)</option>
          <option value="sigma">Σ score</option>
          <option value="part">Participation</option>
          <option value="conv">Convexity</option>
          <option value="trend">Trend</option>
          <option value="rs">Rel. strength</option>
          <option value="liq">Liquidity</option>
          <option value="symbol">Symbol</option>
        </select>
      </div>

      {/* ===== MAIN ===== */}
      <div className="sb-main-collapse" style={{ ...S.main, ...(stackLayout ? S.mainMobile : {}) }}>
        {/* LEFT COLUMN: BOARD + CHART ANALYSIS
            v2026-06-20e: chart analysis moved here from the bottom of the
            right column per house request — "the chart analysis section is
            buried at the bottom of the page, let's move it just underneath
            the symbol section on the left side." This wrapper is one grid
            child (column 1); the Trade Card section further below is the
            other grid child (column 2) — S.main's 2-column grid is
            unaffected, only what's stacked inside column 1 changed. */}
        <div style={{ display: "flex", flexDirection: "column", gap: SP.xl }}>
        {/* BOARD (error-contained — malformed CSV rows can't blank the app) */}
        <BoardErrorBoundary>
        <section style={S.board}>
          <div style={S.boardHead}>
            <span style={{ width: 26 }}>#</span>
            <span style={{ flex: 1 }}>SYMBOL</span>
            <span style={S.colVerdict}>VERDICT</span>
            {!stackLayout && <span style={S.colPillars}>P · C · T · R · L</span>}
            <span style={S.colSigma}>Σ</span>
          </div>
          <div style={{ ...S.boardBody, maxHeight: stackLayout ? 320 : 560 }}>
            {view.length === 0 && (
              <div style={S.empty}>
                No symbols in this view. Clear the filter, or load a watchlist to grade.
              </div>
            )}
            {view.map((g, i) => (
              <BoardRow key={g.symbol} g={g} rank={i + 1}
                active={g.symbol === selected}
                onClick={() => setSelected(g.symbol)}
                mobile={stackLayout}
                delta={prevGraded[g.symbol]} />
            ))}
          </div>
          <div style={S.boardFoot}>
            {activeTier === "macro"
              ? "Macro tier — futures read the global risk narrative. Top of the funnel, context only."
              : activeTier === "sector"
              ? "Sector tier — rank relative strength to set the top-3 long / short sectors that gate the stock board."
              : activeTier === "scans"
              ? "Scan tier — misc watchlists from your scan criteria, graded the same way and tagged by favored sector."
              : favored.active
              ? "Stock tier — names tagged ✓ sit inside a favored sector. Use Favored sectors to drill the funnel."
              : "Stock tier — load a sector grid to light up the favored-sector filter."}
          </div>
        </section>
        </BoardErrorBoundary>

        {/* ===== CHART ANALYSIS PANEL ===== */}
        <div style={S.chartPanel} onPaste={handleChartPaste}>
          <div style={S.chartPanelHead}>
            <Target size={13} color={COL.gold} />
            <span style={{ color: COL.gold, fontWeight: 700, fontSize: 11, letterSpacing: ".05em" }}>CHART ANALYSIS</span>
            {/* v2026-06-20e: badge now always shows — sector-grid classification
                runs for ANY uploaded image (single chart or multi-symbol grid),
                any day/time. Previously this badge (and the underlying prompt
                logic) only activated Fri 15:45 ET-Sun, so a sector-grid
                screenshot uploaded mid-week would silently misroute into the
                single-symbol candlestick workflow instead. Label/tooltip now
                distinguish EOW next-week framing from mid-week current framing
                rather than implying the capability itself is time-gated. */}
            <span style={S.eowBadge}
              title={isEOWWindow(now)
                ? "EOW window (Fri 15:45 ET → Sun): a sector-grid screenshot runs next-week planning framing."
                : "Mid-week: a sector-grid screenshot still runs the Sector Grid framework, framed as a current snapshot rather than next-week planning."}>
              {isEOWWindow(now) ? "EOW MODE" : "GRID-AWARE"}
            </span>
            {/* Image / Notes mode toggle */}
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {["image", "notes"].map((m) => (
                <button key={m} onClick={() => { setChartMode(m); setChartAnalysis(null); }}
                  style={{ ...S.chartModeBtn, ...(chartMode === m ? S.chartModeBtnOn : {}) }}>
                  {m === "image" ? "📷 Image" : "📝 Notes"}
                </button>
              ))}
            </div>
            {(chartImg || chartNotes) && (
              <button style={S.chartUpBtn} onClick={() => { setChartImg(null); setChartNotes(""); setChartAnalysis(null); }}>Clear</button>
            )}
          </div>

          {chartMode === "image" ? (
            chartImg ? (
              <>
                <img src={chartImg} alt="chart" style={S.chartImg} />
                <div style={{ display: "flex", gap: 8, padding: "8px 12px 4px" }}>
                  <button style={S.btnPrimary} onClick={analyzeChart} disabled={chartAnalysis?.loading}>
                    {chartAnalysis?.loading ? "Analyzing…" : "Run Sigma Bond analysis"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: "12px" }}>
                <label htmlFor="sb-chart-input" style={S.chartUploadZone}>
                  <Upload size={22} color={COL.gold} />
                  <span style={{ fontWeight: 700, color: COL.text, fontSize: 14 }}>Upload a chart screenshot</span>
                  <span style={{ fontSize: 11.5, color: COL.mist, lineHeight: 1.5, maxWidth: 280, textAlign: "center" }}>
                    Tap to open your photo library / file picker.
                    {!stackLayout && <> On desktop you can also <b>Ctrl/Cmd&nbsp;+&nbsp;V</b> to paste.</>}
                  </span>
                </label>
                <input id="sb-chart-input" type="file" accept="image/*"
                  onChange={handleChartFile} style={S.chartFileInput} />
              </div>
            )
          ) : (
            /* Notes mode — text-based, works offline/public */
            <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 10.5, color: COL.mist, fontFamily: mono }}>
                Paste ticker, HTF bias, FVG zones, POI, and setup notes. Works on every device, no image needed.
              </div>
              <textarea
                style={{ ...S.pasteArea, minHeight: 110 }}
                placeholder={"Ticker: MRVL\nHTF Bias: Bullish (Weekly BOS)\nFVG: $82–84 unfilled\nPOI: $83.50 daily demand\nSetup: 1-2-3 trigger on 4H, WITS=DRIVING+, IFP open\nSL: below $81.20 / T1: $88 / T2: $93"}
                value={chartNotes}
                onChange={(e) => setChartNotes(e.target.value)}
              />
              <button style={S.btnPrimary} disabled={!chartNotes.trim() || chartAnalysis?.loading} onClick={analyzeChart}>
                {chartAnalysis?.loading ? "Analyzing…" : "Run Sigma Bond analysis"}
              </button>
            </div>
          )}

          {chartAnalysis && (
            <div style={S.chartResult}>
              {chartAnalysis.loading && !chartAnalysis.text
                ? <div style={S.tapeLoading}><span style={S.tapeDot} />Reading the field…</div>
                : (() => {
                    /* Works during streaming (loading=true, text=partial) and after (loading=false)
                       Extract Trade Card as soon as its block starts appearing in the stream.
                       The model is now hard-constrained to output ONLY these two blocks — any
                       leftover text after stripping both is unexpected and shown as a flagged
                       fallback rather than silently dropped, so a prompt regression is visible
                       during QA instead of just vanishing. */
                    const txt = chartAnalysis.text || "";
                    const tcMatch = txt.match(/🃏 SIGMA BOND TRADE CARD\n([\s\S]*?)(?=\n-{3,}|\n🟨|$)/i);
                    const rcMatch = txt.match(/🟨 REFEREE CARD\n([\s\S]*?)(?=\n---|$)/i);
                    const tradeCard = tcMatch ? tcMatch[1].trim() : null;
                    const refCard   = rcMatch && !chartAnalysis.loading ? rcMatch[1].trim() : null;
                    const leftover = !chartAnalysis.loading
                      ? txt.replace(/🃏 SIGMA BOND TRADE CARD[\s\S]*?(?=\n-{3,}|\n🟨)/i, "")
                            .replace(/---\n?🟨 REFEREE CARD[\s\S]*$/i, "").trim()
                      : null; // don't evaluate leftover text mid-stream
                    return (
                      <>
                        {(tradeCard || refCard) && (
                          <div style={S.analysisResultWrap}>
                            {tradeCard && (
                              <div style={S.tradeCardSection}>
                                <div style={S.tradeCardTitle}>
                                  🃏 SIGMA BOND TRADE CARD
                                  {chartAnalysis.loading && <span style={{ fontFamily: mono, fontSize: 9.5, color: COL.bull, animation: "sb-pulse 1.5s ease-in-out infinite" }}>● streaming…</span>}
                                </div>
                                <FormattedReport text={tradeCard} baseStyle={S.tradeCardText} />
                              </div>
                            )}
                            {refCard && (
                              <div style={S.refereeCardSection}>
                                <div style={S.refereeCardTitle}>🟨 REFEREE CARD</div>
                                <FormattedReport text={refCard} baseStyle={S.refereeCardText} />
                              </div>
                            )}
                          </div>
                        )}
                        {!tradeCard && chartAnalysis.loading && txt && (
                          /* Show raw partial text before Trade Card header arrives */
                          <pre style={{ ...S.tapeText, opacity: 0.7 }}>{txt}</pre>
                        )}
                        {leftover && (
                          <div style={{ margin: "0 16px 14px", padding: "10px 14px", borderRadius: 10,
                            background: `${COL.bear}0d`, border: `1px dashed ${COL.bear}55` }}>
                            <div style={{ fontSize: 9.5, fontFamily: mono, color: COL.bear, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                              ⚠ unexpected output outside Trade Card / Referee Card
                            </div>
                            <FormattedReport text={leftover} baseStyle={{ ...S.tapeText, padding: 0, opacity: 0.85 }} />
                          </div>
                        )}
                      </>
                    );
                  })()}
            </div>
          )}
        </div>
        </div>

        {/* TRADE CARD */}
        <section style={S.cardCol}>
          {sel ? <TradeCard g={sel} prev={prevGraded[sel.symbol]} streak={streaks[sel.symbol] || 0} /> : <div style={{ ...S.empty, background: COL.surface1, borderRadius: 16, boxShadow: COL.shadowCard }}>Select a symbol.</div>}
        </section>
      </div>
    </div>
  );
}

/* ---------- top-down desk panel ---------- */
/* ============================================================
   DECISION COMPRESSION MODULES
   Alpha Cannon → Weekly Referee Report (Futures bull/bear leaders)
   Alpha Engine → Sector Draft Board (auto-ranked long/short)
   Alpha Fox   → Execution Window (IFP + STRSI + Momo confluence)
   ============================================================ */
function DecisionModules({ gMacro, gSector, gStocks, now, discordOn }) {
  /* Alpha Cannon — bull vs bear leaders from Futures tier */
  const macroRows = gMacro.filter((r) => !r.isOptions);
  const macroBull = [...macroRows].filter((r) => r.lean === 1).sort((a, b) => b.sigma - a.sigma).slice(0, 5);
  const macroBear = [...macroRows].filter((r) => r.lean === -1).sort((a, b) => b.sigma - a.sigma).slice(0, 5);

  /* Alpha Fox — Execution Window from stocks+scans IFP / STRSI / Momo.
     IFP (Inflection Point — 15m aggregation pulse) is an object:
       { dir: 1|-1|0, trig: bool, label: string }
     "Active" = dir !== 0 (pulse has directional bias in either direction).
     "Triggered" = trig === true (confirmed trigger, higher conviction).
     Using dir !== 0 so both bullish and bearish 15m inflections count
     toward the confluence score — Fox gauges OVERALL market activity,
     not just the long side. */
  const execRows = [...gStocks].filter((r) => !r.isOptions);
  const ifpOpen    = execRows.filter((r) => r.ifp?.dir !== 0 && r.ifp?.dir !== undefined).length;
  const strsiEarly = execRows.filter((r) => r.strsi?.stage === "EARLY" || r.strsi?.stage === "EXP").length;
  const momoOn     = execRows.filter((r) => r.momo?.cont).length;
  const total      = execRows.length || 1;
  const ifpScore   = ifpOpen / total;
  const strsiScore = strsiEarly / total;
  const momoScore  = momoOn / total;
  const foxScore   = (ifpScore + strsiScore + momoScore) / 3;
  const foxStatus  = foxScore >= 0.55 ? "OPEN" : foxScore >= 0.3 ? "CAUTION" : "CLOSED";
  const foxColor   = foxStatus === "OPEN" ? COL.bull : foxStatus === "CAUTION" ? COL.gold : COL.bear;

  /* Event 3 — Alpha Fox Execution Window alert: ping Discord when the
     window flips to OPEN. Track the previous status in a ref so we only
     fire on the CLOSED/CAUTION → OPEN transition, not on every re-render
     while it stays OPEN. */
  const prevFoxRef = useRef(null);
  useEffect(() => {
    if (discordOn && foxStatus === "OPEN" && prevFoxRef.current && prevFoxRef.current !== "OPEN") {
      postDiscord(
        `🦊 **ALPHA FOX — EXECUTION WINDOW OPEN**\nIFP ${ifpOpen}/${execRows.length} · STRSI ${strsiEarly}/${execRows.length} · MOMO ${momoOn}/${execRows.length}\nConfluence confirmed — high-conviction setups eligible.`,
        { dedupKey: `fox-open-${etDateKey(now)}-${Math.floor(Date.now() / (30 * 60 * 1000))}` } // re-armable every 30 min
      );
    }
    prevFoxRef.current = foxStatus;
  }, [foxStatus, discordOn]); // eslint-disable-line

  const sigColor = (r) => r.lean === 1 ? COL.bull : r.lean === -1 ? COL.bear : COL.faint;

  return (
    <div style={{ display: "flex", flexDirection: "column", margin: "8px 0" }}>
      {/* ── Alpha Cannon: Weekly Referee Report ── */}
      {macroRows.length > 0 && (
        <div style={S.dcModule}>
          <div style={S.dcHead}>
            <Activity size={12} color={COL.gold} />
            <span style={S.dcTitle}>ALPHA CANNON</span>
            <span style={S.dcSub}>Weekly Referee Report</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={S.dcColHead}>▲ BULL LEADERS</div>
              {macroBull.length ? macroBull.map((r) => (
                <div key={r.symbol} style={S.dcRow}>
                  <span style={{ color: COL.bull, fontWeight: 700 }}>{r.symbol}</span>
                  <span style={S.dcSigma}>Σ{r.sigma}</span>
                  <span style={S.dcWits}>{r.wits?.label || "—"}</span>
                </div>
              )) : <div style={S.dcEmpty}>No bull leaders</div>}
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ ...S.dcColHead, color: COL.bear }}>▼ BEAR LEADERS</div>
              {macroBear.length ? macroBear.map((r) => (
                <div key={r.symbol} style={S.dcRow}>
                  <span style={{ color: COL.bear, fontWeight: 700 }}>{r.symbol}</span>
                  <span style={S.dcSigma}>Σ{r.sigma}</span>
                  <span style={S.dcWits}>{r.wits?.label || "—"}</span>
                </div>
              )) : <div style={S.dcEmpty}>No bear leaders</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── Alpha Fox: Execution Window ── */}
      {execRows.length > 0 && (
        <div style={{ ...S.dcModule, borderColor: `${foxColor}55` }}>
          <div style={S.dcHead}>
            <Crosshair size={12} color={foxColor} />
            <span style={S.dcTitle}>ALPHA FOX</span>
            <span style={S.dcSub}>Execution Window</span>
            <span style={{ ...S.dcFoxStatus, color: foxColor, borderColor: `${foxColor}77` }}>{foxStatus}</span>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "4px 0 2px" }}>
            {[
              { lbl: "IFP", score: ifpScore, n: ifpOpen, total: execRows.length },
              { lbl: "STRSI", score: strsiScore, n: strsiEarly, total: execRows.length },
              { lbl: "MOMO", score: momoScore, n: momoOn, total: execRows.length },
            ].map(({ lbl, score, n, total: t }) => (
              <div key={lbl} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 70 }}>
                <div style={{ fontSize: 9.5, fontFamily: mono, color: COL.faint, letterSpacing: ".05em" }}>{lbl}</div>
                <div style={{ height: 4, background: COL.surface3, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.round(score * 100)}%`,
                    background: score >= 0.55 ? COL.bull : score >= 0.3 ? COL.gold : COL.bear,
                    borderRadius: 2, transition: "width .4s" }} />
                </div>
                <div style={{ fontSize: 10, fontFamily: mono, color: COL.mist }}>{n}/{t} triggers</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, fontFamily: mono, color: foxColor, marginTop: 4 }}>
            {foxStatus === "OPEN" && "✅ Execution window confirmed — all three triggers active. High-conviction setups eligible."}
            {foxStatus === "CAUTION" && "⚠️ Partial confluence only — reduce size, wait for cleaner alignment before entry."}
            {foxStatus === "CLOSED" && "🚫 No execution confluence — IFP/STRSI/Momo not aligned. Stand aside; observe only."}
          </div>
        </div>
      )}
    </div>
  );
}

function TopDownDesk({ posture, favored, onJump, activeTier, mobile }) {
  if (!posture && !(favored && favored.active)) return null;
  const toneColor = posture
    ? posture.tone === "RISK-ON" ? COL.bull : posture.tone === "RISK-OFF" ? COL.bear : COL.gold
    : COL.faint;
  // mobile: macro full-width top row, then long/short side-by-side
  // desktop: 3-col grid
  return (
    <div style={S.desk}>
      <div style={S.deskRail}>
        <span style={S.deskRailNum}>1</span><span style={S.deskRailTxt}>Macro</span>
        <ChevronRight size={13} color={COL.faint} />
        <span style={S.deskRailNum}>2</span><span style={S.deskRailTxt}>Sectors</span>
        <ChevronRight size={13} color={COL.faint} />
        <span style={S.deskRailNum}>3</span><span style={S.deskRailTxt}>Stocks</span>
        <span style={{ flex: 1 }} />
        {!mobile && <span style={S.deskHint}>top-down desk · drill the funnel</span>}
      </div>
      {mobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Macro row — full width compact on mobile */}
          {posture && (
            <div style={{ ...S.deskCol, flexDirection: "row", alignItems: "center", gap: 12, cursor: "pointer" }}
              onClick={() => onJump("macro")}>
              <Activity size={12} color={COL.gold} />
              <span style={{ ...S.posturePill, fontSize: 12, padding: "2px 8px", borderColor: toneColor + "55", color: toneColor }}>
                {posture.tone}
              </span>
              <span style={{ fontFamily: mono, fontSize: 11.5 }}>
                {posture.bull && <span style={{ color: COL.bull }}>↑{posture.bull.symbol}</span>}
                {posture.bull && posture.bear && <span style={{ color: COL.faint }}> · </span>}
                {posture.bear && <span style={{ color: COL.bear }}>↓{posture.bear.symbol}</span>}
              </span>
            </div>
          )}
          {/* Long / Short in 2 columns on mobile */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ ...S.deskCol, cursor: "pointer" }} onClick={() => onJump("sector")}>
              <div style={S.deskColHead}><TrendingUp size={11} color={COL.bull} /> Long</div>
              {favored.longs.length ? favored.longs.map((g) => (
                <SectorChip key={g.symbol} g={g} side="long" compact />
              )) : <div style={S.deskEmpty}>—</div>}
            </div>
            <div style={{ ...S.deskCol, cursor: "pointer" }} onClick={() => onJump("sector")}>
              <div style={S.deskColHead}><TrendingDown size={11} color={COL.bear} /> Short</div>
              {favored.shorts.length ? favored.shorts.map((g) => (
                <SectorChip key={g.symbol} g={g} side="short" compact />
              )) : <div style={S.deskEmpty}>—</div>}
            </div>
          </div>
        </div>
      ) : (
        <div style={S.deskGrid}>
          {/* MACRO */}
          <div style={{ ...S.deskCol, cursor: posture ? "pointer" : "default" }} onClick={() => posture && onJump("macro")}>
            <div style={S.deskColHead}><Activity size={12} color={COL.gold} /> Macro narrative</div>
            {posture ? (
              <>
                <div style={{ ...S.posturePill, color: toneColor, borderColor: toneColor + "55" }}>
                  {posture.tone} <span style={S.postureScore}>{posture.score > 0 ? "+" : ""}{posture.score}</span>
                </div>
                <div style={S.deskLine}>
                  {posture.bull && <span style={{ color: COL.bull }}>↑ {posture.bull.symbol}</span>}
                  {posture.bull && posture.bear && <span style={S.deskDot}> · </span>}
                  {posture.bear && <span style={{ color: COL.bear }}>↓ {posture.bear.symbol}</span>}
                </div>
              </>
            ) : <div style={S.deskEmpty}>Load a Futures export for the global read.</div>}
          </div>
          {/* SECTORS LONG */}
          <div style={{ ...S.deskCol, cursor: "pointer" }} onClick={() => onJump("sector")}>
            <div style={S.deskColHead}><TrendingUp size={12} color={COL.bull} /> Top long sectors</div>
            {favored.longs.length ? favored.longs.map((g) => (
              <SectorChip key={g.symbol} g={g} side="long" />
            )) : <div style={S.deskEmpty}>No bullish sectors graded.</div>}
          </div>
          {/* SECTORS SHORT */}
          <div style={{ ...S.deskCol, cursor: "pointer" }} onClick={() => onJump("sector")}>
            <div style={S.deskColHead}><TrendingDown size={12} color={COL.bear} /> Top short sectors</div>
            {favored.shorts.length ? favored.shorts.map((g) => (
              <SectorChip key={g.symbol} g={g} side="short" />
            )) : <div style={S.deskEmpty}>No bearish sectors graded.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
function SectorChip({ g, side, compact }) {
  const c = side === "long" ? COL.bull : COL.bear;
  if (compact) return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
      <span style={{ ...S.secDot, background: c }} />
      <span style={{ fontFamily: mono, fontWeight: 700, color: COL.text, fontSize: 11.5 }}>{g.symbol}</span>
      <span style={{ ...S.secSigma, color: c, fontSize: 11, marginLeft: "auto" }}>{g.sigma}</span>
    </div>
  );
  return (
    <div style={S.secChip}>
      <span style={{ ...S.secDot, background: c }} />
      <span style={S.secSym}>{g.symbol}</span>
      <span style={S.secName}>{sectorNameOf(g)}</span>
      <span style={{ flex: 1 }} />
      <span style={S.secRs}>RS {g.rsPct}</span>
      <span style={{ ...S.secSigma, color: c }}>{g.sigma}</span>
    </div>
  );
}

/* ---------- Economic Calendar component ---------- */
function EconCalendar({ events, loading, onFetch, mobile, meta }) {
  const impactColor = { HIGH: COL.bear, MED: COL.gold, LOW: COL.faint };
  const impactDot = { HIGH: "🔴", MED: "🟡", LOW: "⚪" };
  const [open, setOpen] = useState(false);
  const metaLabel = meta?.at
    ? (() => {
        const mins = Math.max(0, Math.round((Date.now() - new Date(meta.at).getTime()) / 60000));
        const age = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
        const src = meta.source === "live" ? "fetched" : meta.source === "local" ? "cached (this device)" : "cached (synced)";
        return `${src} ${age} — frozen until next week unless Refreshed`;
      })()
    : null;
  return (
    <div style={S.calWrap}>
      <div style={S.calBar}>
        <NotebookPen size={13} color={COL.gold} />
        <span style={S.calTitle}>ECON CALENDAR</span>
        {events.length > 0 && (
          <span style={{ ...S.calCount, color: events.some((e) => e.impact === "HIGH") ? COL.bear : COL.gold }}>
            {events.filter((e) => e.impact === "HIGH").length} high-impact
          </span>
        )}
        <span style={{ flex: 1 }} />
        {events.length > 0 && (
          <button style={S.calToggle} onClick={() => setOpen((o) => !o)}>{open ? "▲ hide" : "▼ show"}</button>
        )}
        <button style={S.calFetchBtn} onClick={() => onFetch(events.length > 0)} disabled={loading}>
          {loading ? "Fetching…" : events.length ? "↻ Refresh" : "Fetch this week"}
        </button>
      </div>
      {metaLabel && (
        <div style={S.calMetaLine}>{metaLabel}</div>
      )}
      {open && events.length > 0 && (
        <div style={S.calList}>
          {events.map((e, i) => (
            <div key={i} style={S.calRow}>
              <span style={{ ...S.calImpact, color: impactColor[e.impact] || COL.faint }}>{impactDot[e.impact] || "⚪"}</span>
              <span style={S.calTime}>{e.time}</span>
              <span style={S.calName}>{e.name}</span>
              {(e.forecast || e.previous) && (
                <span style={S.calMeta}>
                  {e.forecast && <span>fcst <b>{e.forecast}</b></span>}
                  {e.forecast && e.previous && <span style={{ color: COL.faint }}> / </span>}
                  {e.previous && <span style={{ color: COL.faint }}>prev {e.previous}</span>}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- CSV parse ---------- */
function parseCSV(text) {
  // strip BOM, locate the real header row (TOS prepends "Quote on…", a blank
  // line, and a title row before the "Symbol,…" header)
  const t = String(text).replace(/^\uFEFF/, "");
  const lines = t.split(/\r?\n/);
  let hi = lines.findIndex((l) => /^\s*symbol\s*,/i.test(l));
  if (hi < 0) hi = 0;
  const body = lines.slice(hi).join("\n");
  const out = Papa.parse(body.trim(), { header: true, skipEmptyLines: true });
  return (out.data || []).filter((r) => {
    const sym = r.Symbol ?? r.symbol ?? Object.values(r)[0];
    return String(sym).trim() !== "" && Object.values(r).some((v) => String(v).trim() !== "");
  });
}

/* ---------- tally pill ---------- */
function Tally({ label, n, color }) {
  return (
    <div style={S.tallyItem}>
      <span style={{ ...S.tallyN, color }}>{n}</span>
      <span style={S.tallyLbl}>{label}</span>
    </div>
  );
}

/* ---------- board row ---------- */
function BoardRow({ g, rank, active, onClick, mobile, delta }) {
  const vc = verdictColor(g.verdict, g.vlean);

  // Options row — v2026-06-20e: now individually graded (see gradeRow's
  // option-grading branch). Visually distinct from stock rows (smaller
  // symbol text, "OPTIONS" label, no pillar mini-bars, no Σ score — Σ is
  // a stock-framework concept and doesn't apply to a contract) but no
  // longer force-dimmed: a genuine A+/WATCH option signal gets full
  // visibility; only the no-signal CTX case stays de-emphasized.
  if (g.isOptions) {
    const optVc = verdictColor(g.verdict.replace(" (opt)", ""), g.vlean);
    const hasSignal = g.vlean !== 0;
    return (
      <div onClick={onClick} className="sb-row"
        style={{ ...S.row, opacity: hasSignal ? 1 : 0.55, borderLeft: `3px solid ${hasSignal ? optVc : COL.borderMed}` }}>
        <span style={S.rRank}>{rank}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...S.rSym, fontSize: 11, color: hasSignal ? COL.text : COL.mist }}>
            {g.vlean === 1 ? <TrendingUp size={12} color={COL.bull} />
              : g.vlean === -1 ? <TrendingDown size={12} color={COL.bear} />
                : null}
            {g.symbol}
          </div>
          <div style={S.rSector}>
            OPTIONS · {Number.isFinite(g.pct) ? `${g.pct > 0 ? "+" : ""}${g.pct}%` : ""}{Number.isFinite(g.pi) ? `  PI+ ${g.pi}` : ""}{Number.isFinite(g.poi) ? `  POI ${g.poi}` : ""}{Number.isFinite(g.oiv) ? `  OI/V ${g.oiv}` : ""}
          </div>
          {(Number.isFinite(g.volume) || Number.isFinite(g.oint)) && (
            <div style={{ ...S.rSector, marginTop: 1 }}>
              {Number.isFinite(g.volume) ? `Vol ${fmtCompact(g.volume)}` : ""}{Number.isFinite(g.oint) ? `  OI ${fmtCompact(g.oint)}` : ""}
            </div>
          )}
        </div>
        <span style={S.colVerdict}>
          {hasSignal ? (
            <span style={{
              ...S.vtag, color: optVc, borderColor: optVc + "66", background: optVc + "14",
              fontSize: 8.5, padding: "2px 5px", letterSpacing: 0, maxWidth: "100%",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block",
            }}>
              {g.verdict.replace(" (opt)", "")}
            </span>
          ) : (
            <span style={{ fontSize: 9, color: COL.faint, fontFamily: mono, letterSpacing: ".04em" }}>CTX</span>
          )}
        </span>
        <span style={{ ...S.colSigma, color: COL.faint, fontSize: 9 }}>opt</span>
      </div>
    );
  }

  const deltaVerdict = delta && delta.verdict !== g.verdict
    ? { from: delta.verdict, to: g.verdict, sigmaChg: g.sigma - delta.sigma }
    : null;

  return (
    <div onClick={onClick}
      className="sb-row"
      style={{ ...S.row, ...(mobile ? S.rowMobile : {}), ...(active ? S.rowActive : {}), borderLeft: `3px solid ${vc}` }}>
      <span style={S.rRank}>{rank}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...S.rSym, flexWrap: "wrap", rowGap: 2 }}>
          {g.vlean === 1 ? <TrendingUp size={13} color={COL.bull} />
            : g.vlean === -1 ? <TrendingDown size={13} color={COL.bear} />
              : <Minus size={13} color={COL.faint} />}
          {g.symbol}
          {(Number.isFinite(g.mark) || Number.isFinite(g.pct)) && (
            <>
              {/* Live price dot — green=fresh(<60s), amber=stale(<5min), gray=no live data */}
              <span style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: g.liveTs
                  ? (g.liveStale ? COL.gold : COL.bull)
                  : COL.faint,
                display: "inline-block", marginLeft: 2,
                ...(g.liveTs && !g.liveStale ? { animation: "sb-pulse 2.5s ease-in-out infinite" } : {}),
              }} title={g.liveTs ? `Live price · ${Math.round((Date.now()-g.liveTs)/1000)}s ago` : "From CSV"} />
              {Number.isFinite(g.mark) && <span style={S.rMark}>{g.mark.toLocaleString("en-US", { minimumFractionDigits: g.mark < 10 ? 4 : g.mark < 1000 ? 2 : 0 })}</span>}
              {Number.isFinite(g.pct) && (
                <span style={{ ...S.rPct, color: g.pct > 0 ? COL.bull : g.pct < 0 ? COL.bear : COL.faint }}>
                  {g.pct > 0 ? "▲ +" : g.pct < 0 ? "▼ " : ""}{g.pct}%
                </span>
              )}
            </>
          )}
          {deltaVerdict && (
            <span style={{ ...S.deltaBadge, color: deltaVerdict.sigmaChg > 0 ? COL.bull : deltaVerdict.sigmaChg < 0 ? COL.bear : COL.gold }}>
              {deltaVerdict.sigmaChg > 0 ? "▲" : deltaVerdict.sigmaChg < 0 ? "▼" : "→"}{deltaVerdict.to.replace("A+ ", "A+").replace("WATCH · ", "W·")}
            </span>
          )}
        </div>
        {((Number.isFinite(g.pctOpen) && g.pctOpen !== g.pct) || g.priceOnly) && (
          <div style={{ ...S.rPriceRow, marginTop: 1 }}>
            {Number.isFinite(g.pctOpen) && g.pctOpen !== g.pct && (
              <span style={{ fontFamily: mono, fontSize: 10, color: COL.faint }} title="% change from session open">
                {g.pctOpen > 0 ? "+" : ""}{g.pctOpen}% frm open
              </span>
            )}
            {g.priceOnly && (
              <span style={{ fontSize: 9.5, fontFamily: mono, color: COL.faint,
                border: `1px solid ${COL.borderMed}`, borderRadius: 4, padding: "1px 5px" }}>
                grades pending CSV
              </span>
            )}
          </div>
        )}
        <div style={S.rSector}>
          {g.sector || "—"} · {g.wits.label}
          {g.strsi?.stage && g.strsi.stage !== "—" && (
            <span style={{ ...S.strsiTag, color: timingColor(g.strsi.stage) }}>
              {g.strsi.stage}
            </span>
          )}
          {g.fit && (
            <span style={{ ...S.fitBadge, color: g.fit === "long" ? COL.bull : COL.bear, borderColor: (g.fit === "long" ? COL.bull : COL.bear) + "66" }}>
              {g.fit === "long" ? "✓ long" : "✓ short"}
            </span>
          )}
        </div>
        {/* Second detail row — IFP, Con Score, RS, volume — the "Top 5" detail level.
            v2026-06-20: fixed a real bug — this used `gap: 6` on top of S.rSector,
            but S.rSector is a plain block element with no display:flex, so the gap
            was silently a no-op and the span siblings rendered with zero space
            between them (e.g. "IFP↓(TRIG)EXPANDINGRS 0SMRTx 0"). display:flex +
            flexWrap here actually makes the gap take effect and lets tokens wrap
            cleanly on narrow rows instead of overflowing. */}
        <div style={{ ...S.rSector, marginTop: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, rowGap: 2 }}>
          {/* IFP — Institutional Flow Pulse */}
          {g.ifp?.dir !== 0 && g.ifp?.label && (
            <span style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700,
              color: g.ifp.dir === 1 ? COL.bull : COL.bear }}>
              IFP {g.ifp.label}
            </span>
          )}
          {/* Con Score state */}
          {g.con?.state && g.con.state !== "STABLE" && (
            <span style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700,
              color: g.con.state === "IGNITION" ? COL.bear : g.con.state === "EXPANDING" ? COL.gold : COL.violet }}>
              {g.con.state}{Number.isFinite(g.con.v) ? ` ${g.con.v}` : ""}
            </span>
          )}
          {/* RS percentile */}
          {g.haveRS && Number.isFinite(g.rsPct) && (
            <span style={{ fontFamily: mono, fontSize: 9.5,
              color: g.rsPct > 60 ? COL.bull : g.rsPct < 40 ? COL.bear : COL.faint }}>
              RS {g.rsPct}
            </span>
          )}
          {/* LWC */}
          {g.lwcPresent && g.lwc?.v !== 0 && (
            <span style={{ fontFamily: mono, fontSize: 9.5,
              color: g.lwc.v > 0 ? COL.bull : COL.bear }}>
              LWC {g.lwc.v > 0 ? `+${g.lwc.v}` : g.lwc.v}
            </span>
          )}
          {/* Volume (compact) */}
          {Number.isFinite(g.volume) && g.volume > 0 && (
            <span style={{ fontFamily: mono, fontSize: 9.5, color: COL.faint }}>
              Vol {fmtCompact(g.volume)}
            </span>
          )}
          {/* SMRTx when notable */}
          {Number.isFinite(g.smrtx) && (g.smrtx >= 65 || g.smrtx <= 35) && (
            <span style={{ fontFamily: mono, fontSize: 9.5,
              color: g.smrtx >= 65 ? COL.violet : COL.bear }}>
              SMRTx {g.smrtx}
            </span>
          )}
        </div>
      </div>
      <span style={{ ...S.colVerdict, ...(mobile ? S.colVerdictMobile : {}) }}>
        <VerdictTag verdict={g.verdict} lean={g.vlean} small />
      </span>
      {!mobile && (
        <span style={S.colPillars}>
          <MiniBars p={g.pillars} />
        </span>
      )}
      <SigmaBadge value={g.sigma} color={vc} size={mobile ? 24 : 30} />
    </div>
  );
}

/* v2026-06-19e: the Sigma score signature element — the one place this
   redesign "spends its boldness" per the frontend-design skill's restraint
   principle. A soft circular badge whose ring intensity scales with
   conviction (A+ tier sigma >= 80 gets a visible glow; everything else
   stays quiet) so the eye learns to scan straight for it across the board,
   the detail card header, and anywhere else a graded Sigma appears. Used
   in place of the old plain right-aligned mono number. */
function SigmaBadge({ value, color, size = 30 }) {
  const strong = value >= 80;
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      display: "grid", placeItems: "center",
      fontFamily: mono, fontWeight: 700, fontSize: size >= 30 ? 12 : 10.5,
      color, background: `${color}14`,
      boxShadow: strong ? `0 0 0 1px ${color}40, 0 0 14px -2px ${color}55` : `0 0 0 1px ${color}25`,
    }}>
      {value}
    </span>
  );
}

/* ============================================================
   v2026-06-20d — readable text formatting for AI-generated reports.
   House feedback: "the text from the snapshot and trade plan are a bit
   plain and dull to read." Root cause: Trade Card, Referee Card, Snapshot
   Summary, and the full Field Report are all highly structured AI output
   (emoji section headers, "Label: Value" lines, directional calls) but
   were rendered through a flat <pre> tag — one monospace color/weight for
   everything, all structure discarded. This component restores visual
   hierarchy WITHOUT touching the prompt templates or extraction regexes
   at all — it's a pure rendering-layer change applied to the same
   extracted text strings.
   Three line types recognized, each styled differently:
     1. Emoji-prefixed section headers (🎯/🔄/🚨/🏈 etc.) — bigger,
        bolder, gold, with breathing room above.
     2. "Label: Value" lines (the Trade Card/Snapshot's actual format,
        e.g. "Execution: PLAY ON") — label dimmed/small, value bold and
        colored by directional keyword when one is present.
     3. Everything else — normal readable prose line, slightly looser
        line-height than the old <pre> block had.
   Directional keyword coloring (LONG/BULLISH/PLAY ON -> bull,
   SHORT/BEARISH -> bear, NO TRADE/WAIT/NEUTRAL -> faint, A+ -> gold) is
   applied to the VALUE portion of a Label: Value line, or inline within
   prose via word-boundary matching — never alters the text content
   itself, purely a color/weight pass over what the model already wrote. */
const SECTION_HEADER_RE = /^(🎯|🔄|🚨|🏈)\s*(.+)$/;
const LABEL_VALUE_RE = /^([A-Za-z][A-Za-z0-9 /\-+]{1,32}):\s*(.+)$/;
const BULL_WORDS = /\b(LONG|BULLISH|PLAY ON|CONFIRM|RISK-ON)\b/i;
const BEAR_WORDS = /\b(SHORT|BEARISH|RISK-OFF|CONFLICT)\b/i;
const NEUTRAL_WORDS = /\b(NO TRADE|WAIT|NEUTRAL|MIXED|NOT YET|STAND ASIDE|NO EDGE)\b/i;
const GOLD_WORDS = /\bA\+/;
/* v2026-06-20g: lightweight markdown recognition, added because the
   "unexpected output" fallback block (model prose outside the Trade
   Card/Referee Card templates) was rendered as raw <pre> text — any
   markdown the model wrote (**bold**, bullet lists, headers) showed up
   as literal asterisks/dashes instead of formatted text. No markdown
   library is importable in this single-file no-bundler artifact
   environment, so this extends FormattedReport itself rather than
   adding a dependency. Covers the realistic subset a model actually
   writes in occasional prose: hash-prefixed headers, dash/star/bullet
   list items, numbered lists, and inline bold, italic, and code spans. */
const MD_HEADER_RE = /^(#{1,3})\s+(.+)$/;
const MD_BULLET_RE = /^[-*•]\s+(.+)$/;
const MD_NUMBERED_RE = /^(\d{1,2})[.)]\s+(.+)$/;
const MD_INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;

/* Renders **bold**, `code`, and *italic* spans within a line of text,
   leaving everything else as plain text. Returns an array of strings/
   React nodes suitable for use as JSX children. */
function renderInlineMarkdown(text) {
  const parts = String(text).split(MD_INLINE_RE);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} style={{ fontWeight: 700, color: COL.text }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={i} style={{ background: COL.surface3, padding: "1px 5px", borderRadius: 4, fontSize: "0.94em" }}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i} style={{ fontStyle: "italic", color: COL.mist }}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function reportLineColor(text) {
  if (GOLD_WORDS.test(text)) return COL.gold;
  if (BULL_WORDS.test(text)) return COL.bull;
  if (BEAR_WORDS.test(text)) return COL.bear;
  if (NEUTRAL_WORDS.test(text)) return COL.faint;
  return null; // no directional keyword — inherit default text color
}

function FormattedReport({ text, baseStyle }) {
  if (!text) return null;
  const lines = String(text).split("\n");
  return (
    <div style={{ ...baseStyle, whiteSpace: "normal", fontFamily: mono }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed === "") return <div key={i} style={{ height: 8 }} />;

        const sectionMatch = trimmed.match(SECTION_HEADER_RE);
        if (sectionMatch) {
          return (
            <div key={i} style={{
              fontWeight: 700, fontSize: "1.08em", color: COL.gold,
              letterSpacing: ".02em", marginTop: i === 0 ? 0 : 14, marginBottom: 4,
            }}>
              {sectionMatch[1]} {sectionMatch[2]}
            </div>
          );
        }

        const mdHeaderMatch = trimmed.match(MD_HEADER_RE);
        if (mdHeaderMatch) {
          const level = mdHeaderMatch[1].length; // 1-3 (#, ##, ###)
          return (
            <div key={i} style={{
              fontWeight: 700, fontSize: level === 1 ? "1.15em" : level === 2 ? "1.05em" : "1em",
              color: COL.text, marginTop: i === 0 ? 0 : 12, marginBottom: 4,
            }}>
              {renderInlineMarkdown(mdHeaderMatch[2])}
            </div>
          );
        }

        const bulletMatch = trimmed.match(MD_BULLET_RE);
        if (bulletMatch) {
          return (
            <div key={i} style={{ display: "flex", gap: 7, marginBottom: 3, lineHeight: 1.6 }}>
              <span style={{ color: COL.gold, flexShrink: 0 }}>•</span>
              <span style={{ color: COL.text }}>{renderInlineMarkdown(bulletMatch[1])}</span>
            </div>
          );
        }

        const numberedMatch = trimmed.match(MD_NUMBERED_RE);
        if (numberedMatch) {
          return (
            <div key={i} style={{ display: "flex", gap: 7, marginBottom: 3, lineHeight: 1.6 }}>
              <span style={{ color: COL.gold, flexShrink: 0, fontWeight: 700 }}>{numberedMatch[1]}.</span>
              <span style={{ color: COL.text }}>{renderInlineMarkdown(numberedMatch[2])}</span>
            </div>
          );
        }

        const lvMatch = trimmed.match(LABEL_VALUE_RE);
        if (lvMatch) {
          const [, label, value] = lvMatch;
          const vc = reportLineColor(value) || reportLineColor(label);
          return (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 3, lineHeight: 1.55, flexWrap: "wrap" }}>
              <span style={{ color: COL.faint, fontSize: "0.92em", flexShrink: 0 }}>{label}:</span>
              <span style={{ color: vc || COL.text, fontWeight: vc ? 700 : 500 }}>{renderInlineMarkdown(value)}</span>
            </div>
          );
        }

        // Plain prose line — still pick up directional color if a keyword
        // is present, but as a per-line tint rather than reformatting.
        // Inline markdown (**bold**/`code`/*italic*) is rendered either way.
        const vc = reportLineColor(trimmed);
        return (
          <div key={i} style={{ marginBottom: 3, lineHeight: 1.65, color: vc || COL.text }}>
            {renderInlineMarkdown(trimmed)}
          </div>
        );
      })}
    </div>
  );
}

function MiniBars({ p }) {
  const arr = [
    [p.part, COL.violet], [p.conv, COL.gold], [p.trend, COL.info],
    [p.rs, COL.bull], [p.liq, COL.bear],
  ];
  return (
    <div style={S.miniWrap}>
      {arr.map(([v, c], i) => (
        <div key={i} style={S.miniTrack} title={`${v}`}>
          <div style={{ ...S.miniFill, height: `${clamp(v)}%`, background: c }} />
        </div>
      ))}
    </div>
  );
}

/* ---------- verdict tag / referee card ---------- */
function VerdictTag({ verdict, lean, small }) {
  const vc = verdictColor(verdict, lean);
  return (
    <span style={{
      ...S.vtag, color: vc, borderColor: vc + "66", background: vc + "14",
      /* v2026-06-20b: small variant tightened (10->9px, less padding/
         letter-spacing) so "WATCH · SHORT" — the longest real verdict
         string — fits inside colVerdict's fixed 84px column instead of
         forcing the whole board row wider than its container. */
      fontSize: small ? 9 : 12, padding: small ? "2px 5px" : "4px 10px",
      letterSpacing: small ? 0 : undefined, maxWidth: "100%", overflow: "hidden",
      textOverflow: "ellipsis", whiteSpace: small ? "nowrap" : undefined,
    }}>
      {verdict}
    </span>
  );
}
function verdictColor(v, lean) {
  if (v.startsWith("A+")) return COL.gold;
  if (v === "NO-TRADE") return COL.faint;
  if (v.startsWith("WATCH") || v === "DEVELOPING")
    return lean === 1 ? COL.bull : lean === -1 ? COL.bear : COL.info;
  return COL.info;
}

/* ============================================================
   TRADE CARD
   ============================================================ */
function TradeCard({ g, prev, streak = 0 }) {
  const [tab, setTab] = useState("bias");
  const vc = verdictColor(g.verdict, g.vlean);

  // reset to bias when symbol changes
  useEffect(() => { setTab("bias"); }, [g.symbol]);

  return (
    <div style={S.card}>
      {/* card header */}
      <div style={S.cardTop}>
        <div>
          <div style={S.cardSym}>{g.symbol}
            <span style={S.cardSector}>{g.sector || "futures"}</span>
            {streak >= 2 && (
              <span style={S.streakBadge} title={`In the Σ top-10 for ${streak} consecutive snapshots — institutional flow continuity`}>
                Σ×{streak}
              </span>
            )}
          </div>
          <div style={{ ...S.refCall, color: vc }}>
            <Flag size={13} /> {g.ref.text}
          </div>
        </div>
        <div style={S.cardVerdictWrap}>
          <RefCard verdict={g.verdict} lean={g.vlean} />
          <div style={{ ...S.bigSigma, color: vc }}>
            {g.sigma}<span style={S.bigSigmaLbl}>Σ</span>
          </div>
        </div>
      </div>

      {/* pillar readout */}
      <div style={S.pillarRow}>
        <Pillar label="Participation" v={g.pillars.part} c={COL.violet} note="institutional flow" />
        <Pillar label="Convexity" v={g.pillars.conv} c={COL.gold} note={g.con.state} />
        <Pillar label="Trend" v={g.pillars.trend} c={COL.info} note={g.wits.label} />
        <Pillar label="Rel. strength" v={g.pillars.rs} c={COL.bull} note={g.haveRS ? `RS ${g.rsPct} vs SPX` : `${g.rsPct}th pct (proxy)`} />
        <Pillar label="Liquidity" v={g.pillars.liq} c={COL.bear} note={`LWC ${g.lwc.v}`} />
      </div>

      {/* tabs — Bebes Kids workflow */}
      <div style={S.tabs}>
        {[
          ["bias", "Bias", Activity],
          ["setup", "Setup", Layers],
          ["execute", "Execute", Crosshair],
          ["review", "Review", NotebookPen],
        ].map(([k, lbl, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ ...S.tab, ...(tab === k ? S.tabOn : {}) }}>
            <Icon size={13} /> {lbl}
          </button>
        ))}
      </div>

      <div style={S.tabBody}>
        {tab === "bias" && <BiasTab g={g} />}
        {tab === "setup" && <SetupTab g={g} />}
        {tab === "execute" && <ExecuteTab g={g} />}
        {tab === "review" && <ReviewTab g={g} prev={prev} />}
      </div>
    </div>
  );
}

function RefCard({ verdict, lean }) {
  const type = verdict.startsWith("A+") ? "play"
    : verdict === "NO-TRADE" ? "stop" : "caution";
  const bg = type === "play" ? (lean === -1 ? COL.bear : COL.bull)
    : type === "stop" ? COL.faint : COL.gold;
  const icons = { play: lean === 1 ? "▲" : "▼", stop: "—", caution: "◈" };
  const labels = { play: lean === 1 ? "ADVANTAGE" : "ADVANTAGE", stop: "WHISTLE", caution: "CAUTION" };
  return (
    <div style={{ ...S.refCard, background: bg + "22", border: `1.5px solid ${bg}` }}>
      <span style={{ color: bg, fontSize: 11, marginRight: 4 }}>{icons[type]}</span>
      <span style={{ ...S.refCardLbl, color: bg }}>{labels[type]}</span>
    </div>
  );
}

function Pillar({ label, v, c, note }) {
  return (
    <div style={S.pillar}>
      <div style={S.pillarTop}>
        <span style={S.pillarLbl}>{label}</span>
        <span style={{ ...S.pillarVal, color: c }}>{v}</span>
      </div>
      <div style={S.pillarTrack}>
        <div style={{ ...S.pillarFill, width: `${clamp(v)}%`, background: c }} />
      </div>
      <span style={S.pillarNote}>{note}</span>
    </div>
  );
}

/* ----- BIAS tab: Alpha Engine (2h) + Alpha Fox (15m) ----- */
function BiasTab({ g }) {
  return (
    <div>
      <SectionLabel icon={Activity} text="Directional bias — Alpha Engine + Alpha Fox" />
      <div style={{ ...S.tfGrid, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <TFCell name="Weekly" sub="Alpha Cannon" dir={g.tf.w} phase={g.tf.wP} />
        <TFCell name="Daily" sub="Alpha Cannon" dir={g.tf.d} phase={g.tf.dP} />
        <TFCell name="2H" sub="Alpha Engine" dir={g.tf.h2} phase={g.tf.h2P} />
        <TFCell name="15M" sub="Alpha Fox" dir={g.tf.m15} phase={g.tf.m15P} />
      </div>
      <div style={{ ...S.kvGrid, overflowX: "auto" }}>
        <KV k="WITS phase" v={g.wits.label} dir={g.wits.dir} />
        <KV k="IFP" v={g.ifp.label} dir={g.ifp.dir} />
        <KV k="SMRTx rank" v={Number.isFinite(g.smrtx) ? g.smrtx : "—"} dir={g.smrtx >= 65 ? 1 : g.smrtx <= 35 ? -1 : 0} />
        <KV k="VD%" v={Number.isFinite(g.vd) ? g.vd : "—"} dir={sign0(g.vd)} />
      </div>

      {/* STRSI — micro-timing ONLY (v2026-06-19: no longer adjusts Σ in any way) */}
      {g.strsi?.stage && g.strsi.stage !== "—" && (
        <div style={S.strsiBlock}>
          <div style={S.strsiRow}>
            <Wind size={13} color={timingColor(g.strsi.stage)} />
            <span style={{ ...S.strsiStage, color: timingColor(g.strsi.stage) }}>{g.strsi.stage}</span>
            <span style={S.strsiVal}>{g.strsi.val !== 0 ? (g.strsi.val > 0 ? `+${g.strsi.val}` : g.strsi.val) : ""}</span>
            <span style={S.strsiNote}>{timingNote(g.strsi.stage)}</span>
          </div>
          <div style={S.strsiLabel}>STRSI — micro-timing only · {g.microTiming} · does not score or gate the A+ verdict</div>
        </div>
      )}

      <RSReadout g={g} />

      <p style={S.refNote}>
        <Flag size={12} /> Bias is whichever way the higher frames are running. When 2H and 15M agree with
        Daily &amp; Weekly, you've got full-time confluence — that's a clean run, not a 50-50 ball.
      </p>
    </div>
  );
}

/* ----- SETUP tab: participation, volatility & convexity context ----- */
function SetupTab({ g }) {
  const iv = ivContext(g.ivp, g.implvol);
  const preMkt = isPreMarketET(new Date());
  const extHoursNow = isExtendedHoursET(new Date());
  const extLabel = preMkt ? "PRE-MKT" : extHoursNow ? "AFTER-HRS" : "closed";
  return (
    <div>
      <SectionLabel icon={Layers} text="Setup quality — participation &amp; volatility context" />
      <div style={S.kvGrid}>
        <KV k="Con Score" v={`${Number.isFinite(g.con.v) ? g.con.v : "—"} · ${g.con.state}`} dir={g.con.v >= 110 ? g.vlean : 0} />
        <KV k="Momo (breakout confirm.)" v={g.momoBreakoutOK ? `${g.momo.label} · confirmed` : g.momo.label} dir={0} />
        <KV k="IFP (15m)" v={g.ifp.label} dir={g.ifp.dir} />
        <KV k="LWC" v={g.lwc.v} dir={sign0(g.lwc.v)} />
        <KV k="Displacement" v={g.displacement ? "confirmed" : "not yet"} dir={g.displacement ? g.vlean : 0} />
        <KV k="EM Break" v={Number.isFinite(g.em) ? (g.emBreak ? `yes (±${g.em} EM)` : "no") : "—"} dir={g.emBreak ? g.vlean : 0} />
        <KV k="PI+ (1d)" v={Number.isFinite(g.pi) ? g.pi : "—"} dir={g.pi > 1.5 ? 1 : g.pi < 0 ? -1 : 0} />
        <KV k="POI (5d)" v={Number.isFinite(g.poi) ? g.poi : "—"} dir={g.poi > 1.5 ? 1 : g.poi < 0 ? -1 : 0} />
        <KV k="Volume" v={fmtCompact(g.volume)} dir={0} />
        <KV k="Open Int" v={fmtCompact(g.oint)} dir={0} />
        <KV k="OI state" v={g._raw.oistate || "—"} dir={g.oistate} />
        <KV k="BAS" v={g.bas.label} dir={g.bas.health >= 0.9 ? 1 : g.bas.health <= 0.4 ? -1 : 0} />
        <KV k="IV+ (1yr pctile)" v={Number.isFinite(g.ivp) ? g.ivp : "—"} dir={0} />
        <KV k="Impl Vol" v={Number.isFinite(g.implvol) ? `${g.implvol}%` : "—"} dir={0} />
        <KV k="-V% (vol Δ)" v={Number.isFinite(g.vpct) ? `${g.vpct > 0 ? "+" : ""}${g.vpct}` : "—"} dir={g.vpct > 1.2 ? 1 : g.vpct < -1 ? -1 : 0} />
        <KV k="VD%" v={Number.isFinite(g.vd) ? g.vd : "—"} dir={sign0(g.vd)} />
        <KV k={`EXT %Chng${extHoursNow ? ` (${extLabel})` : " (session closed)"}`}
          v={extHoursNow && Number.isFinite(g.extchng) ? `${g.extchng > 0 ? "+" : ""}${g.extchng}%` : "—"}
          dir={extHoursNow ? (sign0(g.extchng) || 0) : 0} />
      </div>
      {iv && (
        <p style={{ ...S.refNote, marginTop: 0, marginBottom: 12 }}>
          <Wind size={12} color={iv.dir > 0 ? COL.gold : iv.dir < 0 ? COL.bull : COL.faint} />
          IV+ {iv.ivpTxt} · Impl Vol {iv.ivTxt} — {iv.read}. Soft assist only ({g.ivAdj > 0 ? "+" : ""}{g.ivAdj} to Σ) — never gates the verdict.
        </p>
      )}
      {!preMkt && Number.isFinite(g.extchng) && (
        <p style={{ ...S.refNote, marginTop: 0, marginBottom: 12 }}>
          <Flag size={12} /> EXT %Chng is a pre-9:30 ET read only — the regular session's %Change and Momo
          have taken over. Last pre-market value: {g.extchng > 0 ? "+" : ""}{g.extchng}%.
        </p>
      )}
      {g.ifpPresent && (
        <p style={{ ...S.refNote, marginTop: 0, marginBottom: 12 }}>
          <Flag size={12} /> IFP is a 15m-aggregation pulse — it sharpens execution timing but no longer gates the A+ verdict, which keys off higher-timeframe structure.
        </p>
      )}

      {/* v2026-06-20c: relationship/confluence summary — the "why" behind
          the verdict above. Explicitly informational: does not gate the
          A+ call, only explains how strongly the column relationships in
          each cluster agree. */}
      {g.vlean !== 0 && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel icon={Layers} text="Column relationships — confluence read" />
          <p style={{ ...S.refNote, marginTop: 0, marginBottom: 10 }}>
            Informational context, not a gate — explains why the call sheet below reads the way it does.
          </p>
          {[
            { label: "Structural alignment", note: "Daily · Weekly · WITS agreeing", v: g.structConfluence, max: 3 },
            { label: "Institutional confirmation", note: "IFP · Con Score · SMRTx · PI+ · POI", v: g.institConfluence, max: 4 },
            { label: "Liquidity / timing context", note: "LWC · STRSI · RS (soft)", v: g.liqConfluence, max: 3 },
          ].map(({ label, note, v, max }) => (
            <div key={label} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                <span style={{ color: COL.text }}>{label} <span style={{ color: COL.faint, fontSize: 9.5 }}>· {note}</span></span>
                <span style={{ fontFamily: mono, fontWeight: 700, color: v >= max ? COL.bull : v > 0 ? COL.gold : COL.faint }}>{v}/{max}</span>
              </div>
              <div style={S.pillarTrack}>
                <div style={{ ...S.pillarFill, width: `${(v / max) * 100}%`, background: v >= max ? COL.bull : v > 0 ? COL.gold : COL.faint }} />
              </div>
            </div>
          ))}
          {g.institConfirmed && (
            <p style={{ ...S.refNote, marginTop: 4, marginBottom: 0, color: COL.gold }}>
              <ShieldCheck size={12} /> SMRTx {g.vlean === 1 ? "≥65" : "≤35"} is backed by at least one corroborating signal (IFP/Con Score/PI+/POI) — matches the dictionary's compound "Strong {g.vlean === 1 ? "Bullish" : "Bearish"}" SMRTx definition, not just the raw threshold.
            </p>
          )}
        </div>
      )}

      <SectionLabel icon={ShieldCheck} text={`A+ ${g.vlean === -1 ? "short" : "long"} call sheet`} />
      <div style={S.checks}>
        {(g.vlean === -1 ? g.shortChecks : g.longChecks).map(([lbl, ok, applicable], i) => {
          const na = applicable === false;
          const soft = SOFT_GATE_IDX.includes(i);
          return (
            <div key={i} style={S.checkRow}>
              <span style={{ ...S.checkDot, background: na ? "transparent" : ok ? COL.bull : COL.surface3, borderColor: na ? COL.borderMed : ok ? COL.bull : COL.borderMed }}>
                {na ? "·" : ok ? "✓" : ""}
              </span>
              <span style={{ ...S.checkLbl, color: na ? COL.faint : ok ? COL.text : COL.faint }}>
                {lbl}
                {soft && <span style={S.softTag}>soft</span>}
                {na ? <span style={{ fontStyle: "italic", opacity: 0.7 }}> — n/a (no column)</span> : null}
              </span>
            </div>
          );
        })}
      </div>
      {(() => {
        const coreFail = g.vlean === -1 ? g.coreFailShort : g.coreFailLong;
        const within = coreFail <= 2;
        return (
          <p style={{ ...S.refNote, color: within ? COL.bull : COL.bear }}>
            <ShieldCheck size={12} /> Core gates: {coreFail}/6 failed (≤2 allowed for A+) — {within ? "within budget" : "over budget"}.
            STRSI &amp; RS (marked "soft") are shown for context but never block A+.
          </p>
        );
      })()}
      {(g.optAdj !== 0) && (
        <p style={{ ...S.refNote, marginTop: 0 }}>
          <Wind size={12} color={g.optAdj > 0 ? COL.bull : COL.bear} />
          Options-regime assist: {g.optAdj > 0 ? "+" : ""}{g.optAdj} to Σ (VD% {g.vdAdj > 0 ? "+" : ""}{g.vdAdj}, IV+ {g.ivAdj > 0 ? "+" : ""}{g.ivAdj}) — soft, never gates.
        </p>
      )}
      {g.noTradeReasons.length > 0 && (
        <p style={S.warnNote}>
          <Ban size={12} /> No-trade flags: {g.noTradeReasons.join(", ")}.
        </p>
      )}
    </div>
  );
}

/* ----- EXECUTE tab: mindful gate → EM/ATR + R:R ----- */
function ExecuteTab({ g }) {
  const [locked, setLocked] = useState(true);
  const [quote] = useState(() => MINDFUL[Math.floor(Math.random() * MINDFUL.length)]);
  const [entry, setEntry] = useState(g.mark || "");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState(
    Number.isFinite(g.em) && Number.isFinite(g.mark)
      ? (g.vlean === -1 ? g.emLow : g.emHigh).toFixed(2) : ""
  );

  useEffect(() => { setLocked(true); }, [g.symbol]);

  const e = num(entry), s = num(stop), t = num(target);
  const risk = Number.isFinite(e) && Number.isFinite(s) ? Math.abs(e - s) : NaN;
  const reward = Number.isFinite(e) && Number.isFinite(t) ? Math.abs(t - e) : NaN;
  const rr = Number.isFinite(risk) && risk > 0 && Number.isFinite(reward) ? reward / risk : NaN;

  if (locked) {
    return (
      <div style={S.gate}>
        <Lock size={20} color={COL.gold} />
        <div style={S.gateQuote}>"{quote}"</div>
        <div style={S.gateSub}>Mandatory pre-execution check. Lock in before the trigger.</div>
        <button style={S.btnPrimary} onClick={() => setLocked(false)}>
          <Unlock size={14} /> Locked in — open execution
        </button>
      </div>
    );
  }

  return (
    <div>
      <SectionLabel icon={Target} text="Expected move — targets &amp; risk" />
      <div style={S.emRow}>
        <EMStat label="EM low" v={Number.isFinite(g.emLow) ? g.emLow.toFixed(2) : "—"} c={COL.bear} />
        <EMStat label="Mark" v={Number.isFinite(g.mark) ? g.mark : "—"} c={COL.text} />
        <EMStat label="EM high" v={Number.isFinite(g.emHigh) ? g.emHigh.toFixed(2) : "—"} c={COL.bull} />
        <EMStat label="±EM" v={Number.isFinite(g.em) ? g.em : "—"} c={COL.gold} />
      </div>

      <SectionLabel icon={Crosshair} text="R:R calculator" />
      <div style={S.rrGrid}>
        <NumField label="Entry" val={entry} set={setEntry} />
        <NumField label="Stop" val={stop} set={setStop} />
        <NumField label="Target" val={target} set={setTarget} />
      </div>
      <div style={S.rrOut}>
        <div style={S.rrStat}><span style={S.rrLbl}>Risk</span><span style={S.rrVal}>{Number.isFinite(risk) ? risk.toFixed(2) : "—"}</span></div>
        <div style={S.rrStat}><span style={S.rrLbl}>Reward</span><span style={S.rrVal}>{Number.isFinite(reward) ? reward.toFixed(2) : "—"}</span></div>
        <div style={S.rrStat}>
          <span style={S.rrLbl}>R:R</span>
          <span style={{ ...S.rrVal, color: rr >= 2 ? COL.bull : rr >= 1 ? COL.gold : COL.bear, fontSize: 22 }}>
            {Number.isFinite(rr) ? `${rr.toFixed(2)} : 1` : "—"}
          </span>
        </div>
      </div>
      <div style={S.timingRow}>
        <Wind size={13} color={timingColor(g.strsi.stage)} />
        <span style={{ color: timingColor(g.strsi.stage), fontWeight: 600 }}>{g.strsi.stage}</span>
        <span style={S.timingNote}>{timingNote(g.strsi.stage)}</span>
      </div>
      <p style={S.refNote}>
        <Flag size={12} /> The app marks the field. You place the order in your platform — the co-pilot never
        pulls the trigger for you.
      </p>
    </div>
  );
}

function timingColor(s) { return s === "EARLY" ? COL.bull : s === "EXP" ? COL.info : s === "LATE" ? COL.bear : COL.faint; }
function timingNote(s) {
  if (s === "EARLY") return "best reward/risk — early in the move.";
  if (s === "EXP") return "continuation window — trend expanding.";
  if (s === "LATE") return "extended / late whistle — size down, low R:R.";
  return "no clean timing read.";
}

/* ----- REVIEW tab: Rogue Alpha feedback loop (read-only delta) -----
   The loop is the difference between the prior CSV snapshot and the current
   one — verdict shifts, Σ change, and pillar movement. No manual journaling. */
function ReviewTab({ g, prev }) {
  const hasPrev = prev && prev.symbol === g.symbol;
  const sigmaChg = hasPrev ? g.sigma - prev.sigma : 0;
  const verdictChanged = hasPrev && prev.verdict !== g.verdict;

  const pillarDeltas = hasPrev ? [
    ["Participation", g.pillars.part - prev.pillars.part, g.pillars.part],
    ["Convexity", g.pillars.conv - prev.pillars.conv, g.pillars.conv],
    ["Trend", g.pillars.trend - prev.pillars.trend, g.pillars.trend],
    ["Rel. strength", g.pillars.rs - prev.pillars.rs, g.pillars.rs],
    ["Liquidity", g.pillars.liq - prev.pillars.liq, g.pillars.liq],
  ] : [];

  return (
    <div>
      <SectionLabel icon={NotebookPen} text="Rogue Alpha feedback loop" />
      {!hasPrev ? (
        <div style={S.empty}>
          No prior snapshot for {g.symbol} yet. Load an updated watchlist and the
          desk will track what changed since the last read — verdict shifts, Σ movement,
          and which pillars strengthened or faded.
        </div>
      ) : (
        <>
          {/* verdict transition */}
          <div style={S.reviewHero}>
            <div style={S.reviewHeroRow}>
              <span style={{ ...S.vtag, color: verdictColor(prev.verdict, prev.vlean), borderColor: verdictColor(prev.verdict, prev.vlean) + "66", background: verdictColor(prev.verdict, prev.vlean) + "14", fontSize: 11, padding: "3px 9px" }}>
                {prev.verdict}
              </span>
              <ChevronRight size={16} color={COL.faint} />
              <span style={{ ...S.vtag, color: verdictColor(g.verdict, g.vlean), borderColor: verdictColor(g.verdict, g.vlean) + "66", background: verdictColor(g.verdict, g.vlean) + "14", fontSize: 11, padding: "3px 9px" }}>
                {g.verdict}
              </span>
            </div>
            <div style={S.reviewSigma}>
              <span style={S.reviewSigmaLbl}>Σ MOVE</span>
              <span style={{ ...S.reviewSigmaVal, color: sigmaChg > 0 ? COL.bull : sigmaChg < 0 ? COL.bear : COL.mist }}>
                {sigmaChg > 0 ? "▲ +" : sigmaChg < 0 ? "▼ " : "→ "}{sigmaChg !== 0 ? sigmaChg : "no change"}
              </span>
              <span style={S.reviewSigmaSub}>{prev.sigma} → {g.sigma}</span>
            </div>
          </div>

          {verdictChanged && (
            <p style={S.refNote}>
              <Flag size={12} /> Verdict shifted from <b>{prev.verdict}</b> to <b>{g.verdict}</b> since the last load — the read on {g.symbol} has changed. Treat any prior plan as stale.
            </p>
          )}

          {/* pillar deltas */}
          <SectionLabel icon={Activity} text="Pillar movement since last snapshot" />
          <div style={S.reviewPillars}>
            {pillarDeltas.map(([label, d, cur]) => (
              <div key={label} style={S.reviewPillarRow}>
                <span style={S.reviewPillarLbl}>{label}</span>
                <span style={S.reviewPillarCur}>{cur}</span>
                <span style={{ ...S.reviewPillarDelta, color: d > 0 ? COL.bull : d < 0 ? COL.bear : COL.faint }}>
                  {d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : "—"}
                </span>
              </div>
            ))}
          </div>
          <p style={{ ...S.refNote, marginTop: 12 }}>
            <Flag size={12} /> This is the Rogue Alpha discipline check: the desk compares each fresh watchlist load against the prior one so you see what actually moved — not a manual journal, the tape's own feedback.
          </p>
        </>
      )}
    </div>
  );
}

/* ----- relative strength readout (mirrors the user's RS study) ----- */
function rsTierColor(v) {
  if (!Number.isFinite(v)) return COL.faint;
  if (v > 80) return "#1f9a44";       // dark green
  if (v > 60) return "#00af00";       // light green
  if (v > 40) return COL.mist;        // gray / neutral
  if (v > 20) return "#e10000";       // light red
  return "#a00000";                   // dark red
}
function RSReadout({ g }) {
  if (!g.haveRS) {
    return (
      <div style={S.rsBox}>
        <div style={S.rsHead}><Gauge size={12} color={COL.gold} /> Relative strength</div>
        <span style={S.rsProxy}>No RS5/10/21 columns in this export — using a session %C-WOPEN proxy ({g.rsPct}th percentile).</span>
      </div>
    );
  }
  const cells = [["RS5", g.rs5], ["RS10", g.rs10], ["RS21", g.rs21]];
  const slopeUp = g.rsSlope > 0, slopeDn = g.rsSlope < 0;
  const slopeC = slopeUp ? "#22d3ee" : slopeDn ? COL.gold : COL.faint;
  return (
    <div style={S.rsBox}>
      <div style={S.rsHead}>
        <Gauge size={12} color={COL.gold} /> Relative strength <span style={S.rsVs}>vs SPX</span>
        <span style={{ flex: 1 }} />
        <span style={{ ...S.rsSlope, color: slopeC }}>
          {slopeUp ? "▲ accelerating" : slopeDn ? "▼ fading" : "— flat"} <span style={S.rsSlopeSub}>(5v21)</span>
        </span>
      </div>
      <div style={S.rsCells}>
        {cells.map(([lbl, v]) => (
          <div key={lbl} style={{ ...S.rsCell, borderColor: rsTierColor(v) + "55" }}>
            <span style={S.rsCellLbl}>{lbl}</span>
            <span style={{ ...S.rsCellVal, color: rsTierColor(v) }}>{Number.isFinite(v) ? v : "—"}</span>
            <div style={S.rsBarTrack}><div style={{ ...S.rsBarFill, width: `${clamp(v)}%`, background: rsTierColor(v) }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- small bits ---------- */
function SectionLabel({ icon: Icon, text }) {
  return <div style={S.sectionLbl}><Icon size={13} color={COL.gold} /> <span dangerouslySetInnerHTML={{ __html: text }} /></div>;
}
function KV({ k, v, dir }) {
  const c = dir === 1 ? COL.bull : dir === -1 ? COL.bear : COL.mist;
  return (
    <div style={S.kv}>
      <span style={S.kvK}>{k}</span>
      <span style={{ ...S.kvV, color: c }}>{String(v)}</span>
    </div>
  );
}
function TFCell({ name, sub, dir, phase }) {
  const c = dir === 1 ? COL.bull : dir === -1 ? COL.bear : COL.faint;
  return (
    <div style={{ ...S.tfCell, borderColor: c + "44" }}>
      <span style={S.tfName}>{name}</span>
      <span style={{ ...S.tfArrow, color: c }}>
        {phase ? `P${phase}` : dir === 1 ? "▲" : dir === -1 ? "▼" : "■"}
        {phase ? <span style={{ fontSize: 10 }}>{dir === 1 ? " ▲" : dir === -1 ? " ▼" : " ■"}</span> : null}
      </span>
      <span style={S.tfSub}>{sub}</span>
    </div>
  );
}
function EMStat({ label, v, c }) {
  return <div style={S.emStat}><span style={S.emLbl}>{label}</span><span style={{ ...S.emVal, color: c }}>{v}</span></div>;
}
function NumField({ label, val, set }) {
  return (
    <label style={S.numField}>
      <span style={S.numLbl}>{label}</span>
      <input style={S.numInput} value={val} onChange={(e) => set(e.target.value)} inputMode="decimal" placeholder="0.00" />
    </label>
  );
}

/* ============================================================
   STYLES
   ============================================================ */
const mono = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const disp = "'Space Grotesk', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";

const S = {
  shell: { background: COL.surface0, color: COL.text, fontFamily: body, minHeight: "100%", padding: `${SP.lg}px ${SP.lg}px ${SP.xl}px`, borderRadius: 14, boxSizing: "border-box", maxWidth: "100%", overflowX: "hidden" },

  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: SP.md, flexWrap: "wrap", paddingBottom: SP.lg, marginBottom: SP.lg },
  brandWrap: { display: "flex", gap: SP.md, alignItems: "center", minWidth: 0 },
  mark: { width: 30, height: 30, borderRadius: 8, background: COL.surface2, border: `1px solid ${COL.borderSoft}`, display: "grid", placeItems: "center", flexShrink: 0 },
  brand: { fontFamily: disp, fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em", whiteSpace: "nowrap" },
  tagline: { fontSize: 10.5, color: COL.mist, marginTop: 1 },
  snapWrap: { display: "flex", flexDirection: "column", gap: SP.xs, flex: 1, minWidth: 0 },
  snapClock: { fontFamily: mono, fontSize: 10.5, color: COL.mist, letterSpacing: ".02em", display: "flex", alignItems: "center", gap: SP.xs, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  buildTag: { fontFamily: mono, fontSize: 9, color: COL.faint, letterSpacing: ".04em", marginTop: 2 },
  discordBtn: { marginLeft: "auto", fontSize: 10.5, fontFamily: mono, padding: "6px 12px", borderRadius: 20,
    cursor: "pointer", background: COL.surface1, border: `1px solid ${COL.borderSoft}`, color: COL.faint, whiteSpace: "nowrap" },
  discordBtnOn: { borderColor: `${COL.gold}55`, color: COL.gold, background: `${COL.gold}10` },
  discordPanel: { marginTop: SP.md, padding: `${SP.md}px ${SP.lg}px`, background: COL.surface1, borderRadius: 12, boxShadow: COL.shadowCard },
  snapDot: { width: 6, height: 6, borderRadius: 6, background: COL.bull, boxShadow: `0 0 8px ${COL.bull}`, display: "inline-block", flexShrink: 0 },
  macroInput: { background: COL.surface1, border: `1px solid ${COL.borderSoft}`, borderRadius: 10, color: COL.text, padding: "8px 12px", fontSize: 12, fontFamily: body, outline: "none", width: "100%", boxSizing: "border-box" },

  dataBar: { display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 8, padding: "10px 0" },
  dataLeft: { display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" },
  pastePanel: { width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: "10px 0 4px" },
  pasteArea: { width: "100%", boxSizing: "border-box", background: COL.surface1, border: `1px solid ${COL.borderSoft}`, borderRadius: 12,
    color: COL.text, fontFamily: mono, fontSize: 12, padding: "10px 12px", resize: "vertical", minHeight: 80 },
  btnPrimary: { display: "inline-flex", alignItems: "center", gap: 6, background: COL.gold, color: "#1a1405", border: "none", borderRadius: 10, padding: "9px 15px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: body, whiteSpace: "nowrap" },
  btnGhost: { display: "inline-flex", alignItems: "center", gap: 6, background: COL.surface1, color: COL.text, border: `1px solid ${COL.borderSoft}`, borderRadius: 10, padding: "9px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: body, whiteSpace: "nowrap" },
  rowCount: { fontSize: 11.5, color: COL.faint, fontFamily: mono, marginLeft: 4 },
  tally: { display: "flex", gap: 12 },

  tierChips: { display: "flex", gap: SP.xs, flexWrap: "wrap" },
  tierChip: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, background: COL.surface1, borderRadius: 10, padding: "6px 12px", cursor: "pointer", fontFamily: body, minWidth: 64 },
  tierChipOn: { boxShadow: `0 0 0 1px ${COL.gold}66`, background: `${COL.gold}14` },
  tierChipEmpty: { opacity: 0.4, cursor: "default" },
  tierChipLbl: { fontSize: 11.5, fontWeight: 600, color: COL.text },
  tierChipN: { fontSize: 8.5, color: COL.faint, fontFamily: mono },

  desk: { background: COL.surface1, borderRadius: 16, padding: `${SP.md}px ${SP.lg}px`, marginBottom: SP.lg, boxShadow: COL.shadowCard },
  deskRail: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginBottom: SP.md, color: COL.mist },
  deskRailNum: { width: 16, height: 16, borderRadius: 4, background: COL.gold, color: "#1a1405", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  deskRailTxt: { fontWeight: 600, color: COL.text, marginRight: 2 },
  deskHint: { fontSize: 9.5, color: COL.faint, letterSpacing: ".06em", textTransform: "uppercase" },
  deskGrid: { display: "grid", gridTemplateColumns: "0.9fr 1fr 1fr", gap: SP.md },
  deskCol: { background: COL.surface2, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: SP.sm },
  deskColHead: { display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 600, color: COL.mist, letterSpacing: ".03em" },
  deskLine: { fontSize: 12, fontFamily: mono, fontWeight: 600 },
  deskDot: { color: COL.faint },
  deskEmpty: { fontSize: 10.5, color: COL.faint, lineHeight: 1.5 },
  posturePill: { alignSelf: "flex-start", border: "1px solid", borderRadius: 20, padding: "5px 12px", fontWeight: 700, fontSize: 14, letterSpacing: ".04em" },
  postureScore: { fontFamily: mono, fontSize: 12, opacity: 0.8 },
  secChip: { display: "flex", alignItems: "center", gap: 7, fontSize: 11.5 },
  secDot: { width: 7, height: 7, borderRadius: 2, flexShrink: 0 },
  secSym: { fontFamily: mono, fontWeight: 700, color: COL.text, minWidth: 34 },
  secName: { color: COL.mist, fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  secRs: { fontFamily: mono, fontSize: 10, color: COL.faint },
  secSigma: { fontFamily: mono, fontWeight: 700, fontSize: 13, minWidth: 22, textAlign: "right" },
  fitBadge: { marginLeft: 7, fontSize: 9, fontWeight: 600, border: "1px solid", borderRadius: 4, padding: "0 5px", letterSpacing: ".02em" },
  strsiTag: { marginLeft: 6, fontSize: 9, fontWeight: 700, fontFamily: mono, letterSpacing: ".04em" },
  strsiBlock: { background: COL.surface2, borderRadius: 12, padding: "12px 14px", marginBottom: SP.md },
  strsiRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 3 },
  strsiStage: { fontFamily: mono, fontWeight: 700, fontSize: 16, letterSpacing: ".04em" },
  strsiVal: { fontFamily: mono, fontSize: 12, color: COL.mist },
  strsiNote: { fontSize: 11, color: COL.mist, marginLeft: 2 },
  strsiLabel: { fontSize: 9, color: COL.faint, letterSpacing: ".06em", textTransform: "uppercase" },

  /* econ calendar */
  calWrap: { background: COL.surface1, borderRadius: 16, marginBottom: SP.lg, overflow: "hidden", boxShadow: COL.shadowCard },
  calBar: { display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", background: COL.surface2 },
  calMetaLine: { fontSize: 10, fontFamily: mono, color: COL.faint, padding: "0 14px 8px", background: COL.surface2 },
  calTitle: { fontSize: 10.5, fontWeight: 700, color: COL.gold, letterSpacing: ".06em" },
  calCount: { fontSize: 10, fontFamily: mono, fontWeight: 600 },
  calFetchBtn: { background: COL.gold, color: "#1a1405", border: "none", borderRadius: 20, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  calToggle: { background: "transparent", border: "none", color: COL.faint, fontSize: 10.5, cursor: "pointer", padding: "0 4px" },
  calList: { padding: "6px 0" },
  calRow: { display: "flex", alignItems: "baseline", gap: 7, padding: "8px 14px", borderTop: `1px solid ${COL.borderSoft}`, flexWrap: "wrap" },
  calImpact: { fontSize: 11, flexShrink: 0 },
  calTime: { fontFamily: mono, fontSize: 10.5, color: COL.mist, flexShrink: 0, minWidth: 80 },
  calName: { fontSize: 12, fontWeight: 600, color: COL.text, flex: 1, minWidth: 120 },
  calMeta: { fontSize: 10.5, color: COL.mist, fontFamily: mono, flexShrink: 0 },

  /* session sync banner */
  syncBanner: { display: "flex", alignItems: "center", gap: SP.sm, padding: "8px 14px", background: COL.surface1, borderRadius: 10, marginBottom: SP.sm },
  syncDot: { width: 6, height: 6, borderRadius: 6, background: COL.bull, boxShadow: `0 0 6px ${COL.bull}`, flexShrink: 0 },
  syncText: { fontSize: 10.5, color: COL.mist, fontFamily: mono, flex: 1 },
  syncClear: { background: "transparent", border: "none", color: COL.faint, cursor: "pointer", fontSize: 11, padding: "0 2px", flexShrink: 0 },

  tallyItem: { display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1 },
  tallyN: { fontFamily: mono, fontWeight: 700, fontSize: 18 },
  tallyLbl: { fontSize: 9, color: COL.faint, letterSpacing: ".1em" },


  filterBar: { display: "flex", alignItems: "center", gap: SP.sm, paddingBottom: SP.lg },
  chip: { background: COL.surface1, color: COL.mist, border: `1px solid ${COL.borderSoft}`, borderRadius: 20, padding: "7px 14px", fontSize: 11.5, cursor: "pointer", fontFamily: body },
  chipOn: { background: COL.text, color: COL.ink, borderColor: COL.text, fontWeight: 600 },
  sortLbl: { fontSize: 10, color: COL.faint, letterSpacing: ".1em" },
  select: { background: COL.surface1, color: COL.text, border: `1px solid ${COL.borderSoft}`, borderRadius: 10, padding: "7px 10px", fontSize: 12, fontFamily: body, outline: "none" },

  main: { display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: SP.xl, alignItems: "start" },
  mainMobile: { gridTemplateColumns: "1fr" },

  /* mobile toggle */
  toggleWrap: { display: "flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" },
  toggleTrack: { width: 30, height: 16, borderRadius: 8, position: "relative", transition: "background .2s" },
  toggleThumb: { position: "absolute", top: 2, left: 2, width: 12, height: 12, borderRadius: 6, background: COL.ink, transition: "transform .2s" },
  toggleLbl: { fontSize: 9, color: COL.faint, fontFamily: mono, letterSpacing: ".1em" },

  /* tape bar */
  tapeBar: { display: "flex", alignItems: "center", gap: SP.sm, padding: `${SP.md}px 0`, marginBottom: SP.sm },
  tapeLbl: { fontSize: 10.5, fontWeight: 600, color: COL.gold, display: "flex", alignItems: "center", gap: 5, letterSpacing: ".06em", marginRight: SP.xs },
  tapeBtn: { background: COL.surface1, border: `1px solid ${COL.borderSoft}`, color: COL.mist, borderRadius: 20, padding: "6px 14px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: mono, letterSpacing: ".06em" },
  tapeBtnActive: { borderColor: `${COL.gold}66`, color: COL.gold, background: `${COL.gold}14` },
  tapeClear: { background: "transparent", border: "none", color: COL.faint, cursor: "pointer", fontSize: 14, padding: "0 4px", marginLeft: 2 },
  tapePanel: { background: COL.surface1, borderRadius: 16, overflow: "hidden", marginBottom: SP.lg, boxShadow: COL.shadowCard },
  tapePanelHead: { display: "flex", alignItems: "center", gap: 8, padding: `${SP.md}px ${SP.lg}px`, background: COL.surface2, fontSize: 11 },
  tapePanelTime: { fontSize: 10, color: COL.faint, fontFamily: mono, marginLeft: "auto" },
  tapeRestoredBadge: { fontSize: 10, color: COL.gold, fontFamily: mono, marginLeft: "auto",
    border: `1px solid ${COL.gold}55`, borderRadius: 20, padding: "2px 9px" },
  /* Decision Compression Modules */
  dcModule: { background: COL.surface1, borderRadius: 16, padding: `${SP.md}px ${SP.lg}px`, marginBottom: SP.lg, boxShadow: COL.shadowCard },
  dcHead: { display: "flex", alignItems: "center", gap: 7, marginBottom: SP.sm },
  dcTitle: { fontFamily: mono, fontSize: 10.5, fontWeight: 700, color: COL.gold, letterSpacing: ".07em" },
  dcSub: { fontFamily: mono, fontSize: 10, color: COL.faint },
  dcColHead: { fontSize: 9.5, fontFamily: mono, fontWeight: 700, color: COL.bull, letterSpacing: ".05em", marginBottom: 5 },
  dcRow: { display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 12 },
  dcRank: { fontFamily: mono, fontSize: 10, minWidth: 20 },
  dcSigma: { fontFamily: mono, fontSize: 10.5, color: COL.mist },
  dcWits: { fontFamily: mono, fontSize: 9.5, color: COL.faint },
  dcEmpty: { fontSize: 11, color: COL.faint, fontStyle: "italic", padding: "4px 0" },
  dcAplusBadge: { fontSize: 9, fontFamily: mono, fontWeight: 700, color: COL.gold,
    border: `1px solid ${COL.gold}88`, borderRadius: 4, padding: "0 4px" },
  dcFoxStatus: { marginLeft: "auto", fontFamily: mono, fontSize: 11.5, fontWeight: 700,
    border: "1px solid", borderRadius: 20, padding: "2px 10px" },
  /* Chart mode toggle */
  chartModeBtn: { fontSize: 10.5, fontFamily: mono, padding: "4px 11px", borderRadius: 20, cursor: "pointer",
    background: COL.surface1, border: `1px solid ${COL.borderSoft}`, color: COL.faint },
  chartModeBtnOn: { background: `${COL.gold}14`, borderColor: `${COL.gold}66`, color: COL.gold, fontWeight: 700 },
  /* v2026-06-20g: Trade Card + Referee Card unified into one visual result.
     House feedback: "needs nicely formatted trade card/ref card together"
     — previously these were two fully independent boxes (different
     background gradients, different border colors, a gap between them)
     that read as two unrelated alerts rather than one cohesive analysis.
     Now: analysisResultWrap is the single outer card both sections live
     inside; tradeCardSection is the primary (larger, slightly elevated)
     top section, refereeCardSection is the secondary bottom section
     separated by a hairline divider rather than its own independent
     border+background. The gold/bull accent colors are kept on each
     section's title (that distinction is still meaningful — Trade Card
     is the decisive call, Referee Card is the structural "why") but the
     two no longer compete as separate visual objects. */
  analysisResultWrap: { margin: "12px 16px 14px", borderRadius: 14, overflow: "hidden",
    border: `1px solid ${COL.bull}3a`, boxShadow: COL.shadowRaised },
  tradeCardSection: { padding: "16px 18px",
    background: "linear-gradient(135deg, #07140e 0%, #0a1422 100%)" },
  tradeCardTitle: { fontFamily: mono, fontSize: 11.5, fontWeight: 700, color: COL.bull,
    letterSpacing: ".07em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 },
  tradeCardText: { margin: 0, fontFamily: mono, fontSize: 12.5, color: COL.text,
    lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  refereeCardSection: { padding: "14px 18px", background: "rgba(245,184,61,0.05)",
    borderTop: `1px solid ${COL.gold}2a` },
  refereeCardTitle: { fontFamily: mono, fontSize: 10.5, fontWeight: 700, color: COL.gold,
    letterSpacing: ".06em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 },
  refereeCardText: { margin: 0, fontFamily: mono, fontSize: 12.5, color: COL.text,
    lineHeight: 1.75, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  tapeSummaryCard: { margin: "12px 16px 0", padding: "12px 14px", background: COL.surface2,
    border: `1px solid ${COL.gold}55`, borderRadius: 12 },
  tapeSummaryLbl: { fontFamily: mono, fontSize: 10, fontWeight: 700, color: COL.gold, letterSpacing: ".06em", marginBottom: 6 },
  tapeSummaryText: { margin: 0, fontFamily: mono, fontSize: 12.5, color: COL.text, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  tapeLoading: { display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", color: COL.mist, fontSize: 12.5 },
  tapeDot: { width: 8, height: 8, borderRadius: 4, background: COL.gold, display: "inline-block", animation: "sb-pulse 1s infinite" },
  tapeText: { margin: 0, padding: "14px 16px", fontFamily: mono, fontSize: 12, color: COL.text, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" },

  /* chart panel */
  chartPanel: { background: COL.surface1, borderRadius: 16, overflow: "hidden", marginTop: SP.lg, outline: "none", boxShadow: COL.shadowCard },
  chartPanelHead: { display: "flex", alignItems: "center", gap: 7, padding: `${SP.md}px ${SP.lg}px`, background: COL.surface2, flexWrap: "wrap", rowGap: 8 },
  chartUpBtn: { background: COL.surface1, border: `1px solid ${COL.borderSoft}`, color: COL.mist, borderRadius: 10, padding: "5px 11px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 },
  eowBadge: { marginLeft: 8, fontSize: 9.5, fontFamily: mono, fontWeight: 700,
    color: COL.violet, border: `1px solid ${COL.violet}55`, borderRadius: 5,
    padding: "1px 6px", letterSpacing: 1 },
  chartImg: { width: "100%", maxHeight: 260, objectFit: "contain", display: "block", background: COL.surface0 },
  regimeStrip: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", rowGap: 6,
    background: COL.surface1, borderRadius: 14,
    padding: `${SP.sm}px ${SP.lg}px`, margin: `${SP.md}px 0 0`, fontSize: 11, fontFamily: mono, color: COL.mist },
  regimeLbl: { fontWeight: 700, letterSpacing: 1.5, color: COL.gold, fontSize: 10 },
  regimeKV: { display: "inline-flex", gap: 5, alignItems: "center", whiteSpace: "nowrap" },
  streakBadge: { marginLeft: 8, fontSize: 9.5, fontFamily: mono, fontWeight: 700,
    color: COL.violet, border: `1px solid ${COL.violet}55`, borderRadius: 5,
    padding: "1px 5px", letterSpacing: 0.5, verticalAlign: "middle" },
  boardErrorWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    padding: "28px 16px", textAlign: "center", color: COL.text },
  boardErrorTitle: { fontWeight: 700, fontSize: 13, color: COL.bear },
  boardErrorMsg: { fontFamily: mono, fontSize: 11, color: COL.mist, wordBreak: "break-word", maxWidth: 420 },
  boardErrorHint: { fontSize: 11.5, color: COL.faint, maxWidth: 420, lineHeight: 1.5 },
  tapeThrottle: { fontSize: 10.5, fontFamily: mono, color: COL.gold, marginLeft: 8 },
  chartUploadZone: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, padding: "26px 16px", border: `2px dashed ${COL.borderMed}`, borderRadius: 14, background: COL.surface2, textAlign: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8, padding: "30px 22px", background: COL.surface1, border: `1px dashed ${COL.borderMed}`, borderRadius: 16, marginBottom: SP.lg },
  /* v2026-06-19f: renamed from emptyStateHud — purely a larger empty-state
     layout for narrow viewports; nothing to do with the retired compact-row
     "Tactical HUD" layer (removed v2026-06-19b). The old name was a stale
     holdover that read as a dependency on removed code. */
  emptyStateLg: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10, padding: "48px 22px", background: COL.surface1, borderRadius: 16, marginBottom: SP.lg, boxShadow: COL.shadowCard },
  emptyStateTitle: { fontFamily: disp, fontWeight: 700, fontSize: 16, color: COL.text, letterSpacing: ".02em" },
  emptyStateBody: { fontSize: 12.5, color: COL.mist, lineHeight: 1.6, maxWidth: 440 },
  hudSyncLine: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: mono, color: COL.mist },
  syncCheckBtn: { display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6, padding: "3px 9px", fontSize: 10.5, fontFamily: mono, color: COL.mist, background: COL.surface2, border: "none", borderRadius: 20, cursor: "pointer" },
  chartFileInput: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" },
  chartEmpty: { padding: "20px 16px", fontSize: 12, color: COL.faint, lineHeight: 1.6, textAlign: "center", fontStyle: "italic" },
  chartResult: { background: COL.surface0 },

  /* delta badge */
  deltaBadge: { fontSize: 9.5, fontFamily: mono, fontWeight: 700, marginLeft: 6, letterSpacing: ".02em" },


  board: { background: COL.surface1, borderRadius: 16, overflow: "hidden", boxShadow: COL.shadowCard },
  boardHead: { display: "flex", alignItems: "center", gap: SP.md, padding: `${SP.md}px ${SP.lg}px`, fontSize: 9.5, letterSpacing: ".12em", color: COL.faint, fontFamily: mono },
  /* v2026-06-20b: colVerdict previously had flexShrink:1 with only a
     minWidth, while the VerdictTag span inside it uses whiteSpace:nowrap
     and has no maxWidth/font-size reduction — text that can't wrap can't
     actually shrink below its own content width no matter what the flex
     math says. On narrow viewports this silently forced the whole row
     wider than the screen, which the old `overflow-x:hidden` on html/body
     then clipped instead of making reachable — the user couldn't scroll
     right to see it because there was nothing to scroll; the content was
     just cut off. Fix: colVerdict no longer competes for shrink space
     (flexShrink:0, capped maxWidth); the symbol column's existing
     flex:1/minWidth:0/ellipsis handling is what should absorb narrow-
     viewport pressure, since ticker symbols can truncate safely and
     verdict text cannot. */
  colVerdict: { width: 90, maxWidth: 90, textAlign: "left", flexShrink: 0, overflow: "hidden" },
  colVerdictMobile: { width: 64, maxWidth: 64 },
  colPillars: { width: 64, textAlign: "center", flexShrink: 0 },
  colSigma: { width: 40, textAlign: "right", fontFamily: mono, flexShrink: 0 },
  boardBody: { maxHeight: 560, overflowY: "auto", overflowX: "hidden" },
  row: { display: "flex", alignItems: "center", gap: SP.md, padding: `${SP.md}px ${SP.lg}px`, cursor: "pointer", borderTop: `1px solid ${COL.borderSoft}`, transition: "background .12s" },
  /* v2026-06-20h continued: this same screenshot was already correctly
     diagnosed above (see the v2026-06-20h changelog block near the top
     of the file) — overflow-x:hidden at shell/html-body/boardBody is
     intentional local containment, not a bug. Mid-edit this session, an
     attempt was made to "fix" those back to overflow-x:auto, which would
     have undone that correct reasoning (page-wide scroll dragging the
     whole header/board off-screen is worse than locally clipping one
     element); caught by reading the existing changelog block before
     shipping and reverted back to hidden. What's genuinely new here:
     colVerdict/SigmaBadge were still sized with desktop headroom (90px +
     30px) even after the prior pass's fixes, which on a true ~360-390px
     CSS-px phone left too little room for the symbol column and pushed
     SigmaBadge to the edge of getting clipped by boardBody's (correct)
     overflow:hidden. rowMobile/colVerdictMobile/a smaller SigmaBadge
     size reclaim that width directly so there's less for the local clip
     to ever need to hide. */
  rowMobile: { gap: 8, padding: `${SP.sm}px ${SP.md}px` },
  rowActive: { background: COL.surface2 },
  rRank: { width: 16, fontFamily: mono, fontSize: 11, color: COL.faint },
  rSym: { fontFamily: mono, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 },
  rPriceRow: { display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 },
  rMark: { fontFamily: mono, fontWeight: 600, fontSize: 12.5, color: COL.text },
  rPct: { fontFamily: mono, fontWeight: 600, fontSize: 11 },
  rSector: { fontSize: 10.5, color: COL.faint, marginTop: 1 },
  miniWrap: { display: "flex", gap: 3, height: 26, alignItems: "flex-end", justifyContent: "center" },
  miniTrack: { width: 6, height: "100%", background: COL.surface3, borderRadius: 2, display: "flex", alignItems: "flex-end", overflow: "hidden" },
  miniFill: { width: "100%", borderRadius: 2 },
  boardFoot: { padding: `${SP.md}px ${SP.lg}px`, fontSize: 10.5, color: COL.faint, borderTop: `1px solid ${COL.borderSoft}`, lineHeight: 1.5 },
  empty: { padding: SP.xl, textAlign: "center", color: COL.faint, fontSize: 12.5 },

  vtag: { fontFamily: mono, fontWeight: 600, borderRadius: 6, border: "1px solid", letterSpacing: ".03em", whiteSpace: "nowrap", display: "inline-block" },

  /* v2026-06-20h: REMOVED position:sticky/top:8 — this was the actual
     cause of a serious white-space bug reported on both desktop and
     mobile (raw white artifact background showing below the dark UI,
     cutting off mid-page). Root cause: in a 2-column CSS grid where one
     column (board + chart panel, left) is now routinely much taller
     than the other (Trade Card, right) since the chart panel moved
     into the left column (v2026-06-20e), a sticky-positioned right
     column visually detaches from the grid's actual row height once
     the page scrolls far enough for it to "catch" — it stops painting
     new background at its stuck position while the grid track still
     reserves the full original height below it, leaving nothing
     painting that space but the page's own white background. The
     marginal scroll convenience of a sticky Trade Card was not worth
     this rendering bug, so sticky positioning is removed entirely
     rather than patched around. */
  cardCol: {},
  card: { background: COL.surface1, borderRadius: 16, overflow: "hidden", maxWidth: "100%", boxShadow: COL.shadowCard },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: SP.md, padding: `${SP.lg}px`, background: COL.surface2 },
  cardSym: { fontFamily: mono, fontWeight: 700, fontSize: 24, display: "flex", alignItems: "baseline", gap: SP.sm },
  cardSector: { fontSize: 11, color: COL.faint, fontFamily: body, fontWeight: 400 },
  refCall: { fontSize: 11.5, marginTop: 6, lineHeight: 1.5, display: "flex", gap: 6, alignItems: "flex-start", maxWidth: 320 },
  cardVerdictWrap: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: SP.sm },
  refCard: { display: "inline-flex", alignItems: "center", borderRadius: 20, padding: "5px 12px", gap: 4 },
  refCardLbl: { fontFamily: mono, fontWeight: 700, fontSize: 10, letterSpacing: ".06em" },
  bigSigma: { fontFamily: mono, fontWeight: 700, fontSize: 30, lineHeight: 1, display: "flex", alignItems: "baseline" },
  bigSigmaLbl: { fontSize: 12, color: COL.faint, marginLeft: 3 },

  pillarRow: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: SP.md, padding: `${SP.lg}px`, overflowX: "auto", WebkitOverflowScrolling: "touch" },
  pillar: { display: "flex", flexDirection: "column", gap: 5 },
  pillarTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  pillarLbl: { fontSize: 9, color: COL.mist, letterSpacing: ".02em" },
  pillarVal: { fontFamily: mono, fontWeight: 700, fontSize: 13 },
  pillarTrack: { height: 4, background: COL.surface3, borderRadius: 3, overflow: "hidden" },
  pillarFill: { height: "100%", borderRadius: 3 },
  pillarNote: { fontSize: 8.5, color: COL.faint, fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },

  tabs: { display: "flex", gap: SP.xs, padding: `${SP.sm}px ${SP.md}px 0` },
  tab: { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: "transparent", color: COL.mist, border: "none", borderBottom: `2px solid transparent`, padding: "10px 6px", fontSize: 12, cursor: "pointer", fontFamily: body, fontWeight: 500 },
  tabOn: { color: COL.gold, borderBottomColor: COL.gold },
  tabBody: { padding: `${SP.lg}px ${SP.lg}px ${SP.xl}px`, minHeight: 230, overflowX: "auto", WebkitOverflowScrolling: "touch" },

  sectionLbl: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: COL.text, fontWeight: 600, letterSpacing: ".02em", margin: "4px 0 12px", textTransform: "none" },

  tfGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: SP.sm, marginBottom: SP.lg },
  tfCell: { border: `1px solid ${COL.borderSoft}`, borderRadius: 12, padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: COL.surface2 },
  tfName: { fontSize: 11, fontWeight: 600 },
  tfArrow: { fontSize: 15, lineHeight: 1 },
  tfSub: { fontSize: 8.5, color: COL.faint },

  kvGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: SP.sm, marginBottom: SP.lg, overflowX: "auto" },
  kv: { display: "flex", justifyContent: "space-between", alignItems: "center", background: COL.surface2, borderRadius: 10, padding: "9px 12px" },
  kvK: { fontSize: 11, color: COL.mist },
  kvV: { fontFamily: mono, fontWeight: 600, fontSize: 12.5 },

  rsBox: { background: COL.surface2, borderRadius: 12, padding: "12px 14px", marginBottom: SP.sm },
  rsHead: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: COL.text, marginBottom: SP.sm, flexWrap: "wrap", rowGap: 3 },
  rsVs: { fontSize: 9, color: COL.faint, fontWeight: 400 },
  rsSlope: { fontSize: 9.5, fontWeight: 600, fontFamily: mono, whiteSpace: "nowrap" },
  rsSlopeSub: { color: COL.faint, fontWeight: 400 },
  rsProxy: { fontSize: 11, color: COL.mist, lineHeight: 1.5, display: "block" },
  rsCells: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 },
  rsCell: { border: "1px solid", borderRadius: 8, padding: "7px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0, overflow: "hidden" },
  rsCellLbl: { fontSize: 9, color: COL.faint, letterSpacing: ".08em" },
  rsCellVal: { fontFamily: mono, fontWeight: 700, fontSize: 16, lineHeight: 1 },
  rsBarTrack: { width: "100%", height: 3, background: COL.surface3, borderRadius: 3, overflow: "hidden" },
  rsBarFill: { height: "100%", borderRadius: 3 },

  checks: { display: "flex", flexDirection: "column", gap: SP.sm, marginBottom: SP.md },
  checkRow: { display: "flex", alignItems: "center", gap: 9 },
  checkDot: { width: 17, height: 17, borderRadius: 5, border: "1px solid", display: "grid", placeItems: "center", fontSize: 10, color: COL.ink, fontWeight: 700, flexShrink: 0 },
  checkLbl: { fontSize: 12 },
  softTag: { marginLeft: 6, fontSize: 8.5, fontFamily: mono, fontWeight: 700,
    color: COL.violet, border: `1px solid ${COL.violet}55`, borderRadius: 4,
    padding: "0px 4px", letterSpacing: 0.5, verticalAlign: "middle" },

  refNote: { fontSize: 11, color: COL.mist, lineHeight: 1.55, display: "flex", gap: 6, alignItems: "flex-start", marginTop: SP.md, background: COL.surface2, padding: "10px 12px", borderRadius: 10 },
  warnNote: { fontSize: 11, color: COL.gold, lineHeight: 1.5, display: "flex", gap: 6, alignItems: "center", marginTop: SP.sm },

  gate: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: "30px 18px", minHeight: 200 },
  gateQuote: { fontFamily: disp, fontSize: 16, fontStyle: "italic", color: COL.text, maxWidth: 360, lineHeight: 1.5 },
  gateSub: { fontSize: 11, color: COL.faint },

  emRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: SP.sm, marginBottom: SP.lg },
  emStat: { background: COL.surface2, borderRadius: 10, padding: "10px 8px", textAlign: "center" },
  emLbl: { fontSize: 9, color: COL.faint, letterSpacing: ".06em", display: "block" },
  emVal: { fontFamily: mono, fontWeight: 700, fontSize: 14, display: "block", marginTop: 3 },

  rrGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: SP.sm, marginBottom: SP.md },
  numField: { display: "flex", flexDirection: "column", gap: 4 },
  numLbl: { fontSize: 10, color: COL.mist, letterSpacing: ".04em" },
  numInput: { background: COL.surface1, border: `1px solid ${COL.borderSoft}`, borderRadius: 10, color: COL.text, padding: "9px 11px", fontFamily: mono, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" },
  rrOut: { display: "flex", gap: 10, alignItems: "center", justifyContent: "space-around", background: COL.surface2, borderRadius: 12, padding: "13px 10px" },
  rrStat: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
  rrLbl: { fontSize: 9.5, color: COL.faint, letterSpacing: ".08em" },
  rrVal: { fontFamily: mono, fontWeight: 700, fontSize: 16 },

  timingRow: { display: "flex", alignItems: "center", gap: 8, marginTop: SP.md, fontSize: 11.5 },
  timingNote: { color: COL.mist },

  reviewHero: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: COL.surface2, borderRadius: 12, padding: "13px 15px", marginBottom: SP.md, flexWrap: "wrap" },
  reviewHeroRow: { display: "flex", alignItems: "center", gap: 8 },
  reviewSigma: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 },
  reviewSigmaLbl: { fontSize: 8.5, color: COL.faint, letterSpacing: ".1em" },
  reviewSigmaVal: { fontFamily: mono, fontWeight: 700, fontSize: 16, lineHeight: 1 },
  reviewSigmaSub: { fontFamily: mono, fontSize: 10, color: COL.faint },
  reviewPillars: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 },
  reviewPillarRow: { display: "flex", alignItems: "center", gap: 10, background: COL.surface2, borderRadius: 10, padding: "9px 12px" },
  reviewPillarLbl: { fontSize: 11.5, color: COL.mist, flex: 1 },
  reviewPillarCur: { fontFamily: mono, fontWeight: 600, fontSize: 12.5, color: COL.text, minWidth: 28, textAlign: "right" },
  reviewPillarDelta: { fontFamily: mono, fontWeight: 700, fontSize: 11.5, minWidth: 56, textAlign: "right" },
};

const CSS = `
  @keyframes sb-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
  @keyframes sb-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  .sb-spin { display:inline-block; animation: sb-spin 0.8s linear infinite; }
  @keyframes sb-fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
  *, *::before, *::after { box-sizing: border-box; }
  /* v2026-06-20h: reverted v2026-06-20b's overflow-x:auto safety net on
     html/body after a real mobile screenshot showed it backfiring —
     ANY single overflowing element anywhere on the page made the WHOLE
     PAGE horizontally scrollable, visually dragging the header and every
     row's rank number off the left edge to reveal that one offending
     element on the right, rather than clipping just that element
     locally. A page-wide safety net is the wrong shape for this problem:
     the correct pattern is overflow-x:hidden at the true page root (so
     nothing can ever drag the whole page sideways) plus overflow-x:auto
     only on the SPECIFIC scrollable regions that legitimately need it —
     S.boardBody now has its own overflowX:hidden for exactly this
     reason, and tfGrid/pillarRow/kvGrid/tabBody already had their own
     local overflow-x:auto from earlier sessions. Root-caused overflow
     sources should still be fixed directly (as v2026-06-20b did for
     VerdictTag/colVerdict) — this comment is about where the SAFETY NET
     belongs, not a substitute for fixing root causes.
     v2026-06-20h: added min-height:100% here as a second, defensive
     layer against the white-space bug fixed at its root cause in
     cardCol above (removed position:sticky). html/body previously had
     no height rule at all, so they sized purely to content — normally
     fine, but it meant nothing guaranteed the dark shell's background
     would cover the full page if content height and visual paint ever
     diverged for any reason. This costs nothing when content already
     fills the page (the common case) and only matters as a guard for
     edge cases not yet discovered.
     v2026-06-20i: that guard was insufficient — the bug recurred,
     specifically while chart analysis is actively streaming. Root cause
     identified: shell's minHeight setting of "100%" is a RELATIVE value
     computed against its parent (the artifact iframe's container),
     which itself sizes to content. During active streaming, content
     height changes on every token (many renders per second); if the
     iframe's resize observer lags even one frame behind the actual DOM
     paint, shell's "100%" briefly resolves against a stale, shorter
     measurement than what's actually rendered, and the gap paints as
     raw white page background underneath. The same min-height:100% rule
     on html/body cannot fix this because it has the exact same
     relative-value problem one level up.
     Actual fix: html/body now get the SAME dark background as the app
     directly, removing the dependency on any height calculation being
     correct at all — there is structurally no white surface left
     anywhere on the page for a timing gap to expose, regardless of how
     shell/iframe height settle relative to each other. */
  html, body { max-width: 100%; min-height: 100%; overflow-x: hidden; background: ${COL.surface0}; }
  /* Belt-and-suspenders: if the actual React mount point is a div
     between <body> and S.shell (common in iframe-embedded artifacts),
     an html/body background alone wouldn't reach it. #root is the
     conventional mount id; harmless no-op if it doesn't exist here. */
  #root { min-height: 100%; background: ${COL.surface0}; }
  .sb-row:hover { background: ${COL.surface2} !important; }
  .sb-filter-bar { display:flex; align-items:center; gap:7px; padding-bottom:10px; flex-wrap:wrap; }
  @media (max-width: 500px) {
    .sb-filter-bar { flex-wrap:nowrap; overflow-x:auto; padding-bottom:8px; -webkit-overflow-scrolling:touch; }
    .sb-filter-bar::-webkit-scrollbar { display:none; }
  }
  *::-webkit-scrollbar { width: 9px; height: 9px; }
  *::-webkit-scrollbar-thumb { background: ${COL.surface3}; border-radius: 6px; }
  *::-webkit-scrollbar-track { background: transparent; }
  input::placeholder, textarea::placeholder { color: ${COL.faint}; }
  @media (max-width: 760px) {
    .sb-main-collapse { grid-template-columns: 1fr !important; }
  }
`;

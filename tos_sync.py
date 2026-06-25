"""
tos_sync.py — ThinkorSwim CSV Auto-Sync for Vigilant Alpha Group
================================================================
Watches your TOS export folder. The moment new CSVs appear, it:
  1. Copies them into the repo  (public/data/tos-exports/)
  2. Updates manifest.json      (sets exportedAt to right now)
  3. Commits + pushes to GitHub (Netlify deploys automatically)

SETUP (one time):
  1. Install Python 3.9+  →  https://www.python.org/downloads/
  2. Install dependencies:
       pip install watchdog gitpython
  3. Edit the CONFIG section below (5 values to set)
  4. Double-click  tos_sync.bat  to run — it stays open in the background

HOW TO EXPORT FROM THINKORSWIM:
  MarketWatch → Watchlist → (gear icon) → Export CSV
  Do this for each of your 4 watchlists. Save them anywhere on your Desktop.
  tos_sync watches the folder you specify in WATCH_DIR below.

TIER DETECTION (automatic — just export and save):
  The script reads the CSV content and figures out which tier it is:
    • Futures / macro tickers  → saved as Futures.csv
    • Sector ETFs (SPY/XLK…)  → saved as Sector_Symbols.csv
    • Top-5 / stocks           → saved as Top_5.csv
    • Scans / options rows     → saved as Scans.csv
  You do NOT need to rename your files — tos_sync handles that.
"""

import os
import re
import sys
import json
import shutil
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

# ── CONFIG ────────────────────────────────────────────────────────────────────

# Folder where ThinkorSwim saves its CSV exports.
WATCH_DIR = r"C:\Users\User\Documents\GitHub\Mobile-VAG\TOS CSV"

# Full path to your local clone of the Mobile-VAG repo.
REPO_DIR = r"C:\Users\User\Documents\GitHub\Mobile-VAG"

# GitHub organization / username that owns the repo
GITHUB_USER = "vigilantalphagroup"

# Your GitHub Personal Access Token (classic, repo scope).
# ⚠️  PASTE YOUR TOKEN HERE after generating it at: https://github.com/settings/tokens
# Needs: repo (full control of private repositories)
GITHUB_TOKEN = "PASTE_YOUR_TOKEN_HERE"

# Branch to push to (leave as main)
GIT_BRANCH = "main"

# ── END CONFIG ────────────────────────────────────────────────────────────────

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    import git
except ImportError:
    print("\n❌  Missing dependencies. Run this first:\n")
    print("    pip install watchdog gitpython\n")
    sys.exit(1)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("tos_sync")

DEST_DIR = Path(REPO_DIR) / "public" / "data" / "tos-exports"
MANIFEST = DEST_DIR / "manifest.json"

# ── Tier detection (mirrors sniffTier() in SigmaBondCoPilot.jsx) ─────────────

# ETF list used for sector detection
SECTOR_ETFS = {
    "SPY","QQQ","IWM","DIA","XLK","XLF","XLE","XLV","XLI",
    "XLY","XLP","XLU","XLB","XLRE","XLC","SMH","GLD","SLV",
    "TLT","HYG","LQD","USO","UNG","ARKK","IAU","VNQ",
}

def sniff_tier(path: Path) -> str | None:
    """Return 'macro' | 'sector' | 'stocks' | 'scans' or None if not a TOS CSV."""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None

    # Must look like a TOS export (has at least one column header we recognise)
    if not any(col in text for col in ("Last", "Volume", "WITS", "IFP", "SMRTx", "%Change")):
        return None

    name_lower = path.stem.lower()
    first_200 = text[:200].lower()

    # Explicit title hints
    if "future" in name_lower or "future" in first_200:
        return "macro"
    if "sector" in name_lower or "spdr" in first_200:
        return "sector"
    if "top" in name_lower and "5" in name_lower:
        return "stocks"
    if "scan" in name_lower:
        return "scans"

    # Content heuristics
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    symbols = []
    for line in lines[1:16]:  # sample first 15 data rows
        parts = line.split(",")
        if parts:
            sym = parts[0].strip().strip('"')
            if sym:
                symbols.append(sym.upper())

    # Futures: / or $ prefix tickers
    futures_count = sum(1 for s in symbols if s.startswith("/") or s.startswith("$"))
    if futures_count >= len(symbols) * 0.5:
        return "macro"

    # Options rows: .SYMBOL format
    options_count = sum(1 for s in symbols if s.startswith(".") or re.match(r"[A-Z]+\d{6}[CP]", s))
    if options_count >= 2 or "IFP" in text:
        return "scans"

    # Sector: ≥60% ETF hits
    etf_count = sum(1 for s in symbols if s in SECTOR_ETFS)
    if symbols and etf_count / len(symbols) >= 0.6:
        return "sector"

    return "stocks"  # default


TIER_FILENAME = {
    "macro":   "Futures.csv",
    "sector":  "Sector_Symbols.csv",
    "stocks":  "Top_5.csv",
    "scans":   "Scans.csv",
}

# ── Git push ──────────────────────────────────────────────────────────────────

def git_push(changed_files: list[str]):
    try:
        repo_url = f"https://{GITHUB_USER}:{GITHUB_TOKEN}@github.com/{GITHUB_USER}/Mobile-VAG.git"
        repo = git.Repo(REPO_DIR)

        # Make sure remote uses token auth
        origin = repo.remotes.origin
        origin.set_url(repo_url)

        repo.index.add(changed_files)
        repo.index.commit(f"chore: TOS sync {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}")
        origin.push(refspec=f"{GIT_BRANCH}:{GIT_BRANCH}")
        log.info("✅  Pushed to GitHub — Netlify deploying now")
    except Exception as e:
        log.error(f"❌  Git push failed: {e}")


def update_manifest(updated_tiers: list[str]):
    exportedAt = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    try:
        existing = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    except Exception:
        existing = {}

    files = existing.get("files", list(TIER_FILENAME.values()))
    payload = {
        "exportedAt": exportedAt,
        "files": files,
        "note": "Update exportedAt to the current time each time you replace these CSV files. The app treats data older than 15 minutes as stale and overlays live prices automatically.",
    }
    MANIFEST.write_text(json.dumps(payload, indent=2))
    log.info(f"📋  manifest.json → exportedAt = {exportedAt}")
    return str(MANIFEST.relative_to(REPO_DIR)).replace("\\", "/")


# ── File watcher ──────────────────────────────────────────────────────────────

class TOSHandler(FileSystemEventHandler):
    def __init__(self):
        self._pending: dict[str, float] = {}  # path → last-modified time
        self._debounce = 3.0  # seconds to wait after last write before processing

    def on_modified(self, event):
        if not event.is_directory:
            self._pending[event.src_path] = time.time()

    def on_created(self, event):
        if not event.is_directory:
            self._pending[event.src_path] = time.time()

    def flush_pending(self):
        """Call this in the main loop — processes files that have been stable for debounce seconds."""
        now = time.time()
        ready = [p for p, t in self._pending.items() if now - t >= self._debounce]
        if not ready:
            return

        changed_repo_files = []
        updated_tiers = []

        for src_path in ready:
            del self._pending[src_path]
            p = Path(src_path)
            if p.suffix.lower() != ".csv":
                continue
            if not p.exists():
                continue

            tier = sniff_tier(p)
            if not tier:
                log.info(f"⏭   Skipping {p.name} — doesn't look like a TOS watchlist export")
                continue

            dest_name = TIER_FILENAME[tier]
            dest_path = DEST_DIR / dest_name
            DEST_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dest_path)
            log.info(f"📂  {p.name}  →  {dest_name}  (tier: {tier})")

            rel = str(dest_path.relative_to(REPO_DIR)).replace("\\", "/")
            changed_repo_files.append(rel)
            updated_tiers.append(tier)

        if changed_repo_files:
            manifest_rel = update_manifest(updated_tiers)
            changed_repo_files.append(manifest_rel)
            git_push(changed_repo_files)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    watch = Path(WATCH_DIR)
    if not watch.exists():
        log.error(f"❌  WATCH_DIR does not exist: {WATCH_DIR}")
        log.error("    Edit the CONFIG section at the top of tos_sync.py")
        sys.exit(1)

    if not Path(REPO_DIR).exists():
        log.error(f"❌  REPO_DIR does not exist: {REPO_DIR}")
        log.error("    Edit the CONFIG section at the top of tos_sync.py")
        sys.exit(1)

    log.info("🏈  VAG TOS Sync running")
    log.info(f"    Watching : {WATCH_DIR}")
    log.info(f"    Repo     : {REPO_DIR}")
    log.info(f"    Branch   : {GIT_BRANCH}")
    log.info("    Export CSVs from ThinkorSwim → they'll auto-push to GitHub")
    log.info("    Press Ctrl+C to stop\n")

    handler = TOSHandler()
    observer = Observer()
    observer.schedule(handler, str(watch), recursive=False)
    observer.start()

    try:
        while True:
            handler.flush_pending()
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Stopping…")
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()

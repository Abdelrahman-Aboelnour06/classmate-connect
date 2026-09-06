#!/usr/bin/env python3
"""
Cairo University Engineering Faculty — Result Statistics CSV Scraper
====================================================================
Scrapes https://chreg.eng.cu.edu.eg/chsresultstatistics.aspx

For every (Program × Semester) combination it:
  1. Selects the program via ASP.NET postback
  2. Selects the semester via ASP.NET postback
  3. Clicks the "Show All Subjects" button (عرض جميع المواد)
  4. Extracts the full grades table

Output:
    cu_result_statistics.csv   — one flat file, columns:
                                  Program | Semester | <table columns…>

Usage:
    pip install requests beautifulsoup4 pandas tqdm
    python cu_scraper_csv.py             # full scrape
    python cu_scraper_csv.py --diagnose  # inspect page structure only
"""

import csv
import logging
import re
import sys
import time
from typing import Optional

import pandas as pd
import requests
from bs4 import BeautifulSoup

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

    class tqdm:                                  # lightweight shim
        def __init__(self, iterable=None, total=None, **kw):
            self.it = iterable or []
        def __iter__(self): return iter(self.it)
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def update(self, n=1): pass
        def set_description(self, s): print(f"  → {s}", flush=True)
        def close(self): pass


# ── Configuration ─────────────────────────────────────────────────────────

BASE_URL   = "https://chreg.eng.cu.edu.eg"
STATS_URL  = f"{BASE_URL}/chsresultstatistics.aspx"
OUTPUT_CSV = "cu_result_statistics.csv"

DELAY_SEC  = 1.5    # polite pause between every HTTP request
RETRIES    = 3
BACKOFF    = 5      # seconds; multiplied by attempt number on each retry

# Keywords used to detect the "Show All Subjects" button
SHOW_ALL_KEYWORDS = [
    "show all", "all subjects", "show subjects",
    "عرض جميع", "جميع المواد", "كل المواد", "عرض الكل",
    "all", "جميع",
]

ASPNET_HIDDEN = [
    "__VIEWSTATE", "__VIEWSTATEGENERATOR",
    "__EVENTVALIDATION",
    "__SCROLLPOSITIONX", "__SCROLLPOSITIONY",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("cu_csv")


# ══════════════════════════════════════════════════════════════════════════
# HTTP helpers
# ══════════════════════════════════════════════════════════════════════════

def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def fetch(
    session: requests.Session,
    url:     str,
    data:    Optional[dict] = None,
    params:  Optional[dict] = None,
    method:  str = "GET",
) -> requests.Response:
    """GET or POST with automatic retries + polite delay."""
    for attempt in range(1, RETRIES + 1):
        try:
            if method == "POST":
                r = session.post(url, data=data, timeout=120)
            else:
                r = session.get(url, params=params, timeout=120)
            r.raise_for_status()
            time.sleep(DELAY_SEC)
            return r
        except requests.RequestException as exc:
            log.warning(f"Attempt {attempt}/{RETRIES} failed: {exc}")
            if attempt < RETRIES:
                time.sleep(BACKOFF * attempt)
            else:
                raise


# ══════════════════════════════════════════════════════════════════════════
# ASP.NET page helpers
# ══════════════════════════════════════════════════════════════════════════

def parse_html(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def get_hidden_fields(soup: BeautifulSoup) -> dict:
    """Extract all ASP.NET hidden fields from the form."""
    fields: dict = {}
    for name in ASPNET_HIDDEN:
        tag = soup.find("input", {"name": name})
        if tag:
            fields[name] = tag.get("value", "")
    form = soup.find("form")
    if form:
        for inp in form.find_all("input", {"type": "hidden"}):
            n = inp.get("name", "")
            if n and n not in fields:
                fields[n] = inp.get("value", "")
    return fields


def get_selects(soup: BeautifulSoup) -> dict:
    """
    Return {select_name: {option_value: option_label}}.
    Prefers 'name' attribute, falls back to 'id'.
    """
    result: dict = {}
    for tag in soup.find_all("select"):
        name = tag.get("name") or tag.get("id") or ""
        if not name:
            continue
        opts: dict = {}
        for opt in tag.find_all("option"):
            v = opt.get("value", "").strip()
            t = opt.get_text(strip=True)
            opts[v] = t
        result[name] = opts
    return result


def build_post(
    hidden:      dict,
    selects_now: dict,
    event_target: str  = "",
    event_arg:    str  = "",
    extra:        Optional[dict] = None,
) -> dict:
    """
    Assemble a complete ASP.NET POST body.
    selects_now: {select_name: selected_value}
    """
    payload = {
        "__EVENTTARGET":   event_target,
        "__EVENTARGUMENT": event_arg,
        **hidden,
        **selects_now,
    }
    if extra:
        payload.update(extra)
    return payload


# ══════════════════════════════════════════════════════════════════════════
# "Show All Subjects" button detection
# ══════════════════════════════════════════════════════════════════════════

def _matches_show_all(text: str) -> bool:
    t = text.strip().lower()
    return any(kw in t for kw in SHOW_ALL_KEYWORDS)


def find_show_all_button(soup: BeautifulSoup) -> Optional[dict]:
    """
    Locate the 'Show All Subjects' control on the page.

    Returns one of:
        {"type": "submit",   "name": "...", "value": "..."}
        {"type": "postback", "target": "...", "arg": ""}
        None  — button not present on this page
    """
    # ── input[type=submit] or input[type=button] ──────────────────────
    for inp in soup.find_all("input", {"type": ["submit", "button"]}):
        val = inp.get("value", "")
        if _matches_show_all(val):
            return {"type": "submit", "name": inp.get("name", ""), "value": val}

    # ── <button> elements ─────────────────────────────────────────────
    for btn in soup.find_all("button"):
        txt = btn.get_text(strip=True)
        if _matches_show_all(txt):
            return {"type": "submit", "name": btn.get("name", ""), "value": txt}

    # ── ASP.NET LinkButton  → <a href="javascript:__doPostBack(…)"> ──
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        txt  = a.get_text(strip=True)
        if "__doPostBack" in href and _matches_show_all(txt):
            m = re.search(r"__doPostBack\('([^']+)'\s*,\s*'([^']*)'", href)
            if m:
                return {"type": "postback", "target": m.group(1), "arg": m.group(2)}

    # ── Fallback: any <a> whose text matches ─────────────────────────
    for a in soup.find_all("a"):
        txt = a.get_text(strip=True)
        if _matches_show_all(txt) and "__doPostBack" in a.get("onclick", ""):
            m = re.search(r"__doPostBack\('([^']+)'\s*,\s*'([^']*)'", a.get("onclick", ""))
            if m:
                return {"type": "postback", "target": m.group(1), "arg": m.group(2)}

    return None


def click_show_all(
    session:     requests.Session,
    soup:        BeautifulSoup,
    hidden:      dict,
    selects_now: dict,
) -> Optional[BeautifulSoup]:
    """
    Click the Show-All button and return the resulting soup.
    Returns None if no button found (caller should use the existing soup).
    """
    btn = find_show_all_button(soup)
    if btn is None:
        return None

    if btn["type"] == "submit":
        extra = {btn["name"]: btn["value"]} if btn["name"] else {}
        payload = build_post(hidden, selects_now, extra=extra)
    else:  # postback
        payload = build_post(hidden, selects_now,
                             event_target=btn["target"],
                             event_arg=btn["arg"])

    try:
        resp = fetch(session, STATS_URL, data=payload, method="POST")
        return parse_html(resp.text)
    except requests.RequestException as e:
        log.warning(f"    Show-All click failed: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════════
# Table extraction
# ══════════════════════════════════════════════════════════════════════════

def extract_best_table(soup: BeautifulSoup) -> Optional[pd.DataFrame]:
    """
    Find the richest data table in the page and return it as a DataFrame.
    'Richest' = most (rows × cols), with a meaningful header.
    """
    best_table = None
    best_score = 0

    for tbl in soup.find_all("table"):
        trs = tbl.find_all("tr")
        if len(trs) < 2:
            continue
        header_cells = trs[0].find_all(["td", "th"])
        col_count     = len(header_cells)
        if col_count < 2:
            continue
        score = len(trs) * col_count
        if score > best_score:
            best_table = tbl
            best_score = score

    if best_table is None:
        return None

    rows = []
    for tr in best_table.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
        if any(cells):
            rows.append(cells)

    if len(rows) < 2:
        return None

    max_cols = max(len(r) for r in rows)
    rows     = [r + [""] * (max_cols - len(r)) for r in rows]

    df = pd.DataFrame(rows[1:], columns=rows[0])
    df = df.replace("", pd.NA).dropna(how="all")
    return df if not df.empty else None


# ══════════════════════════════════════════════════════════════════════════
# Dropdown role detection
# ══════════════════════════════════════════════════════════════════════════

PROGRAM_HINTS  = ["prog", "dept", "برنامج", "شعب", "program", "department"]
SEMESTER_HINTS = ["sem",  "term",  "فصل",   "semester", "term"]
YEAR_HINTS     = ["year", "عام",   "academic"]


def classify_selects(selects: dict) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Returns (prog_key, sem_key, year_key) — any may be None.
    """
    prog_key = sem_key = year_key = None

    for name in selects:
        n = name.lower()
        labels = " ".join(selects[name].values()).lower()

        if any(h in n for h in PROGRAM_HINTS) and prog_key is None:
            prog_key = name
        elif any(h in n for h in SEMESTER_HINTS) and sem_key is None:
            sem_key = name
        elif any(h in n for h in YEAR_HINTS) and year_key is None:
            year_key = name
        elif any(w in labels for w in ["first", "second", "أول", "ثاني"]):
            if sem_key is None:
                sem_key = name

    # Fallbacks by position
    keys = list(selects.keys())
    if prog_key is None and len(keys) > 0:
        prog_key = keys[0]
    if sem_key  is None and len(keys) > 1:
        sem_key  = keys[1]

    return prog_key, sem_key, year_key


# ══════════════════════════════════════════════════════════════════════════
# Core scraping loop
# ══════════════════════════════════════════════════════════════════════════

def scrape_all(session: requests.Session) -> list[dict]:
    """
    Iterate every Program × Semester, click Show All, extract table.
    Returns a list of flat row-dicts ready to write as CSV.
    """
    all_rows: list[dict] = []

    # ── Load initial page ─────────────────────────────────────────────
    log.info("Loading initial page …")
    resp = fetch(session, STATS_URL, params={"s": "1"})
    soup = parse_html(resp.text)

    selects = get_selects(soup)
    if not selects:
        log.error(
            "No dropdowns found — the page may need authentication or JavaScript.\n"
            "Run with --diagnose to inspect the raw HTML structure."
        )
        return []

    log.info(f"Dropdowns found: {list(selects.keys())}")
    prog_key, sem_key, year_key = classify_selects(selects)
    log.info(f"  → Program  dropdown : {prog_key!r}")
    log.info(f"  → Semester dropdown : {sem_key!r}")
    log.info(f"  → Year     dropdown : {year_key!r}")

    prog_opts = {v: l for v, l in selects[prog_key].items() if v} if prog_key else {}
    sem_opts  = {v: l for v, l in selects[sem_key].items()  if v} if sem_key  else {"": "(all)"}
    year_opts = {v: l for v, l in selects[year_key].items() if v} if year_key else {"": "(all)"}

    log.info(
        f"  Programs={len(prog_opts)}  "
        f"Semesters={len(sem_opts)}  "
        f"Years={len(year_opts)}"
    )

    total = len(prog_opts) * len(sem_opts) * len(year_opts)
    log.info(f"Total combinations: {total}")

    # ── Main triple-loop ──────────────────────────────────────────────
    pbar = tqdm(total=total, desc="Scraping", unit="combo")
    # ── Multithreaded execution ───────────────────────────────────────
    MAX_WORKERS = min(10, len(prog_opts) if prog_opts else 1)
    log.info(f"Starting multithreading with {MAX_WORKERS} workers...")

    for prog_val, prog_label in prog_opts.items():

        # Select program
        state = {}
        if prog_key:  state[prog_key] = prog_val
        if sem_key:   state[sem_key]  = list(sem_opts.keys())[0]
        if year_key:  state[year_key] = list(year_opts.keys())[0]

        h = get_hidden_fields(soup)
        try:
            resp      = fetch(session, STATS_URL, data=build_post(h, state, event_target=prog_key or ""), method="POST")
            prog_soup = parse_html(resp.text)
            h         = get_hidden_fields(prog_soup)
            new_sels  = get_selects(prog_soup)
            if new_sels:
                selects = new_sels
        except requests.RequestException as e:
            log.error(f"Skipping program {prog_label!r}: {e}")
            pbar.update(len(sem_opts) * len(year_opts))
            continue

        for sem_val, sem_label in sem_opts.items():

            # Select semester
            state2 = {}
            if prog_key: state2[prog_key] = prog_val
            if sem_key:  state2[sem_key]  = sem_val
            if year_key: state2[year_key] = list(year_opts.keys())[0]

            if sem_key and sem_val:
    with tqdm(total=total, desc="Scraping", unit="combo") as pbar:
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = []
            for prog_val, prog_label in prog_opts.items():
                futures.append(
                    executor.submit(
                        scrape_program_worker,
                        prog_val, prog_label,
                        prog_key, sem_key, year_key,
                        sem_opts, year_opts,
                        pbar
                    )
                )
            
            for future in concurrent.futures.as_completed(futures):
                try:
                    resp     = fetch(session, STATS_URL, data=build_post(h, state2, event_target=sem_key), method="POST")
                    sem_soup = parse_html(resp.text)
                    h_sem    = get_hidden_fields(sem_soup)
                    new_s    = get_selects(sem_soup)
                    if new_s:
                        selects = new_s
                except requests.RequestException as e:
                    log.error(f"  Skipping {prog_label!r}/{sem_label!r}: {e}")
                    pbar.update(len(year_opts))
                    continue
            else:
                sem_soup = prog_soup
                h_sem    = h
                    all_rows.extend(future.result())
                except Exception as e:
                    log.error(f"Worker exception: {e}")

            for year_val, year_label in year_opts.items():
                pbar.set_description(f"{prog_label[:22]} / {sem_label[:15]}")

                # Select year (if applicable)
                state3 = dict(state2)
                if year_key and year_val:
                    state3[year_key] = year_val
                    try:
                        resp      = fetch(session, STATS_URL, data=build_post(h_sem, state3, event_target=year_key), method="POST")
                        yr_soup   = parse_html(resp.text)
                        h_yr      = get_hidden_fields(yr_soup)
                    except requests.RequestException as e:
                        log.error(f"    Skipping year {year_label!r}: {e}")
                        pbar.update(1)
                        continue
                else:
                    yr_soup = sem_soup
                    h_yr    = h_sem

                # Click "Show All Subjects"
                full_soup = click_show_all(session, yr_soup, h_yr, state3)
                if full_soup is None:
                    full_soup = yr_soup  # fall back to pre-click page

                # Extract data table
                df = extract_best_table(full_soup)
                if df is not None and not df.empty:
                    meta = {
                        "Program":  prog_label,
                        "Semester": sem_label,
                    }
                    if year_key:
                        meta["Year"] = year_label

                    for _, row in df.iterrows():
                        all_rows.append({**meta, **row.to_dict()})

                    log.info(
                        f"  ✓ {prog_label[:20]} / {sem_label}"
                        + (f" / {year_label}" if year_key else "")
                        + f" → {len(df)} rows"
                    )
                else:
                    log.info(
                        f"  – {prog_label[:20]} / {sem_label}"
                        + (f" / {year_label}" if year_key else "")
                        + " → no data"
                    )

                pbar.update(1)

    pbar.close()
    return all_rows


# ══════════════════════════════════════════════════════════════════════════
# Output
# ══════════════════════════════════════════════════════════════════════════

def save_csv(rows: list[dict], path: str) -> None:
    if not rows:
        log.warning("No data collected — CSV not written.")
        return

    df = pd.DataFrame(rows)

    # Move metadata columns to the front
    meta_cols = [c for c in ["Program", "Semester", "Year"] if c in df.columns]
    other_cols = [c for c in df.columns if c not in meta_cols]
    df = df[meta_cols + other_cols]

    df.to_csv(path, index=False, encoding="utf-8-sig")  # utf-8-sig = Excel-friendly BOM
    log.info(f"Saved {len(df):,} rows → {path}")


# ══════════════════════════════════════════════════════════════════════════
# Diagnostic mode  (--diagnose)
# ══════════════════════════════════════════════════════════════════════════

def diagnose(session: requests.Session) -> None:
    """Print raw page structure to help debug unexpected page layouts."""
    log.info("=== DIAGNOSTIC MODE ===")
    for s_val in range(1, 4):
        try:
            resp = fetch(session, STATS_URL, params={"s": str(s_val)})
        except requests.RequestException as e:
            print(f"\ns={s_val}: FAILED — {e}")
            continue

        soup = parse_html(resp.text)
        print(f"\n{'='*60}")
        print(f"URL : {STATS_URL}?s={s_val}")
        print(f"HTTP: {resp.status_code}")
        print(f"Title: {soup.title.text.strip() if soup.title else 'N/A'}")

        # Dropdowns
        selects = get_selects(soup)
        print(f"\n── Dropdowns ({len(selects)}) ──")
        for name, opts in selects.items():
            sample = list(opts.items())[:5]
            print(f"  name={name!r}  ({len(opts)} options)")
            for v, l in sample:
                print(f"    [{v!r}] {l}")
            if len(opts) > 5:
                print(f"    … +{len(opts)-5} more")

        # Buttons
        print(f"\n── Buttons / Submit inputs ──")
        for inp in soup.find_all("input", {"type": ["submit", "button"]}):
            print(f"  <input type={inp.get('type')!r} name={inp.get('name')!r} value={inp.get('value')!r}>")
        for btn in soup.find_all("button"):
            print(f"  <button name={btn.get('name')!r}> {btn.get_text(strip=True)!r} </button>")

        # Link buttons
        print(f"\n── ASP.NET LinkButtons (__doPostBack) ──")
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            if "__doPostBack" in href:
                print(f"  text={a.get_text(strip=True)!r}  href={href[:100]!r}")

        # Tables
        tables = soup.find_all("table")
        print(f"\n── Tables ({len(tables)}) ──")
        for i, tbl in enumerate(tables[:5]):
            trs = tbl.find_all("tr")
            if trs:
                hdr = [c.get_text(strip=True) for c in trs[0].find_all(["td", "th"])]
                print(f"  Table {i}: {len(trs)} rows, header={hdr[:6]}")

        # Show-All button detection
        btn = find_show_all_button(soup)
        print(f"\n── 'Show All' button detected: {btn} ──")


# ══════════════════════════════════════════════════════════════════════════
# Entry point
# ══════════════════════════════════════════════════════════════════════════

def main() -> None:
    print("=" * 62)
    print("  Cairo University Engineering — Result Statistics → CSV")
    print("=" * 62)

    session = make_session()

    if "--diagnose" in sys.argv:
        diagnose(session)
        return

    # ── Scrape ────────────────────────────────────────────────────────
    try:
        rows = scrape_all(session)
    except requests.RequestException as e:
        log.error(f"Network error: {e}")
        log.error(
            "The site may block non-Egyptian IPs. "
            "Try running from an Egyptian VPN or university network."
        )
        sys.exit(1)

    # ── Save ──────────────────────────────────────────────────────────
    save_csv(rows, OUTPUT_CSV)

    if rows:
        df = pd.DataFrame(rows)
        print()
        print("┌──────────────────────────────────────────────┐")
        print(f"│  Programs collected  : {df['Program'].nunique():<22}│")
        print(f"│  Semesters collected : {df['Semester'].nunique():<22}│")
        print(f"│  Total rows          : {len(df):<22,}│")
        print(f"│  Output file         : {OUTPUT_CSV:<22}│")
        print("└──────────────────────────────────────────────┘")


if __name__ == "__main__":
    main()

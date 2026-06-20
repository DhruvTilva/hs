"""
scrapers/network_growth.py — 3-Engine Cascading Search Edition

Discovers AI/ML recruiters, hiring managers, CTOs, and founders
on LinkedIn via Google X-Ray search.

3-Engine Cascade (quality-first):
  Engine 1: SerpAPI       — best Google results (250 free/month)
  Engine 2: Serper.dev    — Google results (2,500 free credits per key, supports multiple keys)
  Engine 3: DuckDuckGo    — unlimited free, no key needed

For each query, the system tries Engine 1 first. If it returns results → done.
If it fails → try Engine 2. If that also fails → try Engine 3.
Expensive API credits are used first for quality, free engines are safety nets.

Run:     python scrapers/network_growth.py
Schedule: Manual via GitHub Actions UI (Guide → Automations → Network Growth)
"""
import os
import sys
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
import time
import random
import re
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.common import get_supabase_client, log_scraper_run  # type: ignore

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── Config / Keys ─────────────────────────────────────────────────────────────

SERPAPI_KEY   = os.getenv("SERPAPI_KEY", "")
SERPER_KEY    = os.getenv("SERPER_2_NETWORK_KEY", "")   # Serper.dev key dedicated to Network Growth
SERPER_KEY_2  = os.getenv("SERPER_3_NETWORK_KEY", "")   # Second Serper.dev key for extra credits

# ── Search Queries ────────────────────────────────────────────────────────────

HEADLINE_HIRING_KEYWORDS = [
    "hiring", "recruiter", "recruitment", "talent acquisition",
    "staffing", "hr ", "human resources", "people operations",
    "looking for", "we are hiring", "join our team", "open position",
    "openings", "vacancy", "headhunter",
    "engineering manager", "cto", "vp ", "head of", "founder",
    "co-founder", "tech lead", "director", "chief technology",
]

HEADLINE_AI_ML_KEYWORDS = [
    "ai", "ml", "artificial intelligence", "machine learning",
    "deep learning", "data scientist", "data science",
    "genai", "gen ai", "generative ai", "llm", "large language",
    "nlp", "natural language", "computer vision",
    "mlops", "ai engineer", "ml engineer", "ai/ml",
]

ALLOWED_LOCATIONS = ["ahmedabad", "gandhinagar", "gift city", "gujarat", "remote"]

# ── Search Engines ────────────────────────────────────────────────────────────

def _serpapi_search(query: str, num: int = 10) -> list[dict]:
    """Engine 1: SerpAPI — best quality, 250 free/month."""
    if not SERPAPI_KEY:
        return []
    try:
        r = requests.get(
            "https://serpapi.com/search",
            params={"q": query, "api_key": SERPAPI_KEY, "num": num, "hl": "en", "gl": "in"},
            timeout=10,
        )
        if r.status_code == 429:
            logger.warning("[Engine 1] SerpAPI rate limit hit")
            return []
        data = r.json()
        if "error" in data:
            logger.warning("[Engine 1] SerpAPI error: %s", data["error"])
            return []
        results = []
        for item in data.get("organic_results", [])[:num]:
            results.append({
                "title": item.get("title", ""),
                "snippet": item.get("snippet", ""),
                "url": item.get("link", ""),
            })
        return results
    except Exception as exc:
        logger.debug("[Engine 1] SerpAPI failed: %s", exc)
        return []


def _serper_search(query: str, num: int = 10) -> list[dict]:
    """Engine 2: Serper.dev — Google results, 2,500 free credits per key.
    Tries SERPER_KEY first, then SERPER_KEY_2 if first key fails."""
    keys_to_try = [k for k in [SERPER_KEY, SERPER_KEY_2] if k]
    if not keys_to_try:
        return []

    for key in keys_to_try:
        try:
            r = requests.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": key, "Content-Type": "application/json"},
                json={"q": query, "num": num, "gl": "in", "hl": "en"},
                timeout=10,
            )
            if r.status_code == 429:
                logger.warning("[Engine 2] Serper key exhausted, trying next key...")
                continue
            if r.status_code != 200:
                continue
            data = r.json()
            results = []
            for item in data.get("organic", [])[:num]:
                results.append({
                    "title": item.get("title", ""),
                    "snippet": item.get("snippet", ""),
                    "url": item.get("link", ""),
                })
            if results:
                return results
        except Exception as exc:
            logger.debug("[Engine 2] Serper key failed: %s", exc)
            continue
    return []


def _duckduckgo_search(query: str, num: int = 10) -> list[dict]:
    """Engine 3: DuckDuckGo — completely free, unlimited, no key needed."""
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        logger.warning("[Engine 3] duckduckgo-search not installed")
        return []

    try:
        with DDGS() as ddgs:
            raw = list(ddgs.text(query, max_results=num))
        results = []
        for item in raw:
            results.append({
                "title": item.get("title", ""),
                "snippet": item.get("body", ""),
                "url": item.get("href", ""),
            })
        return results
    except Exception as exc:
        logger.debug("[Engine 3] DuckDuckGo failed: %s", exc)
        return []


def smart_search(query: str, num: int = 20) -> tuple[list[dict], str]:
    """
    3-Engine Cascading Search — tries each engine in quality order.
    Returns (results, engine_name) so we can log which engine was used.
    """
    # Engine 1: SerpAPI (best quality)
    results = _serpapi_search(query, num)
    if results:
        return results, "SerpAPI"

    # Engine 2: Serper.dev (Google quality, large free tier)
    results = _serper_search(query, num)
    if results:
        return results, "Serper.dev"

    # Engine 3: DuckDuckGo (unlimited free)
    results = _duckduckgo_search(query, num)
    if results:
        return results, "DuckDuckGo"

    return [], "none"


# ── Profile Extraction ────────────────────────────────────────────────────────

def determine_category(title: str, snippet: str) -> str | None:
    combined = (title + " " + snippet).lower()
    
    decision_makers = ["founder", "co-founder", "cto", "chief technology", "vp ", "head of", "director"]
    if any(k in combined for k in decision_makers):
        return "founder"
        
    recruiting = ["hr ", "human resources", "recruiter", "talent acquisition", "headhunter", "staffing", "people operations"]
    if any(k in combined for k in recruiting):
        return "ai_ml_recruiter"
        
    managers = ["engineering manager", "tech lead", "manager", "hiring"]
    if any(k in combined for k in managers):
        return "hiring_manager"
        
    return None


def extract_name(title: str) -> str:
    name = re.split(r'\s*[-|]\s*', title)[0]
    return name.strip()


def extract_company(snippet: str) -> str | None:
    match = re.search(r'at\s+([A-Z][A-Za-z0-9\s]+(?:Technologies|Tech|AI|Solutions|Labs|Pvt|Ltd)?)', snippet)
    if match:
        return match.group(1).strip()
    return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Network Growth Discovery (3-Engine Cascading Search)")
    print("=" * 60)

    # Show which engines are available
    engines_available = []
    if SERPAPI_KEY:   engines_available.append("SerpAPI")
    if SERPER_KEY or SERPER_KEY_2: engines_available.append(f"Serper.dev ({sum(1 for k in [SERPER_KEY, SERPER_KEY_2] if k)} keys)")
    engines_available.append("DuckDuckGo (always free)")
    print(f"  Engines: {' -> '.join(engines_available)}")
    print("=" * 60)

    client = get_supabase_client()
    new_found = 0
    errors = []
    engine_usage = {}

    # Get companies from watchlist to find their employees
    print("\n[network] Fetching watchlist companies...")
    watchlist = []
    if client:
        try:
            watchlist = client.table("companies").select("name").execute().data or []
        except Exception:
            pass

    # Randomize watchlist so we don't query the exact same 10 companies every day
    random.shuffle(watchlist)
    
    company_queries = []
    for c in watchlist[:10]:
        hr_kw = random.choice(HEADLINE_HIRING_KEYWORDS)
        ai_kw = random.choice(HEADLINE_AI_ML_KEYWORDS)
        company_queries.append(f'site:linkedin.com/in/ "{c["name"]}" "{hr_kw}" "{ai_kw}"')

    # Combinatorial Query Generator for generic location-based searches
    random_queries = []
    for _ in range(10):
        hr_kw = random.choice(HEADLINE_HIRING_KEYWORDS)
        ai_kw = random.choice(HEADLINE_AI_ML_KEYWORDS)
        loc = random.choice(ALLOWED_LOCATIONS)
        random_queries.append(f'site:linkedin.com/in/ "{hr_kw}" "{ai_kw}" "{loc}"')

    all_queries = random_queries + company_queries
    print(f"[network] Running {len(all_queries)} dynamic queries...\n")

    discovered = []
    seen_urls = set()

    for i, query in enumerate(all_queries, 1):
        print(f"[{i}/{len(all_queries)}] {query[:70]}...")
        try:
            results, engine = smart_search(query, num=20)
            engine_usage[engine] = engine_usage.get(engine, 0) + 1
            print(f"  -> {len(results)} results via {engine}")

            for r in results:
                url = r["url"]
                if url in seen_urls or "linkedin.com/in/" not in url:
                    continue
                seen_urls.add(url)

                name = extract_name(r["title"])
                if not name or len(name) > 50:
                    continue

                category = determine_category(r["title"], r["snippet"])
                if category is None:
                    continue  # Strict filtering: Discard irrelevant profiles
                company = extract_company(r["snippet"])

                discovered.append({
                    "name": name,
                    "linkedin_url": url,
                    "title": r["title"][:100],
                    "company": company,
                    "hiring_focus": category,
                    "last_active": datetime.now(timezone.utc).date().isoformat(),
                    "contacted": False,
                })

            time.sleep(random.uniform(2, 4))
        except Exception as e:
            errors.append(f"Query {query[:50]} failed: {e}")

    print(f"\n[network] Discovered {len(discovered)} profiles. Saving...")
    print(f"[network] Engine usage: {json.dumps(engine_usage)}")

    for profile in discovered:
        try:
            if client:
                existing = client.table("recruiters").select("id").eq("linkedin_url", profile["linkedin_url"]).execute()
                if existing.data:
                    continue
                client.table("recruiters").insert(profile).execute()
            else:
                print(f"  [dry-mode] {profile['name']} at {profile.get('company')}")
            new_found += 1
        except Exception as e:
            errors.append(f"{profile['name']}: {e}")

    log_scraper_run(
        client, "network_growth",
        "success" if not errors else "partial_success", new_found,
        "\n".join(errors) if errors else None,
    )

    print(f"\n{'='*60}")
    print(f"  Done. New profiles saved: {new_found}")
    print(f"  Engine breakdown: {json.dumps(engine_usage)}")
    if errors:
        for e in errors[:5]:
            print(f"  ! {e}")
    print(f"{'='*60}")
    return 0


if __name__ == "__main__":
    main()

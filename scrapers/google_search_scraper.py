"""
LinkedIn Network Growth Engine — AI/ML Recruiter Discovery

Discovers HR, recruiters, talent acquisition leads, hiring managers, and
founders in the AI/ML domain across Ahmedabad, Gandhinagar, GIFT City, and
Gujarat via two free methods:

1. SerpAPI (site:linkedin.com/in/ queries) — 3 queries/run
2. DuckDuckGo (free, unlimited) — 5 queries/run

Each run:
 - Clears the `recruiter_leads` display table
 - Discovers new profiles
 - Dedup-checks against permanent `recruiters` table
 - Inserts new profiles into both tables
 - Sends Telegram notification

Run: python scrapers/google_search_scraper.py
"""
from __future__ import annotations

import os
import re
import sys
import time
import random
from collections import Counter
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.common import (
    Recruiter,
    get_supabase_client,
    insert_recruiter,
    log_scraper_run,
    send_telegram_message,
)

# ─────────────────────────────────────────────────────────────
# QUERY POOLS
# ─────────────────────────────────────────────────────────────

SERPAPI_RECRUITER_POOL = [
    # ═══ AI/ML Recruiters with Hiring Headlines ═══
    'site:linkedin.com/in/ "hiring" "AI engineer" "Ahmedabad"',
    'site:linkedin.com/in/ "hiring" "ML engineer" "Ahmedabad"',
    'site:linkedin.com/in/ "hiring" "data scientist" "Ahmedabad"',
    'site:linkedin.com/in/ "hiring" ("GenAI" OR "LLM") "Ahmedabad"',
    'site:linkedin.com/in/ "hiring" "machine learning" "Gujarat"',
    'site:linkedin.com/in/ "hiring" ("AI" OR "ML") "Gandhinagar"',

    # ═══ Recruiter + AI/ML Domain ═══
    'site:linkedin.com/in/ "recruiter" ("AI" OR "machine learning") "Ahmedabad"',
    'site:linkedin.com/in/ "recruiter" ("data scientist" OR "ML engineer") "Gujarat"',
    'site:linkedin.com/in/ "recruiter" ("GenAI" OR "LLM" OR "NLP") "Ahmedabad"',

    # ═══ Talent Acquisition + AI/ML ═══
    'site:linkedin.com/in/ "talent acquisition" ("AI" OR "machine learning") "Ahmedabad"',
    'site:linkedin.com/in/ "talent acquisition" ("data science" OR "ML") "Gujarat"',
    'site:linkedin.com/in/ "talent acquisition" ("AI" OR "deep learning") "Gandhinagar"',

    # ═══ HR + AI/ML Hiring ═══
    'site:linkedin.com/in/ "HR" ("hiring AI" OR "hiring ML") "Ahmedabad"',
    'site:linkedin.com/in/ "HR" ("AI engineer" OR "data scientist") "Gujarat"',

    # ═══ Active Hiring Signals ═══
    'site:linkedin.com/in/ "we are hiring" ("AI" OR "ML") "Ahmedabad"',
    'site:linkedin.com/in/ "looking for" ("AI engineer" OR "ML engineer") "Gujarat"',
    'site:linkedin.com/in/ "join our team" ("AI" OR "machine learning") "Ahmedabad"',
    'site:linkedin.com/in/ "open position" ("AI" OR "GenAI" OR "LLM") "Gujarat"',

    # ═══ GIFT City Specific ═══
    'site:linkedin.com/in/ ("hiring" OR "recruiter") ("AI" OR "ML") "GIFT City"',
    'site:linkedin.com/in/ "talent acquisition" ("AI" OR "data") "GIFT City"',

    # ═══ AI/ML Hiring Managers & Decision Makers ═══
    'site:linkedin.com/in/ "engineering manager" ("AI" OR "machine learning") "Ahmedabad"',
    'site:linkedin.com/in/ ("CTO" OR "VP Engineering") "AI" "Ahmedabad"',
    'site:linkedin.com/in/ ("founder" OR "co-founder") ("AI" OR "GenAI") "Ahmedabad"',
    'site:linkedin.com/in/ "head of AI" OR "AI lead" "Ahmedabad" OR "Gujarat"',
    'site:linkedin.com/in/ "tech lead" ("AI" OR "ML") "Ahmedabad"',

    # ═══ AI/ML Staffing & Placement ═══
    'site:linkedin.com/in/ "staffing" ("AI" OR "ML" OR "data science") "Ahmedabad"',
    'site:linkedin.com/in/ "placement" ("AI" OR "machine learning") "Gujarat"',

    # ═══ Remote AI/ML Hiring ═══
    'site:linkedin.com/in/ "hiring" ("AI engineer" OR "ML engineer") "remote" "India"',
    'site:linkedin.com/in/ "recruiter" ("AI" OR "ML") "remote" "Gujarat"',
]

DDGS_RECRUITER_POOL = [
    "linkedin.com/in hiring AI engineer Ahmedabad",
    "linkedin.com/in hiring ML engineer Ahmedabad",
    "linkedin.com/in hiring data scientist Gujarat",
    "linkedin.com/in hiring GenAI LLM Ahmedabad",
    "linkedin.com/in recruiter AI machine learning Ahmedabad",
    "linkedin.com/in talent acquisition AI ML Ahmedabad",
    "linkedin.com/in HR hiring AI Ahmedabad",
    "linkedin.com/in hiring machine learning Gandhinagar",
    "linkedin.com/in recruiter GenAI GIFT City",
    "linkedin.com/in engineering manager AI Ahmedabad",
    "linkedin.com/in CTO AI startup Ahmedabad",
    "linkedin.com/in founder AI ML Ahmedabad Gujarat",
    "linkedin.com/in we are hiring AI ML Ahmedabad",
    "linkedin.com/in recruiter deep learning Ahmedabad",
    "linkedin.com/in recruiter NLP computer vision Gujarat",
    "linkedin.com/in hiring AI engineer remote India",
    "linkedin.com/in data scientist hiring Gujarat",
    "linkedin.com/in MLOps hiring Ahmedabad",
    "linkedin.com/in AI hiring manager Gujarat",
    "linkedin.com/in talent acquisition data science Gandhinagar",
]

# ─────────────────────────────────────────────────────────────
# VALIDATION KEYWORDS
# ─────────────────────────────────────────────────────────────

HEADLINE_HIRING_KEYWORDS = [
    "hiring", "recruiter", "recruitment", "talent acquisition",
    "staffing", "hr ", "human resources", "people operations",
    "looking for", "we are hiring", "join our team", "open position",
    "openings", "vacancy", "headhunter",
    # Decision makers
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

# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

def is_valid_profile(title: str, snippet: str) -> bool:
    """Must have hiring signal + AI/ML signal in headline/snippet."""
    text = f"{title} {snippet}".lower()
    has_hiring = any(kw in text for kw in HEADLINE_HIRING_KEYWORDS)
    has_aiml = any(kw in text for kw in HEADLINE_AI_ML_KEYWORDS)
    return has_hiring and has_aiml


def is_valid_location(title: str, snippet: str) -> bool:
    """Must mention an allowed location."""
    text = f"{title} {snippet}".lower()
    return any(loc in text for loc in ALLOWED_LOCATIONS)


def infer_location(text: str) -> str:
    lowered = text.lower()
    if "gift city" in lowered:
        return "GIFT City"
    if "gandhinagar" in lowered:
        return "Gandhinagar"
    if "ahmedabad" in lowered:
        return "Ahmedabad"
    if "gujarat" in lowered:
        return "Gujarat"
    if "remote" in lowered:
        return "Remote"
    return "Gujarat"


def infer_category(title: str, snippet: str) -> str:
    """Categorise the profile based on keywords."""
    text = f"{title} {snippet}".lower()
    if any(kw in text for kw in ["founder", "co-founder", "ceo"]):
        return "founder"
    if any(kw in text for kw in ["cto", "vp ", "head of", "director", "chief technology"]):
        return "hiring_manager"
    if any(kw in text for kw in ["engineering manager", "tech lead", "team lead"]):
        return "hiring_manager"
    if any(kw in text for kw in ["talent acquisition", "recruiter", "headhunter", "staffing", "placement"]):
        return "ai_ml_recruiter"
    if any(kw in text for kw in ["hr ", "human resources", "people operations"]):
        return "ai_ml_recruiter"
    return "ai_ml_recruiter"


def parse_profile_from_result(result: dict[str, str], source: str) -> Recruiter | None:
    """Parse a Google/DDG search result into a Recruiter."""
    title = str(result.get("title", "")).strip()
    link = str(result.get("link") or result.get("href", "")).strip()
    snippet = str(result.get("snippet") or result.get("body", "")).strip()

    # Must be a LinkedIn profile
    if "linkedin.com/in/" not in link:
        return None

    # Must pass double-filter
    if not is_valid_profile(title, snippet):
        return None

    # Must be in allowed locations
    if not is_valid_location(title, snippet):
        return None

    # Parse name (always first segment before " - ")
    name = title.split(" - ")[0].strip().replace(" | LinkedIn", "").strip()
    if not name or len(name) < 2:
        return None

    # Parse company
    company = None
    if " at " in title:
        company = title.split(" at ")[-1].split(" - ")[0].split(" | ")[0].strip()
    elif " - " in title:
        parts = title.split(" - ")
        if len(parts) >= 3:
            company = parts[2].replace("| LinkedIn", "").replace("LinkedIn", "").strip()
        elif len(parts) >= 2:
            company = parts[1].replace("| LinkedIn", "").replace("LinkedIn", "").strip()

    # Clean up company name
    if company:
        company = company.strip(" -|")
        if company.lower() in ["linkedin", "", "india"]:
            company = None

    # Build headline from title (full title minus "| LinkedIn")
    headline = re.sub(r"\s*\|\s*LinkedIn\s*$", "", title, flags=re.IGNORECASE).strip()

    location = infer_location(f"{title} {snippet}")
    category = infer_category(title, snippet)

    return Recruiter(
        name=name[:120],
        linkedin_url=link,
        company=company[:120] if company else None,
        location=location,
        notes=f"Source: {source}\nSnippet: {snippet[:300]}",
        category=category,
        headline=headline[:250] if headline else None,
    )


# ─────────────────────────────────────────────────────────────
# METHOD 1: SERPAPI
# ─────────────────────────────────────────────────────────────

def run_serpapi_queries(serpapi_key: str, num_queries: int = 3) -> list[Recruiter]:
    """Run random SerpAPI queries and return discovered recruiters."""
    selected = random.sample(SERPAPI_RECRUITER_POOL, min(num_queries, len(SERPAPI_RECRUITER_POOL)))
    recruiters: list[Recruiter] = []

    for query in selected:
        try:
            resp = requests.get(
                "https://serpapi.com/search.json",
                params={
                    "engine": "google",
                    "q": query,
                    "api_key": serpapi_key,
                    "num": 10,
                },
                timeout=30,
            )
            payload = resp.json()
            results = payload.get("organic_results", [])

            for result in results:
                rec = parse_profile_from_result(result, "serpapi")
                if rec:
                    recruiters.append(rec)

            print(f"  [SerpAPI] {query} → {len(results)} results")
            time.sleep(random.uniform(1.5, 2.5))
        except Exception as exc:
            print(f"  [SerpAPI] Error: {exc}")

    return recruiters


# ─────────────────────────────────────────────────────────────
# METHOD 2: DUCKDUCKGO (FREE)
# ─────────────────────────────────────────────────────────────

def run_ddgs_queries(num_queries: int = 5) -> list[Recruiter]:
    """Run random DuckDuckGo queries and return discovered recruiters."""
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        print("  [DDG] duckduckgo_search not installed, skipping")
        return []

    selected = random.sample(DDGS_RECRUITER_POOL, min(num_queries, len(DDGS_RECRUITER_POOL)))
    recruiters: list[Recruiter] = []

    for query in selected:
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=10))

            for result in results:
                rec = parse_profile_from_result(result, "duckduckgo")
                if rec:
                    recruiters.append(rec)

            print(f"  [DDG] {query} → {len(results)} results")
            time.sleep(random.uniform(1.0, 2.0))
        except Exception as exc:
            print(f"  [DDG] Error: {exc}")

    return recruiters


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

def main() -> int:
    client = get_supabase_client()
    if client is None:
        log_scraper_run(client, "network_growth", "dry_run", 0, None)
        return 0

    serpapi_key = os.getenv("SERPAPI_KEY_2") or os.getenv("SERPAPI_KEY")

    stats = {
        "serpapi_found": 0,
        "ddgs_found": 0,
        "inserted": 0,
        "skipped_dup": 0,
        "errors": [],
    }

    # ═══════════════════════════════════════════════════════════
    # STEP 1: Clear recruiter_leads display table
    # ═══════════════════════════════════════════════════════════
    print("\n=== Step 1: Clearing recruiter_leads display table ===")
    try:
        # Delete all existing leads (fresh batch every run)
        client.table("recruiter_leads").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        print("  [✓] Cleared recruiter_leads table")
    except Exception as exc:
        print(f"  [!] Could not clear recruiter_leads: {exc}")
        stats["errors"].append(f"Clear table error: {exc}")

    # ═══════════════════════════════════════════════════════════
    # STEP 2: Run SerpAPI queries
    # ═══════════════════════════════════════════════════════════
    all_recruiters: list[Recruiter] = []

    if serpapi_key:
        print("\n=== Step 2: SerpAPI Recruiter Discovery ===")
        serpapi_results = run_serpapi_queries(serpapi_key, num_queries=3)
        all_recruiters.extend(serpapi_results)
        stats["serpapi_found"] = len(serpapi_results)
    else:
        print("\n[SKIP] No SerpAPI key found, skipping SerpAPI queries")

    # ═══════════════════════════════════════════════════════════
    # STEP 3: Run DuckDuckGo queries (FREE)
    # ═══════════════════════════════════════════════════════════
    print("\n=== Step 3: DuckDuckGo Recruiter Discovery ===")
    ddgs_results = run_ddgs_queries(num_queries=5)
    all_recruiters.extend(ddgs_results)
    stats["ddgs_found"] = len(ddgs_results)

    # ═══════════════════════════════════════════════════════════
    # STEP 4: Dedup by linkedin_url within this batch
    # ═══════════════════════════════════════════════════════════
    seen_urls: set[str] = set()
    unique_recruiters: list[Recruiter] = []
    for rec in all_recruiters:
        url_key = rec.linkedin_url.lower().rstrip("/")
        if url_key not in seen_urls:
            seen_urls.add(url_key)
            unique_recruiters.append(rec)

    print(f"\n=== Step 4: Processing {len(unique_recruiters)} unique profiles (from {len(all_recruiters)} raw) ===")

    # ═══════════════════════════════════════════════════════════
    # STEP 5: Insert into permanent recruiters table + display table
    # ═══════════════════════════════════════════════════════════
    inserted_recruiters: list[Recruiter] = []

    for rec in unique_recruiters:
        # Check permanent dedup table
        if insert_recruiter(client, rec):
            # Also insert into display table
            try:
                client.table("recruiter_leads").insert({
                    "name": rec.name,
                    "linkedin_url": rec.linkedin_url,
                    "company": rec.company,
                    "headline": rec.headline,
                    "location": rec.location,
                    "category": rec.category,
                }).execute()
                inserted_recruiters.append(rec)
                stats["inserted"] += 1
                print(f"  [✓] {rec.name} at {rec.company} ({rec.category}) — {rec.location}")
            except Exception as exc:
                stats["errors"].append(f"Lead insert error for {rec.name}: {exc}")
        else:
            stats["skipped_dup"] += 1

    # ═══════════════════════════════════════════════════════════
    # STEP 6: Get all-time count for reporting
    # ═══════════════════════════════════════════════════════════
    total_alltime = 0
    try:
        count_result = client.table("recruiters").select("id", count="exact").execute()
        total_alltime = count_result.count or 0
    except Exception:
        pass

    # ═══════════════════════════════════════════════════════════
    # STEP 7: Log & Notification
    # ═══════════════════════════════════════════════════════════
    status = "success" if not stats["errors"] else "partial_success"

    print(f"\n{'='*55}")
    print(f"  SerpAPI found:    {stats['serpapi_found']}")
    print(f"  DuckDuckGo found: {stats['ddgs_found']}")
    print(f"  Inserted (new):   {stats['inserted']}")
    print(f"  Skipped (dup):    {stats['skipped_dup']}")
    print(f"  All-time total:   {total_alltime}")
    print(f"  Status:           {status}")
    print(f"{'='*55}")

    log_scraper_run(
        client,
        "network_growth",
        status,
        stats["inserted"],
        "\n".join(stats["errors"]) if stats["errors"] else None,
    )

    # Build Telegram message
    if inserted_recruiters:
        categories = Counter(r.category for r in inserted_recruiters)
        locations = Counter(r.location for r in inserted_recruiters)

        lines = [
            "🔗 Network Growth Engine — Daily Report",
            f"New Profiles: {len(inserted_recruiters)}",
            "",
            "By Category:",
        ]
        category_labels = {
            "ai_ml_recruiter": "AI/ML Recruiter / TA",
            "hiring_manager": "Hiring Manager / Lead",
            "founder": "Founder / CTO",
        }
        for cat, count in categories.most_common():
            label = category_labels.get(cat, cat)
            lines.append(f"├── {label}: {count}")

        lines.extend(["", "By Location:"])
        for loc, count in locations.most_common():
            lines.append(f"├── {loc}: {count}")

        lines.append(f"\n📈 All-time total: {total_alltime}")

        send_telegram_message("\n".join(lines))
    else:
        send_telegram_message(
            f"🔗 Network Growth Engine\nNew Profiles: 0 (all duplicates or no results)\n📈 All-time: {total_alltime}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

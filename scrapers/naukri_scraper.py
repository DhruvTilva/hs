import re
import time
import random
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.score import calculate_priority_score
from scrapers.common import (
    Opportunity,
    find_recent_duplicate,
    get_supabase_client,
    log_scraper_run,
    send_telegram_message,
    send_scraper_completion_notification,
)

try:
    from ddgs import DDGS
except ImportError:
    print("Please install ddgs: pip install ddgs")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────
# PART 1 — KEYWORDS & LOCATIONS
# ─────────────────────────────────────────────────────────────

PRIMARY_KEYWORDS: list[str] = [
    # Core AI/ML
    "artificial intelligence engineer", "machine learning engineer", "AI engineer", "ML engineer",
    "deep learning engineer", "AI developer", "ML developer",
    # Data Science
    "data scientist", "senior data scientist", "lead data scientist", "data science engineer", "applied scientist",
    # GenAI / LLM
    "generative AI engineer", "GenAI engineer", "LLM engineer", "large language model engineer",
    "prompt engineer", "AI product engineer", "foundation model engineer",
    # Specializations
    "NLP engineer", "natural language processing engineer", "computer vision engineer", "CV engineer",
    "MLOps engineer", "ML platform engineer", "AI infrastructure engineer", "model deployment engineer",
    # Research
    "AI researcher", "ML researcher", "research scientist AI", "research engineer AI",
    "AI research associate", "AI research analyst",
    # Applied/Consulting
    "applied AI engineer", "applied machine learning engineer", "AI consultant", "ML consultant",
    "AI solutions architect", "AI architect",
    # Data Engineering (AI focused)
    "data engineer AI", "AI data engineer", "feature engineering", "ML data engineer",
    # Broader catch-all
    "machine learning", "artificial intelligence", "deep learning", "neural network engineer",
    "reinforcement learning engineer", "MLflow engineer", "PyTorch engineer", "TensorFlow engineer",
    "Hugging Face engineer", "LangChain engineer", "RAG engineer", "vector database engineer",
]

LOCATIONS_PRIMARY: list[str] = [
    "Ahmedabad", "Gandhinagar", "GIFT City", "Giftcity-Ahmedabad", "Giftcity-gandhinagar", "Gujarat",
]

LOCATIONS_SECONDARY: list[str] = [
    "India", "Work from home",
]

# ─────────────────────────────────────────────────────────────
# PART 2 — DEDUP & SCORING HELPERS
# ─────────────────────────────────────────────────────────────

_SUFFIX_RE = re.compile(r"\b(pvt\.?|ltd\.?|private|limited|inc\.?|corp\.?|llp\.?)\b", re.IGNORECASE)

def clean_company(name: str) -> str:
    return _SUFFIX_RE.sub("", name.lower()).strip()

def find_cross_source_duplicate(client: Any, company_name: str, role_title: str, days: int = 7) -> list[str]:
    if client is None:
        return []
    import datetime as dt
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).isoformat()
    try:
        result = client.table("opportunities").select("source").eq("company_name", company_name).eq("role_title", role_title).gte("found_at", cutoff).execute()
        return [row["source"] for row in (result.data or []) if row.get("source")]
    except Exception:
        return []

def insert_with_dedup(client: Any, opp: Opportunity, *, stats: dict[str, Any]) -> bool:
    if client is None:
        stats["inserted"] += 1
        return True
    
    exact = find_recent_duplicate(client, opp, days=7, source_scoped=True)
    if exact:
        stats["skipped_dup"] += 1
        return False

    other_sources = find_cross_source_duplicate(client, opp.company_name, opp.role_title or "", days=7)
    if other_sources:
        rd = dict(opp.raw_data or {})
        rd["also_found_on"] = other_sources
        opp = Opportunity(**{**asdict(opp), "raw_data": rd})

    try:
        client.table("opportunities").insert(asdict(opp)).execute()
        stats["inserted"] += 1
        stats["inserted_opps"].append(opp)
        return True
    except Exception as exc:
        stats["errors"].append(f"insert error for {opp.company_name}: {exc}")
        return False

# ─────────────────────────────────────────────────────────────
# PART 3 — DDG SCRAPER CORE
# ─────────────────────────────────────────────────────────────

def parse_naukri_url(url: str, default_title: str, default_location: str) -> dict[str, Any]:
    """Parse URL like job-listings-data-scientist-adani-group-ahmedabad-3-to-5-years-12345678"""
    m = re.search(r'job-listings-(.*?)-(\d+-to-\d+-years)-(\d+)$', url)
    if m:
        prefix = m.group(1).replace("-", " ")
        experience = m.group(2).replace("-", " ")
        job_id = m.group(3)
        # very rough split
        words = prefix.split()
        title = " ".join(words[:3]).title() if len(words) > 3 else default_title
        company = " ".join(words[3:]).title() if len(words) > 3 else "Unknown"
        return {
            "title": title,
            "company_name": company,
            "job_location": default_location,
            "experience": experience,
            "job_id": job_id,
        }
    return {
        "title": default_title.title(),
        "company_name": "Unknown",
        "job_location": default_location,
        "experience": "Not specified",
        "job_id": "unknown-" + str(random.randint(1000,9999)),
    }

def run_query(keyword: str, location: str, stats: dict[str, Any], client: Any, company_tiers: dict[str, Any]) -> None:
    # Use ddgs to search Naukri site
    query = f'site:naukri.com/job-listings "{keyword}" {location}'
    stats["total_requests"] += 1
    
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=15))
    except Exception as e:
        print(f"  [X]  DDG Search Failed for {keyword} / {location}: {e}")
        stats["errors"].append(f"DDG Error: {e}")
        return

    if not results:
        print(f"  [OK] {keyword!r} / {location!r} → 0 found")
        return

    stats["total_jobs_found"] += len(results)
    inserted_this_query = 0

    for r in results:
        url = r.get("href", "")
        if "job-listings" not in url:
            continue
            
        parsed = parse_naukri_url(url, keyword, location)
        
        # Scoring
        company_tier = company_tiers.get(clean_company(parsed["company_name"]))
        # DDG results are not necessarily "fresh", so we assume 24 hours
        hours_old = 24.0
        
        base_score = calculate_priority_score(
            "normal", hours_old, parsed["title"], parsed["job_location"], company_tier,
        )
        
        # Give a slight bonus because DDG found it via keyword match
        final_score = min(base_score + 5, 100)

        raw_data = {
            "keyword": keyword,
            "search_location": location,
            "experience": parsed["experience"],
            "job_id": parsed["job_id"],
            "description": r.get("body", "")[:500],
            "hours_old": hours_old,
            "is_fresh": False,
            "source_method": "ddgs",
        }

        opp = Opportunity(
            company_name=parsed["company_name"],
            role_title=parsed["title"],
            location=parsed["job_location"],
            source="naukri",
            signal_type="normal",
            apply_url=url,
            priority_score=final_score,
            freshness_score=25,
            raw_data=raw_data,
        )

        if insert_with_dedup(client, opp, stats=stats):
            inserted_this_query += 1

    print(f"  [OK] {keyword!r} / {location!r} → {len(results)} found, {inserted_this_query} inserted")

# ─────────────────────────────────────────────────────────────
# PART 4 — MAIN STRATEGY
# ─────────────────────────────────────────────────────────────

def main() -> int:
    client = get_supabase_client()
    if client is None:
        log_scraper_run(client, "naukri_scraper", "dry_run", 0, None)
        return 0

    company_tiers = {}
    try:
        rows = client.table("companies").select("name, tier").execute().data or []
        company_tiers = {clean_company(str(r["name"])): r.get("tier") for r in rows if r.get("name")}
    except Exception as exc:
        print(f"Warning: could not load company tiers: {exc}")

    stats = {
        "total_requests": 0,
        "total_jobs_found": 0,
        "inserted": 0,
        "skipped_dup": 0,
        "blocked_count": 0,
        "errors": [],
        "inserted_opps": [],
    }

    print("\n=== PASS 1: Primary keywords × Gujarat locations ===")
    for keyword in PRIMARY_KEYWORDS[:20]:
        for location in LOCATIONS_PRIMARY:
            run_query(keyword, location, stats, client, company_tiers)
            time.sleep(random.uniform(2.0, 4.0))

    print("\n=== PASS 2: Remote/WFH roles ===")
    for keyword in PRIMARY_KEYWORDS[:15]:
        for location in LOCATIONS_SECONDARY:
            run_query(keyword, location, stats, client, company_tiers)
            time.sleep(random.uniform(2.0, 4.0))

    print("\n=== PASS 3: Remaining keywords × Ahmedabad ===")
    for keyword in PRIMARY_KEYWORDS[20:]:
        run_query(keyword, "Ahmedabad", stats, client, company_tiers)
        time.sleep(random.uniform(1.5, 3.5))

    status = "success" if not stats["errors"] else "partial_success"

    print(f"\n{'='*55}")
    print(f"  Requests:    {stats['total_requests']}")
    print(f"  Jobs found:  {stats['total_jobs_found']}")
    print(f"  Inserted:    {stats['inserted']}")
    print(f"  Dup skipped: {stats['skipped_dup']}")
    print(f"  Status:      {status}")
    print(f"{'='*55}")

    try:
        client.table("scraper_logs").insert({
            "source": "naukri_scraper",
            "status": status,
            "new_found": stats["inserted"],
            "errors": "\n".join(stats["errors"]) if stats["errors"] else None,
        }).execute()
    except Exception:
        pass

    send_scraper_completion_notification("Naukri Scraper (DDG)", stats["inserted_opps"])
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

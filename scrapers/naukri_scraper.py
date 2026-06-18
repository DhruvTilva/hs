import re
import time
import random
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any
import sys
import requests
import re
from pathlib import Path
from datetime import datetime, timedelta, timezone

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
    from duckduckgo_search import DDGS
except ImportError:
    print("Please install duckduckgo-search: pip install duckduckgo-search")
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

HARD_REJECT_ROLES: list[str] = [
    "voice process", "international voice", "customer support", "process associate", 
    "call center", "telecaller", "sales", "marketing", "business development", 
    "hr recruiter", "accountant", "manual tester", "automation qa", "qa engineer",
    "frontend developer", "backend developer", "full stack developer", "java developer", 
    "php developer", ".net developer", "android developer", "react developer", 
    "system administrator", "network engineer", "test engineer"
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

KNOWN_CITIES = {
    "ahmedabad", "gandhinagar", "bengaluru", "bangalore", "noida", 
    "gurugram", "gurgaon", "delhi", "new delhi", "pune", "mumbai", 
    "hyderabad", "chennai", "kolkata", "hosur", "india", "remote",
    "vadodara", "surat", "rajkot", "gujarat", "kochi", "cochin",
    "trivandrum", "thiruvananthapuram", "indore", "bhopal",
    "chandigarh", "mohali", "jaipur", "lucknow", "kanpur",
    "nagpur", "coimbatore", "mysore", "bhubaneswar", "patna",
    "gift city"
}

def parse_naukri_url(url: str, default_title: str, default_location: str, ddg_title: str) -> dict[str, Any]:
    """Parse URL like job-listings-data-scientist-adani-group-ahmedabad-3-to-5-years-12345678"""
    m = re.search(r'job-listings-(.*?)-(\d+-to-\d+-years)-(\d+)$', url)
    if not m:
        return {
            "title": default_title.title(),
            "company_name": "Unknown",
            "job_location": default_location,
            "experience": "Not specified",
            "job_id": "unknown-" + str(random.randint(1000,9999)),
        }

    prefix = m.group(1).replace("-", " ")
    experience = m.group(2).replace("-", " ")
    job_id = m.group(3)
    
    words = prefix.split()
    
    # Extract trailing known cities as location
    location_words = []
    while words:
        if len(words) >= 2 and f"{words[-2]} {words[-1]}".lower() in KNOWN_CITIES:
            location_words.insert(0, words.pop())
            location_words.insert(0, words.pop())
        elif words[-1].lower() in KNOWN_CITIES:
            location_words.insert(0, words.pop())
        else:
            break
            
    job_location = " ".join(location_words).title() if location_words else default_location

    # Extract title
    title = default_title.title()
    if ddg_title and "Link to naukri" not in ddg_title and "naukri.com/job-listings" not in ddg_title:
        title = ddg_title.split(" - ")[0].split(" | ")[0].strip()
        
    # Extract company name by removing the default title words from the start
    keyword_words = set(default_title.lower().split())
    idx = 0
    while idx < len(words) and words[idx].lower() in keyword_words:
        idx += 1
        
    if idx > 0 and idx < len(words):
        company = " ".join(words[idx:]).title()
    else:
        # Fallback
        company = " ".join(words[3:]).title() if len(words) > 3 else "Unknown"

    if not company or company.lower() in ["unknown", "n/a", "null"]:
        company = "Unknown"

    return {
        "title": title,
        "company_name": company,
        "job_location": job_location,
        "experience": experience,
        "job_id": job_id,
    }

def validate_naukri_url(url: str) -> bool:
    """
    Validates if the Naukri job URL is actually active.
    Returns False if it's expired (redirects to search with expJD=true).
    Returns True if it's active or if Akamai Bot Manager blocks the validation.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }
    try:
        r = requests.get(url, headers=headers, allow_redirects=False, timeout=10)
        # If redirected and it has expJD=true, it is definitely expired
        if r.status_code in (301, 302):
            location = r.headers.get("Location", "")
            if "expJD=true" in location:
                return False
        
        # If the page loads successfully, double check text for expiration message
        elif r.status_code == 200:
            text = r.text.lower()
            if "job you are looking for is expired" in text or "no longer available" in text:
                return False
        
        # We accept 403/406 because those are Akamai Datacenter IP blocks on GitHub Actions.
        # We cannot safely validate them, so we assume they might be active to avoid false negatives.
        return True
    except Exception as e:
        print(f"    [WARN] Validation request failed for {url}: {e}")
        return True

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
        print(f"  [OK] {keyword!r} / {location!r} -> 0 found")
        return

    stats["total_jobs_found"] += len(results)
    inserted_this_query = 0

    for r in results:
        url = r.get("href", "")
        if "job-listings" not in url:
            continue
            
        ddg_title = r.get("title", "")
        parsed = parse_naukri_url(url, keyword, location, ddg_title)
        
        c_name = parsed["company_name"].strip()
        r_title = parsed["title"].strip()
        
        # Validation rules
        if not c_name or c_name.lower() in ["unknown", "n/a", "null"]:
            stats["errors"].append(f"Skipping opportunity: company name not found for {url}")
            continue
            
        if not r_title:
            stats["errors"].append(f"Skipping opportunity: role is empty for {url}")
            continue
            
        c_words = c_name.lower().split()
        if all(w in KNOWN_CITIES for w in c_words) and len(c_words) > 0:
            stats["errors"].append(f"Skipping opportunity: company name contains only city names ({c_name}) for {url}")
            continue

        # Strict AI/ML Rejection Rules
        r_title_lower = r_title.lower()
        if any(rej in r_title_lower for rej in HARD_REJECT_ROLES):
            stats["errors"].append(f"[REJECT] Role: '{r_title}' | Hit hard-reject list for {url}")
            continue
            
        desc_lower = r.get("body", "").lower()
        
        has_primary_kw = any(kw.lower() in r_title_lower for kw in PRIMARY_KEYWORDS)
        has_strong_desc = any(kw.lower() in desc_lower for kw in ["machine learning", "artificial intelligence", "deep learning", "nlp", "llm", "genai", "computer vision", "data science"])
        
        if not has_primary_kw and not has_strong_desc:
            stats["errors"].append(f"[REJECT] Role: '{r_title}' | No AI/ML keywords found in title or description for {url}")
            continue

        if not validate_naukri_url(url):
            stats["errors"].append(f"Skipping opportunity: job is expired ({url})")
            continue
            
        print(f"  [OK] Valid AI/ML Role found: '{r_title}' at {c_name}")
        
        # Scoring
        company_tier = company_tiers.get(clean_company(c_name))
        
        # Extract posted date from DuckDuckGo snippet if available
        hours_old = 24.0
        job_posted_at = None
        match = re.search(r'(\d+)\+?\s*(day|hour|week|month)s?\s*ago', desc_lower, re.IGNORECASE)
        if match:
            val = int(match.group(1))
            unit = match.group(2).lower()
            if unit == "hour":
                hours_old = float(val)
            elif unit == "day":
                hours_old = float(val * 24)
            elif unit == "week":
                hours_old = float(val * 24 * 7)
            elif unit == "month":
                hours_old = float(val * 24 * 30)
            
            job_posted_at = (datetime.now(timezone.utc) - timedelta(hours=hours_old)).isoformat()
        
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
            "job_posted_at": job_posted_at,
            "is_fresh": False,
            "source_method": "ddgs",
            "original_job_url": url,
            "source_url": url,
        }

        opp = Opportunity(
            company_name=c_name,
            role_title=r_title,
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

    print(f"  [OK] {keyword!r} / {location!r} -> {len(results)} found, {inserted_this_query} inserted")

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

    import os
    is_test = os.getenv("TEST_MODE", "false").lower() == "true"
    
    if is_test:
        print("Running in TEST_MODE (limited queries)")
        kw_limit1, loc_limit1 = 2, 1
        kw_limit2, loc_limit2 = 1, 1
        kw_limit3 = 1
    else:
        kw_limit1, loc_limit1 = 20, None
        kw_limit2, loc_limit2 = 15, None
        kw_limit3 = None

    print("\n=== PASS 1: Primary keywords × Gujarat locations ===")
    for keyword in PRIMARY_KEYWORDS[:kw_limit1]:
        for location in LOCATIONS_PRIMARY[:loc_limit1]:
            run_query(keyword, location, stats, client, company_tiers)
            time.sleep(random.uniform(2.0, 4.0))

    print("\n=== PASS 2: Remote/WFH roles ===")
    for keyword in PRIMARY_KEYWORDS[:kw_limit2]:
        for location in LOCATIONS_SECONDARY[:loc_limit2]:
            run_query(keyword, location, stats, client, company_tiers)
            time.sleep(random.uniform(2.0, 4.0))

    print("\n=== PASS 3: Remaining keywords × Ahmedabad ===")
    for keyword in PRIMARY_KEYWORDS[20:20+kw_limit3] if kw_limit3 else PRIMARY_KEYWORDS[20:]:
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

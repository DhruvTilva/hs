"""
LinkedIn Job Scraper — Multi-Method Intelligence System

Combines 3 free methods for maximum coverage and quality:
1. RSS Feed Parser — bulk fresh jobs (primary)
2. SerpAPI Queries — recruiter discovery + targeted jobs (secondary)
3. Public Page Scraper — detailed enrichment (fallback)

All methods respect time filters, AI/ML keywords, and location targeting.
"""

import re
import sys
import time
import random
import xml.etree.ElementTree as ET
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.score import calculate_priority_score
from scrapers.common import (
    Opportunity,
    Recruiter,
    find_recent_duplicate,
    get_supabase_client,
    insert_recruiter,
    log_scraper_run,
    send_telegram_message,
    send_scraper_completion_notification,
)

# ─────────────────────────────────────────────────────────────
# PART 1 — KEYWORDS, LOCATIONS & FILTERS
# ─────────────────────────────────────────────────────────────

PRIMARY_KEYWORDS = [
    "artificial intelligence engineer", "machine learning engineer", "AI engineer", "ML engineer",
    "deep learning engineer", "AI developer", "ML developer",
    "data scientist", "senior data scientist", "lead data scientist",
    "generative AI engineer", "GenAI engineer", "LLM engineer", "large language model engineer",
    "prompt engineer", "AI product engineer", "foundation model engineer",
    "NLP engineer", "natural language processing engineer", "computer vision engineer", "CV engineer",
    "MLOps engineer", "ML platform engineer", "AI infrastructure engineer",
    "AI researcher", "ML researcher", "research scientist AI",
    "applied AI engineer", "applied machine learning engineer",
]

LOCATIONS = [
    "Ahmedabad", "Gandhinagar", "GIFT City", "Gujarat",
]

HARD_REJECT_ROLES = [
    "voice process", "international voice", "customer support", "process associate",
    "call center", "telecaller", "sales", "marketing", "business development",
    "hr recruiter", "accountant", "manual tester", "automation qa", "qa engineer",
    "frontend developer", "backend developer", "full stack developer", "java developer",
    "php developer", ".net developer", "android developer", "react developer",
    "system administrator", "network engineer", "test engineer"
]

# SerpAPI query pool (rotated to stay within free tier)
SERPAPI_QUERY_POOL = [
    # Job posts
    'site:linkedin.com/jobs "AI engineer" Ahmedabad',
    'site:linkedin.com/jobs "ML engineer" Gandhinagar',
    'site:linkedin.com/jobs ("LLM" OR "GenAI") Gujarat',
    'site:linkedin.com/jobs "data scientist" "GIFT City"',
    'site:linkedin.com/jobs "NLP engineer" Ahmedabad',
    'site:linkedin.com/jobs "computer vision" Gujarat',
    'site:linkedin.com/jobs "MLOps" Ahmedabad',
    'site:linkedin.com/jobs ("deep learning" OR "machine learning") Gandhinagar',
    # Recruiter profiles
    'site:linkedin.com/in/ ("hiring" OR "we are hiring") "AI" "Ahmedabad"',
    'site:linkedin.com/in/ ("LLM" OR "GenAI") "GIFT City"',
    'site:linkedin.com/in/ "talent acquisition" ("AI" OR "ML") "Gujarat"',
    # Company signals
    'site:linkedin.com/posts "we are hiring" "AI" "Ahmedabad"',
    'site:linkedin.com/posts "join our team" ("LLM" OR "machine learning") Gujarat',
]

KNOWN_CITIES = {
    "ahmedabad", "gandhinagar", "bengaluru", "bangalore", "noida",
    "gurugram", "gurgaon", "delhi", "new delhi", "pune", "mumbai",
    "hyderabad", "chennai", "kolkata", "vadodara", "surat", "rajkot",
    "gujarat", "gift city", "remote", "india"
}

_SUFFIX_RE = re.compile(r"\b(pvt\.?|ltd\.?|private|limited|inc\.?|corp\.?|llp\.?)\b", re.IGNORECASE)

def clean_company(name: str) -> str:
    return _SUFFIX_RE.sub("", name.lower()).strip()

# ─────────────────────────────────────────────────────────────
# PART 2 — RSS FEED PARSER (PRIMARY METHOD)
# ─────────────────────────────────────────────────────────────

def build_rss_url(keyword: str, location: str) -> str:
    """Build LinkedIn RSS feed URL with 24-hour filter."""
    # f_TPR=r86400 means "last 24 hours"
    base = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
    params = {
        "keywords": keyword,
        "location": location,
        "f_TPR": "r259200",  # Last 3 days (72 hours)
        "start": 0
    }
    query = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{base}?{query}"

def parse_rss_feed(url: str, keyword: str, location: str, stats: dict) -> list[dict]:
    """Parse LinkedIn RSS/API response and extract job data."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        stats["errors"].append(f"RSS fetch failed for {keyword}/{location}: {e}")
        return []
    
    soup = BeautifulSoup(resp.text, "html.parser")
    job_cards = soup.find_all("li")
    
    jobs = []
    for card in job_cards:
        try:
            # Extract title
            title_tag = card.find("h3", class_="base-search-card__title")
            if not title_tag:
                continue
            title = title_tag.get_text(strip=True)
            
            # Extract company
            company_tag = card.find("h4", class_="base-search-card__subtitle")
            company = company_tag.get_text(strip=True) if company_tag else "Unknown"
            
            # Extract location
            loc_tag = card.find("span", class_="job-search-card__location")
            job_location = loc_tag.get_text(strip=True) if loc_tag else location
            
            # Extract URL
            link_tag = card.find("a", class_="base-card__full-link")
            job_url = link_tag["href"] if link_tag and link_tag.get("href") else None
            if not job_url:
                continue
            
            # Extract posted date
            time_tag = card.find("time")
            posted_date = time_tag["datetime"] if time_tag and time_tag.get("datetime") else None
            
            jobs.append({
                "title": title,
                "company": company,
                "location": job_location,
                "url": job_url,
                "posted_date": posted_date,
                "keyword": keyword,
                "search_location": location,
            })
        except Exception as e:
            continue
    
    return jobs

# ─────────────────────────────────────────────────────────────
# PART 3 — SERPAPI QUERIES (SECONDARY METHOD)
# ─────────────────────────────────────────────────────────────

def run_serpapi_query(query: str, serpapi_key: str, stats: dict) -> dict[str, list]:
    """Run a single SerpAPI query with time filter."""
    try:
        payload = requests.get(
            "https://serpapi.com/search.json",
            params={
                "engine": "google",
                "q": query,
                "api_key": serpapi_key,
                "num": 10,
                "tbs": "qdr:w",  # Last week (we'll filter to 3 days manually)
            },
            timeout=30,
        ).json()
        
        results = payload.get("organic_results", [])
        
        jobs = []
        recruiters = []
        for result in results:
            title = str(result.get("title", "")).strip()
            link = str(result.get("link", "")).strip()
            snippet = str(result.get("snippet", "")).strip()
            
            if not title or not link:
                continue
                
            if "/in/" in link:
                name = title.split(" - ")[0]
                company = None
                if " at " in title:
                    company = title.split(" at ")[-1].split(" - ")[0].strip()
                elif " | " in title:
                    company = title.split(" | ")[-1].strip()
                
                recruiters.append(Recruiter(
                    name=name,
                    linkedin_url=link,
                    company=company,
                    location="Gujarat",  # Default inferred
                    notes=f"Found via query: {query}\nSnippet: {snippet}"
                ))
            else:
                # Infer company from title
                company = title.split(" - ")[0] if " - " in title else title.split(" | ")[0]
                
                # Infer location from snippet/title
                searchable = f"{title} {snippet}".lower()
                location = "Gujarat"
                for loc in ["gift city", "gandhinagar", "ahmedabad", "gujarat", "remote"]:
                    if loc in searchable:
                        location = loc.title()
                        break
                
                jobs.append({
                    "title": title,
                    "company": company[:120],
                    "location": location,
                    "url": link,
                    "snippet": snippet[:500],
                    "query": query,
                    "source_method": "serpapi",
                })
        
        return {"jobs": jobs, "recruiters": recruiters}
    except Exception as e:
        stats["errors"].append(f"SerpAPI query failed ({query}): {e}")
        return {"jobs": [], "recruiters": []}

# ─────────────────────────────────────────────────────────────
# PART 4 — PUBLIC PAGE SCRAPER (FALLBACK METHOD)
# ─────────────────────────────────────────────────────────────

def scrape_linkedin_public_page(keyword: str, location: str, stats: dict) -> list[dict]:
    """Scrape LinkedIn public job search page."""
    url = f"https://www.linkedin.com/jobs/search/?keywords={requests.utils.quote(keyword)}&location={requests.utils.quote(location)}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        stats["errors"].append(f"Public page scrape failed for {keyword}/{location}: {e}")
        return []
    
    soup = BeautifulSoup(resp.text, "html.parser")
    job_cards = soup.find_all("div", class_="base-card")
    
    jobs = []
    for card in job_cards[:20]:  # Limit to top 20
        try:
            title_tag = card.find("h3")
            title = title_tag.get_text(strip=True) if title_tag else None
            if not title:
                continue
            
            company_tag = card.find("h4")
            company = company_tag.get_text(strip=True) if company_tag else "Unknown"
            
            loc_tag = card.find("span", class_="job-search-card__location")
            job_location = loc_tag.get_text(strip=True) if loc_tag else location
            
            link_tag = card.find("a")
            job_url = link_tag["href"] if link_tag and link_tag.get("href") else None
            if not job_url:
                continue
            
            jobs.append({
                "title": title,
                "company": company,
                "location": job_location,
                "url": job_url,
                "keyword": keyword,
                "source_method": "public_scraper",
            })
        except Exception:
            continue
    
    return jobs

# ─────────────────────────────────────────────────────────────
# PART 5 — VALIDATION & SCORING
# ─────────────────────────────────────────────────────────────

def validate_job(job: dict, stats: dict) -> bool:
    """Apply quality filters to job data."""
    title = job.get("title", "").strip()
    company = job.get("company", "").strip()
    
    # Basic validation
    if not title or not company:
        stats["errors"].append(f"Skipping: missing title or company")
        return False
    
    if company.lower() in ["unknown", "n/a", "null"]:
        stats["errors"].append(f"Skipping: invalid company name ({company})")
        return False
    
    # Check if company name is just city names
    c_words = company.lower().split()
    if all(w in KNOWN_CITIES for w in c_words) and len(c_words) > 0:
        stats["errors"].append(f"Skipping: company is city name ({company})")
        return False
    
    # Strict Location Filter
    location_lower = job.get("location", "").lower()
    allowed_locations = ["ahmedabad", "gandhinagar", "gift city", "gujarat"]
    if not any(loc in location_lower for loc in allowed_locations):
        stats["errors"].append(f"[REJECT] Location not allowed: {job.get('location')}")
        return False
    
    # Hard reject list
    title_lower = title.lower()
    if any(reject in title_lower for reject in HARD_REJECT_ROLES):
        stats["errors"].append(f"[REJECT] Hard reject hit: {title}")
        return False
    
    # AI/ML keyword validation
    has_ai_keyword = any(kw.lower() in title_lower for kw in PRIMARY_KEYWORDS)
    snippet = job.get("snippet", "").lower()
    has_desc_signal = any(kw in snippet for kw in ["machine learning", "artificial intelligence", "deep learning", "nlp", "llm", "genai", "computer vision", "data science"])
    
    if not has_ai_keyword and not has_desc_signal:
        stats["errors"].append(f"[REJECT] No AI/ML keywords: {title}")
        return False
    
    return True

def calculate_hours_old(posted_date: str | None) -> float:
    """Calculate hours since posting."""
    if not posted_date:
        return 24.0  # Default assumption
    
    try:
        dt = datetime.fromisoformat(posted_date.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        hours = (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0
        return max(hours, 0.0)
    except Exception:
        return 24.0

def insert_with_dedup(client: Any, opp: Opportunity, stats: dict) -> bool:
    """Insert opportunity with deduplication."""
    if client is None:
        stats["inserted"] += 1
        return True
    
    # Check for exact duplicate
    exact = find_recent_duplicate(client, opp, days=7, source_scoped=True)
    if exact:
        stats["skipped_dup"] += 1
        return False
    
    try:
        client.table("opportunities").insert(asdict(opp)).execute()
        stats["inserted"] += 1
        stats["inserted_opps"].append(opp)
        return True
    except Exception as exc:
        stats["errors"].append(f"Insert error for {opp.company_name}: {exc}")
        return False

# ─────────────────────────────────────────────────────────────
# PART 6 — MAIN EXECUTION
# ─────────────────────────────────────────────────────────────

def main() -> int:
    client = get_supabase_client()
    if client is None:
        log_scraper_run(client, "linkedin_scraper", "dry_run", 0, None)
        return 0
    
    # Load company tiers for scoring
    company_tiers = {}
    try:
        rows = client.table("companies").select("name, tier").execute().data or []
        company_tiers = {clean_company(str(r["name"])): r.get("tier") for r in rows if r.get("name")}
    except Exception as exc:
        print(f"Warning: could not load company tiers: {exc}")
    
    stats = {
        "total_jobs_found": 0,
        "inserted": 0,
        "skipped_dup": 0,
        "errors": [],
        "inserted_opps": [],
    }
    
    all_jobs = []
    all_recruiters = []
    
    # ═══════════════════════════════════════════════════════════
    # PHASE 1: RSS FEED PARSER (Primary — Fast & Free)
    # ═══════════════════════════════════════════════════════════
    print("\n=== PHASE 1: LinkedIn RSS Feed Parser ===")
    
    # Use subset of keywords for RSS to avoid overwhelming
    rss_keywords = PRIMARY_KEYWORDS[:8]  # Top 8 keywords
    
    for keyword in rss_keywords:
        for location in LOCATIONS:
            rss_url = build_rss_url(keyword, location)
            jobs = parse_rss_feed(rss_url, keyword, location, stats)
            all_jobs.extend(jobs)
            print(f"  [RSS] {keyword} × {location} → {len(jobs)} jobs")
            time.sleep(random.uniform(1.5, 3.0))  # Be polite
    
    # ═══════════════════════════════════════════════════════════
    # PHASE 2: SerpAPI Queries (Secondary — Strategic)
    # ═══════════════════════════════════════════════════════════
    serpapi_key = os.getenv("SERPAPI_KEY")
    
    if serpapi_key:
        print("\n=== PHASE 2: SerpAPI LinkedIn Queries ===")
        
        # Rotate 2 random queries to stay within free tier
        import os
        selected_queries = random.sample(SERPAPI_QUERY_POOL, min(2, len(SERPAPI_QUERY_POOL)))
        
        for query in selected_queries:
            results = run_serpapi_query(query, serpapi_key, stats)
            all_jobs.extend(results["jobs"])
            all_recruiters.extend(results["recruiters"])
            print(f"  [SerpAPI] {query} → {len(results['jobs'])} jobs, {len(results['recruiters'])} recruiters")
            time.sleep(2)
            
        for recruiter in all_recruiters:
            if insert_recruiter(client, recruiter):
                print(f"  [✓] Inserted Recruiter: {recruiter.name} at {recruiter.company}")
    else:
        print("\n[SKIP] SerpAPI key not found, skipping Phase 2")
    
    # ═══════════════════════════════════════════════════════════
    # PHASE 3: Validate, Score, and Insert
    # ═══════════════════════════════════════════════════════════
    print(f"\n=== PHASE 3: Processing {len(all_jobs)} Jobs ===")
    
    stats["total_jobs_found"] = len(all_jobs)
    
    for job in all_jobs:
        if not validate_job(job, stats):
            continue
        
        # Calculate freshness
        hours_old = calculate_hours_old(job.get("posted_date"))
        
        # Skip if too old (>72 hours = 3 days). Opportunity grabbers!
        if hours_old > 72:
            stats["errors"].append(f"Skipping old job: {job['title']} ({hours_old:.0f}h old)")
            continue
        
        # Score the opportunity
        company_tier = company_tiers.get(clean_company(job["company"]))
        has_recruiter = any(r.company and r.company.lower() in job["company"].lower() for r in all_recruiters)

        base_score = calculate_priority_score(
            signal_type="normal",
            hours_old=hours_old,
            role_title=job["title"],
            location=job["location"],
            company_tier=company_tier,
            source="linkedin",
            has_recruiter_profile=has_recruiter,
        )
        
        # LLM bonus: +5 if GenAI/LLM role (hot market)
        title_lower = job["title"].lower()
        llm_bonus = 5 if any(kw in title_lower for kw in ["llm", "genai", "generative ai", "gpt", "foundation model"]) else 0
        final_score = min(base_score + llm_bonus, 100)
        
        # Build opportunity
        opp = Opportunity(
            company_name=job["company"],
            role_title=job["title"],
            location=job["location"],
            source="linkedin",
            signal_type="normal",
            apply_url=job["url"],
            priority_score=final_score,
            freshness_score=35 if hours_old <= 6 else (25 if hours_old <= 24 else 15),
            raw_data={
                "keyword": job.get("keyword"),
                "search_location": job.get("search_location"),
                "posted_date": job.get("posted_date"),
                "hours_old": hours_old,
                "source_method": job.get("source_method", "rss"),
                "snippet": job.get("snippet", "")[:500],
                "llm_role": llm_bonus > 0,
            },
        )
        
        if insert_with_dedup(client, opp, stats):
            print(f"  [✓] Inserted: {job['title']} at {job['company']} (score: {final_score})")
    
    # ═══════════════════════════════════════════════════════════
    # PHASE 4: Logging & Notifications
    # ═══════════════════════════════════════════════════════════
    status = "success" if not stats["errors"] else "partial_success"
    
    print(f"\n{'='*55}")
    print(f"  Jobs found:  {stats['total_jobs_found']}")
    print(f"  Inserted:    {stats['inserted']}")
    print(f"  Dup skipped: {stats['skipped_dup']}")
    print(f"  Status:      {status}")
    print(f"{'='*55}")
    
    try:
        client.table("scraper_logs").insert({
            "source": "linkedin_scraper",
            "status": status,
            "new_found": stats["inserted"],
            "errors": "\n".join(stats["errors"]) if stats["errors"] else None,
        }).execute()
    except Exception:
        pass
    
    send_scraper_completion_notification("LinkedIn Scraper", stats["inserted_opps"])
    return 0

if __name__ == "__main__":
    import os
    raise SystemExit(main())

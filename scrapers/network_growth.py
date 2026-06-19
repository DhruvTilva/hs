import os
import sys
import time
import random
import re
from datetime import datetime, timezone
import requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.common import get_supabase_client, log_scraper_run  # type: ignore

SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")

NETWORK_QUERIES = [
    'site:linkedin.com/in/ "hiring" "AI" OR "Machine Learning" "Ahmedabad"',
    'site:linkedin.com/in/ "Talent Acquisition" "AI" "Gujarat"',
    'site:linkedin.com/in/ "CTO" OR "Founder" "AI startup" "Ahmedabad"',
    'site:linkedin.com/in/ "Engineering Manager" "Machine Learning" "GIFT City"',
    'site:linkedin.com/in/ "HR" "Artificial Intelligence" "Gandhinagar"',
]

def google_search(query: str, num: int = 10) -> list[dict]:
    results = []
    if SERPAPI_KEY:
        try:
            r = requests.get(
                "https://serpapi.com/search",
                params={"q": query, "api_key": SERPAPI_KEY, "num": num, "hl": "en", "gl": "in"},
                timeout=10,
            )
            data = r.json()
            for item in data.get("organic_results", [])[:num]:
                results.append({
                    "title": item.get("title", ""),
                    "snippet": item.get("snippet", ""),
                    "url": item.get("link", ""),
                })
            return results
        except Exception:
            pass
    return results

def determine_category(title: str, snippet: str) -> str:
    combined = (title + " " + snippet).lower()
    if any(k in combined for k in ["founder", "cto", "chief technology"]):
        return "founder"
    if any(k in combined for k in ["manager", "director", "head of engineering"]):
        return "hiring_manager"
    return "ai_ml_recruiter"

def extract_name(title: str) -> str:
    name = re.split(r'\s*[-\|]\s*', title)[0]
    return name.strip()

def extract_company(snippet: str) -> str | None:
    match = re.search(r'at\s+([A-Z][A-Za-z0-9\s]+(?:Technologies|Tech|AI|Solutions|Labs|Pvt|Ltd)?)', snippet)
    if match:
        return match.group(1).strip()
    return None

def main():
    print("[network] Starting network growth discovery...")
    client = get_supabase_client()
    new_found = 0
    errors = []

    # Get companies from watchlist to find their employees
    print("[network] Fetching watchlist companies...")
    watchlist = []
    if client:
        watchlist = client.table("companies").select("name").execute().data or []
    
    company_queries = []
    for c in watchlist:
        company_queries.append(f'site:linkedin.com/in/ "{c["name"]}" "hiring" ("AI" OR "ML" OR "Engineering")')
        
    all_queries = NETWORK_QUERIES + company_queries[:10] # limit to top 10 companies to save quota

    discovered = []
    seen_urls = set()

    for query in all_queries:
        print(f"[network] Searching: {query}")
        try:
            results = google_search(query, num=5)
            for r in results:
                url = r["url"]
                if url in seen_urls or "linkedin.com/in/" not in url:
                    continue
                seen_urls.add(url)
                
                name = extract_name(r["title"])
                if not name or len(name) > 50:
                    continue
                    
                category = determine_category(r["title"], r["snippet"])
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
            errors.append(f"Query {query} failed: {e}")

    print(f"[network] Discovered {len(discovered)} profiles. Saving...")

    for profile in discovered:
        try:
            if client:
                existing = client.table("recruiters").select("id").eq("linkedin_url", profile["linkedin_url"]).execute()
                if existing.data:
                    continue

                client.table("recruiters").insert(profile).execute()
            else:
                print(f"[dry-mode] Found recruiter: {profile['name']} at {profile.get('company')}")
            
            new_found += 1
        except Exception as e:
            errors.append(f"{profile['name']}: {e}")

    log_scraper_run(
        client, "network_growth",
        "success" if not errors else "partial_success", new_found,
        "\n".join(errors) if errors else None,
    )

    print(f"[network] Done. New profiles saved: {new_found}")
    return 0

if __name__ == "__main__":
    main()

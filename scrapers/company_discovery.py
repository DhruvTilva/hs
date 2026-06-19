"""
scrapers/company_discovery.py

Discovers hidden AI/ML companies in Ahmedabad, Gandhinagar & GIFT City
from Google News, Startup India portal, and GIFT City directory.

Run: python scrapers/company_discovery.py
Schedule: Every Sunday 6:30 AM IST via .github/workflows/company_discovery.yml
"""
from __future__ import annotations

import os
import re
import sys
import time
import random
import json
import requests
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.common import get_supabase_client, log_scraper_run  # type: ignore

# ── Constants ─────────────────────────────────────────────────────────────────

SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")

DISCOVERY_QUERIES = [
    "AI startup Ahmedabad 2025 2026",
    "machine learning company Ahmedabad new",
    "artificial intelligence startup Gujarat funding",
    "GIFT City technology company AI",
    "Gandhinagar AI startup opens office",
    "GenAI startup Ahmedabad founded",
    "data science company Ahmedabad new office",
    "ML startup Gujarat seed funding 2026",
    "AI company Gujarat hiring engineers",
    "technology startup Ahmedabad AI ML",
    "deep learning company Ahmedabad",
    "NLP startup Gujarat 2025 2026",
    "computer vision company Ahmedabad",
    "fintech AI startup GIFT City",
    "healthtech AI company Ahmedabad",
]

AI_ML_KEYWORDS = [
    "artificial intelligence", "machine learning", "deep learning", "nlp",
    "natural language", "computer vision", "generative ai", "genai",
    "llm", "data science", "neural network", "ai-powered", "ml model",
]

TECH_FOUNDER_SIGNALS = [
    "engineer", "developer", "iit", "nit", "bits", "google", "microsoft",
    "amazon", "phd", "ml", "ai", "data scientist", "researcher", "cto",
]

LINKEDIN_DISCOVERY_QUERIES = [
    'site:linkedin.com/company "artificial intelligence" "Ahmedabad"',
    'site:linkedin.com/company "machine learning" "Ahmedabad"',
    'site:linkedin.com/company "AI" "Gujarat"',
    'site:linkedin.com/company "data science" "Ahmedabad"',
    'site:linkedin.com/company "GenAI" OR "LLM" "Gujarat"',
    'site:linkedin.com/company "AI" "GIFT City"',
    'site:linkedin.com/company "deep learning" "Ahmedabad"',
    'site:linkedin.com/company "NLP" OR "computer vision" "Gujarat"',
    'site:linkedin.com/company "AI startup" "Ahmedabad" OR "Gandhinagar"',
    'site:linkedin.com/company "ML" "fintech" "GIFT City"',
]

OTHER_DISCOVERY_QUERIES = [
    'site:clutch.co/in/it-services/artificial-intelligence "Ahmedabad"',
    'site:clutch.co/in/it-services/artificial-intelligence "Gandhinagar"',
    'site:indiaai.gov.in/startup "Ahmedabad" OR "Gujarat"',
    'site:nasscom.in/member-directory "Artificial Intelligence" "Gujarat"',
    'site:tracxn.com "Artificial Intelligence Startups in Ahmedabad"',
]

ROTATING_HEADERS = [
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Accept-Language": "en-GB,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
]

COMPANY_NAME_PATTERNS = [
    r"([A-Z][A-Za-z0-9\s]+(?:Technologies|Tech|AI|Labs|Solutions|Systems|Analytics|Data|Robotics|Intelligence|Innovations?|Ventures?|Inc|Pvt|Ltd)?),?\s+(?:an?\s+)?(?:AI|ML|tech|startup|company)",
    r"([A-Z][A-Za-z0-9\s]+(?:Technologies|Tech|AI|Labs|Solutions|Systems|Analytics)?)\s+(?:raises?|raised|secures?|secured|gets?|got)\s+(?:funding|investment|seed|series)",
    r"([A-Z][A-Za-z0-9\s]+(?:Technologies|Tech|AI|Labs|Solutions|Systems|Analytics)?)\s+(?:opens?|opened|launches?|launched)\s+(?:office|center|hub)\s+in\s+(?:Ahmedabad|Gandhinagar|Gujarat|GIFT)",
    r"([A-Z][A-Za-z0-9\s]+(?:Technologies|Tech|AI|Labs|Solutions|Systems|Analytics)?),\s+(?:based|headquartered|located)\s+in\s+(?:Ahmedabad|Gandhinagar|Gujarat|GIFT)",
]

# ── Google Search helpers ──────────────────────────────────────────────────────

def _get_headers() -> dict[str, str]:
    return random.choice(ROTATING_HEADERS)


def google_search(query: str, num: int = 5) -> list[dict[str, str]]:
    """Search via SerpAPI if key present, else raw Google (best-effort)."""
    results: list[dict[str, str]] = []

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

    # Fallback: raw Google scrape
    try:
        url = f"https://www.google.com/search?q={requests.utils.quote(query)}&num={num}&hl=en"
        r = requests.get(url, headers=_get_headers(), timeout=10)
        # Very basic link extraction — titles and URLs from search results
        links = re.findall(r'href="(https?://[^"&]+)"', r.text)
        snippets = re.findall(r'<span[^>]*>([^<]{30,200})</span>', r.text)
        for i, link in enumerate(links[:num]):
            results.append({
                "title": "",
                "snippet": snippets[i] if i < len(snippets) else "",
                "url": link,
            })
    except Exception:
        pass

    return results


def _extract_company_names(text: str) -> list[str]:
    found: list[str] = []
    for pattern in COMPANY_NAME_PATTERNS:
        matches = re.findall(pattern, text)
        found.extend(m.strip() for m in matches if len(m.strip()) > 3)
    return list(set(found))

# ── Source 1: Google News ──────────────────────────────────────────────────────

def scrape_google_news() -> list[dict[str, Any]]:
    print("[news] Starting Google News discovery...")
    discovered: list[dict[str, Any]] = []

    for query in DISCOVERY_QUERIES:
        try:
            url = f"https://www.google.com/search?q={requests.utils.quote(query)}&tbm=nws&tbs=qdr:m3"
            r = requests.get(url, headers=_get_headers(), timeout=10)
            text = r.text

            # Extract company names from titles/snippets
            titles   = re.findall(r'<div[^>]*class="[^"]*BNeawe[^"]*"[^>]*>([^<]+)</div>', text)
            combined = " ".join(titles)
            names = _extract_company_names(combined)

            for name in names:
                # Check if name looks like a real company (≥2 words or ends with tech keyword)
                words = name.split()
                if len(words) < 1 or len(name) < 4:
                    continue
                discovered.append({
                    "name": name,
                    "location": "Ahmedabad",
                    "source": "Google News",
                    "source_url": url,
                })

            time.sleep(random.uniform(2.0, 4.0))
        except Exception as e:
            print(f"[news] Error for query '{query}': {e}")

    print(f"[news] Found {len(discovered)} raw companies")
    return discovered

# ── Source 1.5: Google Search (LinkedIn & Others) ──────────────────────────────

def scrape_search_queries() -> list[dict[str, Any]]:
    print("[search] Starting Google Search discovery (LinkedIn, Clutch, NASSCOM)...")
    discovered: list[dict[str, Any]] = []

    all_queries = LINKEDIN_DISCOVERY_QUERIES + OTHER_DISCOVERY_QUERIES
    for query in all_queries:
        try:
            results = google_search(query, num=5)
            for r in results:
                title = r.get("title", "")
                url = r.get("url", "")
                
                # Extract company name from title (e.g., "Company Name - LinkedIn", "Company Name - Clutch")
                name_candidate = re.split(r'\s*[-\|]\s*(LinkedIn|Clutch|IndiaAI|NASSCOM|Tracxn)', title)[0].strip()
                
                # Clean up "Overview", "About", etc.
                name_candidate = re.sub(r'^(About|Overview)\s+', '', name_candidate, flags=re.IGNORECASE)
                name_candidate = name_candidate.replace(" - Overview, News & Similar companies", "")
                
                if len(name_candidate) < 3 or len(name_candidate) > 60:
                    continue
                    
                discovered.append({
                    "name": name_candidate,
                    "location": "Ahmedabad",
                    "source": "Search Queries",
                    "source_url": url,
                })
            
            time.sleep(random.uniform(2.0, 4.0))
        except Exception as e:
            print(f"[search] Error for query '{query}': {e}")

    print(f"[search] Found {len(discovered)} raw companies")
    return discovered

# ── Source 2: Startup India Portal ────────────────────────────────────────────

def scrape_startup_india() -> list[dict[str, Any]]:
    print("[startupindia] Querying Startup India portal...")
    discovered: list[dict[str, Any]] = []

    try:
        api_url = "https://api.startupindia.gov.in/sih/api/pub/user/startups/search"
        params = {
            "roles": "STARTUP",
            "states": "Gujarat",
            "pageNo": 0,
            "pageSize": 50,
            "sortBy": "registrationDate",
            "sortOrder": "DESC",
        }
        r = requests.get(api_url, params=params, timeout=15)
        data = r.json()

        startups = data.get("data", data.get("startups", []))
        for s in startups:
            city = (s.get("city") or s.get("cityOfOperation") or "").lower()
            if not any(loc in city for loc in ["ahmedabad", "gandhinagar", "gift"]):
                continue

            desc = (s.get("description") or s.get("shortDesc") or "").lower()
            if not any(kw in desc for kw in AI_ML_KEYWORDS):
                continue

            name = s.get("name") or s.get("startupName") or ""
            if not name:
                continue

            discovered.append({
                "name": name,
                "location": city.title(),
                "website": s.get("website"),
                "source": "Startup India",
                "source_url": "https://www.startupindia.gov.in",
            })

    except Exception as e:
        print(f"[startupindia] Error: {e}")

    print(f"[startupindia] Found {len(discovered)} companies")
    return discovered

# ── Source 3: GIFT City Directory ─────────────────────────────────────────────

def scrape_gift_city() -> list[dict[str, Any]]:
    print("[gift] Fetching GIFT City company directory...")
    discovered: list[dict[str, Any]] = []

    urls_to_try = [
        "https://www.giftgujarat.in/entities",
        "https://www.giftgujarat.in/companies",
    ]

    for url in urls_to_try:
        try:
            r = requests.get(url, headers=_get_headers(), timeout=15)
            if r.status_code != 200:
                continue

            # Extract company names from anchor text and headings
            name_candidates = re.findall(r'<(?:h[1-6]|td|li|a)[^>]*>([A-Z][A-Za-z0-9\s&]+(?:Technologies?|Tech|AI|Fintech|Solutions|Systems|Labs)?)</(?:h[1-6]|td|li|a)>', r.text)

            tech_keywords = ["technology", "tech", "ai", "fintech", "it ", "software", "data", "digital", "analytics", "solutions"]
            for candidate in name_candidates:
                c = candidate.strip()
                if len(c) < 5 or len(c) > 80:
                    continue
                if any(kw in c.lower() for kw in tech_keywords):
                    discovered.append({
                        "name": c,
                        "location": "GIFT City",
                        "source": "GIFT City Directory",
                        "source_url": url,
                    })

            if discovered:
                break
        except Exception as e:
            print(f"[gift] Error fetching {url}: {e}")

    print(f"[gift] Found {len(discovered)} companies")
    return discovered

# ── Company Verification ───────────────────────────────────────────────────────

def verify_company(company_name: str, location: str = "Ahmedabad") -> dict[str, Any]:
    result: dict[str, Any] = {
        "has_website": False, "website_url": None,
        "has_linkedin": False, "linkedin_url": None,
        "has_github": False, "github_url": None,
        "has_funding": False,
        "news_mentions": 0,
        "has_technical_founder": False,
        "founder_names": None,
        "ai_ml_signals": [],
    }

    # Search 1: LinkedIn (Highest Priority)
    try:
        li_results = google_search(f'site:linkedin.com/company "{company_name}"', num=3)
        if li_results:
            result["has_linkedin"] = True
            result["linkedin_url"] = li_results[0]["url"]
        time.sleep(random.uniform(1, 2))
    except Exception:
        pass

    # Search 2: website
    try:
        results = google_search(f"{company_name} {location} official website AI", num=5)
        for r in results:
            name_slug = company_name.lower().replace(" ", "")
            if name_slug in r["url"].lower() or name_slug.replace("technologies", "") in r["url"].lower():
                result["has_website"] = True
                result["website_url"] = r["url"]
                break
        time.sleep(random.uniform(1, 2))
    except Exception:
        pass

    # Search 3: GitHub
    try:
        gh_results = google_search(f'site:github.com "{company_name}"', num=3)
        if gh_results:
            result["has_github"] = True
            result["github_url"] = gh_results[0]["url"]
        time.sleep(random.uniform(1, 2))
    except Exception:
        pass

    # Search 4: funding
    try:
        fund_results = google_search(f"{company_name} funding raised investment", num=5)
        if fund_results:
            snippets = " ".join([r.get("snippet", "") for r in fund_results]).lower()
            if any(w in snippets for w in ["raised", "funding", "seed", "series", "investment", "crore", "lakh"]):
                result["has_funding"] = True
            result["news_mentions"] += len(fund_results)
        time.sleep(random.uniform(1, 2))
    except Exception:
        pass

    # Search 5: technical founder
    try:
        founder_results = google_search(f"{company_name} founder CTO CEO engineer", num=5)
        if founder_results:
            snippets = " ".join([r.get("snippet", "") for r in founder_results]).lower()
            if any(s in snippets for s in TECH_FOUNDER_SIGNALS):
                result["has_technical_founder"] = True
            result["news_mentions"] += len(founder_results)

            # Extract AI/ML signals from snippets
            ai_signals = [kw for kw in AI_ML_KEYWORDS if kw in snippets]
            result["ai_ml_signals"] = list(set(ai_signals))
        time.sleep(random.uniform(1, 2))
    except Exception:
        pass

    return result

# ── Red flag detection ─────────────────────────────────────────────────────────

def has_red_flags(company: dict[str, Any]) -> bool:
    flags = 0
    if not company.get("has_website"):           flags += 1
    if not company.get("has_linkedin"):          flags += 1
    if not company.get("has_technical_founder"): flags += 1
    if company.get("news_mentions", 0) == 0:     flags += 1
    return flags >= 3


def calculate_potential_score(company: dict[str, Any]) -> int:
    score = 0
    if company.get("has_funding"):           score += 30
    if company.get("has_linkedin"):          score += 15
    if company.get("has_website"):           score += 15
    if company.get("has_technical_founder"): score += 15
    if company.get("has_github"):            score += 10
    if company.get("news_mentions", 0) > 0:  score += 10
    try:
        if company.get("team_size") and int(company["team_size"]) >= 3:
            score += 10
    except (ValueError, TypeError):
        pass
    if company.get("government_grant"):      score += 5
    return min(score, 100)

# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> int:
    print("[discovery] Starting company discovery run...")
    client = get_supabase_client()
    new_found = 0
    errors: list[str] = []

    # Gather from all sources
    discovered: list[dict[str, Any]] = []
    discovered += scrape_search_queries()
    discovered += scrape_google_news()
    discovered += scrape_startup_india()
    discovered += scrape_gift_city()

    # Deduplicate by name
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for c in discovered:
        key = c["name"].lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(c)

    print(f"[discovery] Processing {len(unique)} unique companies...")

    for company in unique:
        try:
            # Skip if already discovered
            existing = client.table("discovered_companies") \
                .select("id").ilike("name", company["name"]).execute()
            if existing.data:
                continue

            # Skip if already in watch list
            in_watchlist = client.table("companies") \
                .select("id").ilike("name", company["name"]).execute()
            if in_watchlist.data:
                continue

            # Verify company
            time.sleep(random.uniform(2, 4))
            verification = verify_company(
                company["name"],
                company.get("location", "Ahmedabad"),
            )
            company.update(verification)

            # Red flag check
            if has_red_flags(company):
                print(f"[discovery] Skipping (red flags): {company['name']}")
                continue

            # Score
            score = calculate_potential_score(company)
            tier = "high" if score >= 70 else "medium" if score >= 40 else "low"

            # Only keep medium+ potential
            if score < 30:
                continue

            print(f"[discovery] Saving: {company['name']} (score={score}, tier={tier})")

            client.table("discovered_companies").insert({
                "name": company["name"],
                "location": company.get("location"),
                "website": company.get("website_url"),
                "linkedin_url": company.get("linkedin_url"),
                "github_url": company.get("github_url"),
                "has_website": company.get("has_website", False),
                "has_linkedin": company.get("has_linkedin", False),
                "has_github": company.get("has_github", False),
                "has_funding": company.get("has_funding", False),
                "has_technical_founder": company.get("has_technical_founder", False),
                "news_mentions": company.get("news_mentions", 0),
                "ai_ml_signals": ", ".join(company.get("ai_ml_signals", [])),
                "source": company.get("source"),
                "source_url": company.get("source_url"),
                "potential_score": score,
                "potential_tier": tier,
                "raw_data": company,
                "discovered_at": datetime.now(timezone.utc).isoformat(),
            }).execute()

            new_found += 1
            time.sleep(random.uniform(1, 3))

        except Exception as e:
            errors.append(f"{company.get('name', 'unknown')}: {e}")
            print(f"[discovery] Error: {e}")

    status = "success" if not errors else "partial_success"
    log_scraper_run(
        client, "company_discovery",
        status, new_found,
        "\n".join(errors) if errors else None,
    )

    print(f"[discovery] Done. New companies saved: {new_found}. Errors: {len(errors)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

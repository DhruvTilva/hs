"""
scrapers/company_discovery.py  — God-Level Edition

5-Layer Multi-Source Intelligence Pipeline:
  Layer 1: Official Indian Government APIs (Startup India, IndiaAI.gov.in)
  Layer 2: RSS Feed Intelligence (YourStory, Inc42, ET, NASSCOM)
  Layer 3: Serper.dev Search (drop-in replacement, 2,500 free searches — no card required)
  Layer 4: Direct Directory Scraping (Clutch.co, IndiaAI, NASSCOM)
  Layer 5: i-Hub Gujarat Portal (state-government curated startups)

Smart Verification (ZERO search API calls):
  - Website: direct HTTP GET check
  - LinkedIn: extracted from search results already gathered
  - GitHub: free unauthenticated GitHub API (60 req/hr)
  - Funding: extracted from RSS article text
  - Technical founder: extracted from RSS article text

Run:     python scrapers/company_discovery.py [--dry-run]
Schedule: Manual via GitHub Actions UI (Guide → Automations → Company Discovery Scanner)
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import time
import random
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.common import get_supabase_client, log_scraper_run  # type: ignore

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── Config / Keys ─────────────────────────────────────────────────────────────

SERPER_KEY   = os.getenv("SERPER_KEY", "")    # serper.dev — 2,500 free searches, no card!
DRY_RUN      = False  # set via --dry-run CLI flag

ROTATING_HEADERS = [
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        "Accept-Language": "en-GB,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
]

# ── AI/ML Signal Keywords ─────────────────────────────────────────────────────

AI_ML_KEYWORDS = [
    "artificial intelligence", "machine learning", "deep learning", "nlp",
    "natural language processing", "computer vision", "generative ai", "genai",
    "llm", "large language model", "data science", "neural network", "ai-powered",
    "ml model", "transformer", "chatbot", "automation", "robotics process",
]

TECH_FOUNDER_SIGNALS = [
    "engineer", "developer", "iit", "nit", "bits", "google", "microsoft",
    "amazon", "phd", "ml", "ai", "data scientist", "researcher", "cto",
    "chief technology", "founded", "co-founder",
]

NOISE_WORDS = {
    "home", "about", "contact", "blog", "careers", "login", "signup",
    "privacy", "terms", "cookie", "india", "gujarat", "ahmedabad", "technology",
    "services", "overview", "news", "events", "jobs", "help", "support",
}

# ── Utility ───────────────────────────────────────────────────────────────────

def _headers() -> dict:
    return random.choice(ROTATING_HEADERS)


def _safe_get(url: str, *, timeout: int = 12, params: dict | None = None) -> requests.Response | None:
    try:
        r = requests.get(url, headers=_headers(), params=params, timeout=timeout)
        if r.status_code == 200:
            return r
    except Exception as exc:
        logger.debug("GET %s failed: %s", url, exc)
    return None


def _clean_name(raw: str) -> str:
    """Trim whitespace, remove trailing punctuation, normalise."""
    name = raw.strip().strip(".,;:-|")
    # Remove common suffixes that are not company names
    name = re.sub(r"\s*[-|]\s*(LinkedIn|Clutch|IndiaAI|NASSCOM|Tracxn|Startup India|i-Hub).*", "", name, flags=re.I)
    name = re.sub(r"^(About|Overview|Home)\s+", "", name, flags=re.I)
    return name.strip()


def _is_valid_name(name: str) -> bool:
    if not name or len(name) < 3 or len(name) > 80:
        return False
    if name.lower() in NOISE_WORDS:
        return False
    # Must have at least one capital letter (real company name)
    if not re.search(r"[A-Z]", name):
        return False
    return True


def _has_ai_signal(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in AI_ML_KEYWORDS)


def _sleep(lo: float = 1.5, hi: float = 3.5) -> None:
    time.sleep(random.uniform(lo, hi))


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 1 — Official Indian Government APIs
# ══════════════════════════════════════════════════════════════════════════════

def layer1_startup_india() -> list[dict[str, Any]]:
    """Query the official Startup India DPIIT public API — zero API key, no limits."""
    print("\n[L1] Startup India Government API...")
    discovered: list[dict[str, Any]] = []

    api_url = "https://api.startupindia.gov.in/sih/api/pub/user/startups/search"
    for page in range(0, 3):  # first 150 results across 3 pages
        try:
            params = {
                "roles": "STARTUP",
                "states": "Gujarat",
                "pageNo": page,
                "pageSize": 50,
                "sortBy": "registrationDate",
                "sortOrder": "DESC",
            }
            r = _safe_get(api_url, params=params, timeout=15)
            if not r:
                break

            data = r.json()
            startups = data.get("data", data.get("startups", []))
            if not startups:
                break

            for s in startups:
                city = (s.get("city") or s.get("cityOfOperation") or "").lower()
                if not any(loc in city for loc in ["ahmedabad", "gandhinagar", "gift"]):
                    continue

                desc = (s.get("description") or s.get("shortDesc") or "").lower()
                if not _has_ai_signal(desc):
                    continue

                name = s.get("name") or s.get("startupName") or ""
                if not name:
                    continue

                discovered.append({
                    "name": name.strip(),
                    "location": city.title() or "Ahmedabad",
                    "website": s.get("website"),
                    "source": "Startup India",
                    "source_url": "https://www.startupindia.gov.in",
                    "funding_snippet": desc[:200],
                    "has_website": bool(s.get("website")),
                })

            _sleep(1, 2)
        except Exception as exc:
            logger.warning("[L1] Startup India page %d error: %s", page, exc)
            break

    print(f"[L1] Startup India → {len(discovered)} companies")
    return discovered


def layer1_india_ai() -> list[dict[str, Any]]:
    """Scrape IndiaAI.gov.in startup registry — official MeitY AI startup list."""
    print("[L1] IndiaAI.gov.in registry...")
    discovered: list[dict[str, Any]] = []

    urls = [
        "https://indiaai.gov.in/startups",
        "https://indiaai.gov.in/startups?state=Gujarat",
    ]

    for url in urls:
        r = _safe_get(url, timeout=15)
        if not r:
            continue
        soup = BeautifulSoup(r.text, "html.parser")

        # Extract startup cards / names from headings and links
        for tag in soup.find_all(["h2", "h3", "h4", "a", "span"], string=True):
            text = tag.get_text(strip=True)
            name = _clean_name(text)
            if not _is_valid_name(name):
                continue
            # Filter to Gujarat mentions in surrounding context
            parent_text = (tag.parent.get_text(" ", strip=True) if tag.parent else "").lower()
            if not any(loc in parent_text for loc in ["gujarat", "ahmedabad", "gandhinagar", "gift"]):
                continue
            if not _has_ai_signal(parent_text):
                continue

            discovered.append({
                "name": name,
                "location": "Ahmedabad",
                "source": "IndiaAI Registry",
                "source_url": url,
            })
        _sleep(2, 4)

    # De-dupe by name
    seen: set[str] = set()
    unique = []
    for c in discovered:
        key = c["name"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(c)

    print(f"[L1] IndiaAI.gov → {len(unique)} companies")
    return unique


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 2 — RSS Feed Intelligence
# ══════════════════════════════════════════════════════════════════════════════

RSS_FEEDS = [
    # YourStory AI/ML tag
    "https://yourstory.com/feed",
    # Inc42 — Gujarat Startup news
    "https://inc42.com/feed/",
    # Economic Times Startups
    "https://economictimes.indiatimes.com/tech/startups/rssfeeds/78570550.cms",
    # NASSCOM community
    "https://community.nasscom.in/feed",
    # Analytics India Mag
    "https://analyticsindiamag.com/feed/",
]

COMPANY_NAME_PATTERNS = [
    # "CompanyName, an AI startup"
    r"([A-Z][A-Za-z0-9\s&]+(?:Technologies?|Tech|AI|Labs?|Solutions?|Systems?|Analytics|Data|Robotics|Intelligence|Innovations?|Ventures?|Inc|Pvt|Ltd)?),?\s+(?:an?\s+)?(?:AI|ML|tech|startup|company|platform)",
    # "CompanyName raises/secures funding"
    r"([A-Z][A-Za-z0-9\s&]+(?:Technologies?|Tech|AI|Labs?|Solutions?|Systems?|Analytics)?)\s+(?:raises?|raised|secures?|secured|gets?|got)\s+(?:funding|investment|seed|series|\$|₹|crore|lakh)",
    # "CompanyName opens office in Ahmedabad/Gujarat/GIFT"
    r"([A-Z][A-Za-z0-9\s&]+(?:Technologies?|Tech|AI|Labs?|Solutions?|Systems?|Analytics)?)\s+(?:opens?|opened|launches?|launched|expands?|expanded)\s+(?:office|center|hub|operations)\s+in\s+(?:Ahmedabad|Gandhinagar|Gujarat|GIFT)",
    # "based/headquartered in Ahmedabad"
    r"([A-Z][A-Za-z0-9\s&]+(?:Technologies?|Tech|AI|Labs?|Solutions?|Systems?|Analytics)?),\s+(?:based|headquartered|located)\s+in\s+(?:Ahmedabad|Gandhinagar|Gujarat|GIFT)",
]

LOCATION_SIGNALS = ["ahmedabad", "gandhinagar", "gift city", "gujarat", "giftcity"]
FUNDING_SIGNALS  = ["raised", "funding", "seed", "series a", "series b", "investment", "crore", "lakh", "$", "₹"]


def _extract_names_from_text(text: str) -> list[str]:
    found = []
    for pattern in COMPANY_NAME_PATTERNS:
        for m in re.findall(pattern, text):
            name = _clean_name(m)
            if _is_valid_name(name):
                found.append(name)
    return list(set(found))


def layer2_rss_feeds() -> list[dict[str, Any]]:
    """Parse RSS/Atom feeds — completely free, real-time, zero API quota."""
    print("\n[L2] RSS Feed Intelligence...")
    discovered: list[dict[str, Any]] = []

    try:
        import feedparser  # type: ignore
    except ImportError:
        logger.warning("[L2] feedparser not installed — skipping RSS layer. Run: pip install feedparser")
        return discovered

    for feed_url in RSS_FEEDS:
        try:
            feed = feedparser.parse(feed_url)
            entries = feed.get("entries", [])
            logger.info("[L2] %s → %d entries", feed_url, len(entries))

            for entry in entries:
                title   = entry.get("title", "")
                summary = entry.get("summary", "") or entry.get("description", "")
                content = f"{title} {summary}"

                # Only look at posts about Gujarat/Ahmedabad AI companies
                if not any(loc in content.lower() for loc in LOCATION_SIGNALS):
                    continue
                if not _has_ai_signal(content.lower()):
                    continue

                names = _extract_names_from_text(content)
                has_funding = any(sig in content.lower() for sig in FUNDING_SIGNALS)
                has_tech_founder = any(sig in content.lower() for sig in TECH_FOUNDER_SIGNALS)
                ai_signals = [kw for kw in AI_ML_KEYWORDS if kw in content.lower()]

                for name in names:
                    discovered.append({
                        "name": name,
                        "location": "Ahmedabad",
                        "source": f"RSS: {feed.feed.get('title', feed_url)}",
                        "source_url": entry.get("link", feed_url),
                        "has_funding": has_funding,
                        "has_technical_founder": has_tech_founder,
                        "ai_ml_signals": ai_signals,
                        "funding_snippet": content[:300],
                    })

            _sleep(1, 2)
        except Exception as exc:
            logger.warning("[L2] Feed %s error: %s", feed_url, exc)

    print(f"[L2] RSS → {len(discovered)} raw company mentions")
    return discovered


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 3 — Serper.dev Search API (2,500 free, no card — replaces SerpAPI)
# ══════════════════════════════════════════════════════════════════════════════

SERPER_LINKEDIN_QUERIES = [
    'site:linkedin.com/company "artificial intelligence" "Ahmedabad"',
    'site:linkedin.com/company "machine learning" "Ahmedabad"',
    'site:linkedin.com/company "AI" "Gujarat"',
    'site:linkedin.com/company "GenAI" OR "LLM" "Gujarat"',
    'site:linkedin.com/company "AI" "GIFT City"',
    'site:linkedin.com/company "deep learning" "Ahmedabad"',
    'site:linkedin.com/company "data science" "Ahmedabad"',
    'site:linkedin.com/company "NLP" OR "computer vision" "Gujarat"',
    'site:linkedin.com/company "AI startup" "Ahmedabad" OR "Gandhinagar"',
    'site:linkedin.com/company "ML" "fintech" "GIFT City"',
]


def _serper_search(query: str, num: int = 5) -> list[dict[str, str]]:
    """Call Serper.dev Google Search API — identical JSON structure to SerpAPI."""
    if not SERPER_KEY:
        logger.debug("[L3] SERPER_KEY missing — skipping search layer")
        return []
    try:
        r = requests.post(
            "https://google.serper.dev/search",
            headers={"X-API-KEY": SERPER_KEY, "Content-Type": "application/json"},
            json={"q": query, "num": num, "gl": "in", "hl": "en"},
            timeout=10,
        )
        data = r.json()
        return [
            {"title": item.get("title", ""), "snippet": item.get("snippet", ""), "url": item.get("link", "")}
            for item in data.get("organic", [])[:num]
        ]
    except Exception as exc:
        logger.warning("[L3] Serper search failed for '%s': %s", query, exc)
        return []


def layer3_serper_linkedin() -> list[dict[str, Any]]:
    """Use Serper.dev to X-Ray LinkedIn for AI companies in Gujarat."""
    if not SERPER_KEY:
        print("\n[L3] Serper.dev key not set — skipping LinkedIn layer.")
        print("     Sign up free at serper.dev (no card!) and set SERPER_KEY=... in .env.local")
        return []

    print(f"\n[L3] Serper.dev LinkedIn X-Ray ({len(SERPER_LINKEDIN_QUERIES)} queries)...")
    discovered: list[dict[str, Any]] = []

    for query in SERPER_LINKEDIN_QUERIES:
        results = _serper_search(query, num=5)
        for r in results:
            title = r.get("title", "")
            url   = r.get("url", "")
            if "linkedin.com/company" not in url:
                continue

            # Extract company name from LinkedIn title: "CompanyName - LinkedIn"
            name = _clean_name(re.split(r"\s*[-|]\s*(LinkedIn|Overview|Company)", title)[0])
            if not _is_valid_name(name):
                continue

            discovered.append({
                "name": name,
                "location": "Ahmedabad",
                "has_linkedin": True,
                "linkedin_url": url,
                "source": "Serper LinkedIn X-Ray",
                "source_url": url,
            })
        _sleep(1, 2)

    print(f"[L3] Serper → {len(discovered)} LinkedIn companies")
    return discovered


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 4 — Direct Directory Scraping (Clutch, NASSCOM, IndiaAI, Clutch)
# ══════════════════════════════════════════════════════════════════════════════

def layer4_clutch() -> list[dict[str, Any]]:
    """Scrape Clutch.co AI/ML company directory for Ahmedabad — pre-verified leads."""
    print("\n[L4] Clutch.co AI directory...")
    discovered: list[dict[str, Any]] = []

    urls = [
        "https://clutch.co/in/it-services/artificial-intelligence/ahmedabad",
        "https://clutch.co/in/it-services/machine-learning/ahmedabad",
        "https://clutch.co/in/it-services/artificial-intelligence/gujarat",
    ]

    for url in urls:
        r = _safe_get(url, timeout=15)
        if not r:
            _sleep(2, 4)
            continue

        soup = BeautifulSoup(r.text, "html.parser")

        # Clutch uses h3 tags with class "company_info" for company names
        for selector in ["h3.company_info", "h3", ".company-name", "[data-company]", ".sg-provider__name"]:
            for tag in soup.select(selector):
                name = _clean_name(tag.get_text(strip=True))
                if _is_valid_name(name):
                    discovered.append({
                        "name": name,
                        "location": "Ahmedabad",
                        "source": "Clutch.co",
                        "source_url": url,
                        "has_website": True,  # Clutch only lists companies with verified websites
                    })

        _sleep(3, 6)

    print(f"[L4] Clutch.co → {len(discovered)} companies")
    return discovered


def layer4_nasscom() -> list[dict[str, Any]]:
    """Scrape NASSCOM member directory for Gujarat AI companies."""
    print("[L4] NASSCOM member directory...")
    discovered: list[dict[str, Any]] = []

    # NASSCOM has a JSON endpoint for member search
    api_urls = [
        "https://nasscom.in/memberlisting?field_company_location_target_id=Gujarat&field_service_offering_target_id=Artificial+Intelligence",
    ]

    for url in api_urls:
        r = _safe_get(url, timeout=15)
        if not r:
            continue

        soup = BeautifulSoup(r.text, "html.parser")
        for tag in soup.find_all(["h2", "h3", "h4", ".member-name", ".company-title"]):
            name = _clean_name(tag.get_text(strip=True))
            if _is_valid_name(name) and len(name) > 4:
                discovered.append({
                    "name": name,
                    "location": "Gujarat",
                    "source": "NASSCOM",
                    "source_url": url,
                })
        _sleep(2, 4)

    print(f"[L4] NASSCOM → {len(discovered)} companies")
    return discovered


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 5 — i-Hub Gujarat (State Government Curated — Highest Quality Leads)
# ══════════════════════════════════════════════════════════════════════════════

def layer5_ihub_gujarat() -> list[dict[str, Any]]:
    """
    Scrape i-Hub Gujarat startup directory.
    i-Hub is the state government of Gujarat's official startup incubator —
    every company listed here is real, verified, and based in Gujarat.
    """
    print("\n[L5] i-Hub Gujarat (State Government Startup Directory)...")
    discovered: list[dict[str, Any]] = []

    urls_to_try = [
        "https://ihubgujarat.in/startups",
        "https://ihubgujarat.in/portfolio",
        "https://ihubgujarat.in/companies",
        "https://ihubgujarat.in/ecosystem",
    ]

    for url in urls_to_try:
        r = _safe_get(url, timeout=20)
        if not r:
            _sleep(2, 3)
            continue

        soup = BeautifulSoup(r.text, "html.parser")

        # Try multiple selectors for startup card names
        for selector in [
            "h2", "h3", "h4",
            ".startup-name", ".company-name", ".portfolio-title",
            ".card-title", ".entry-title",
            "[class*='startup'] h2", "[class*='startup'] h3",
            "[class*='company'] h3", "[class*='portfolio'] h3",
        ]:
            for tag in soup.select(selector):
                text = tag.get_text(strip=True)
                name = _clean_name(text)
                if not _is_valid_name(name):
                    continue
                if len(name) < 4 or name.lower() in {"home", "about", "contact", "team", "news"}:
                    continue

                # Check if surrounding context has AI signal
                context = (tag.parent.get_text(" ", strip=True) if tag.parent else "").lower()
                if not _has_ai_signal(context):
                    # Still include if it's from i-Hub (government verified), just lower confidence
                    pass

                discovered.append({
                    "name": name,
                    "location": "Ahmedabad",
                    "source": "i-Hub Gujarat",
                    "source_url": url,
                    "govt_verified": True,  # All i-Hub companies are state-verified
                })

        if discovered:
            break  # Found data from first valid URL, no need to try others

        _sleep(2, 4)

    # De-dupe
    seen: set[str] = set()
    unique = []
    for c in discovered:
        key = c["name"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(c)

    print(f"[L5] i-Hub Gujarat → {len(unique)} companies")
    return unique


# ══════════════════════════════════════════════════════════════════════════════
# SMART VERIFICATION — Zero Search API calls
# ══════════════════════════════════════════════════════════════════════════════

def verify_company_smart(company: dict[str, Any]) -> dict[str, Any]:
    """
    Verify a company using only FREE methods — no SerpAPI, no Serper.dev:
      1. LinkedIn URL: already extracted from Layer 3 or known from source
      2. Website: direct HTTP GET check (free)
      3. GitHub: GitHub public search API (60 req/hr unauthenticated, free)
      4. Funding: extracted from RSS article text (already in company dict)
      5. Technical founder: extracted from RSS article text
    """
    result = {
        "has_website":          company.get("has_website", False),
        "website_url":          company.get("website"),
        "has_linkedin":         company.get("has_linkedin", False),
        "linkedin_url":         company.get("linkedin_url"),
        "has_github":           False,
        "github_url":           None,
        "has_funding":          company.get("has_funding", False),
        "has_technical_founder": company.get("has_technical_founder", False),
        "news_mentions":        1 if company.get("source", "").startswith("RSS") else 0,
        "ai_ml_signals":        company.get("ai_ml_signals", []),
        "govt_verified":        company.get("govt_verified", False),
    }

    # 1. Website check: direct HTTP GET (free, zero quota)
    if not result["has_website"] and not result["website_url"]:
        name_slug = re.sub(r"[^a-z0-9]", "", company["name"].lower())
        guessed_urls = [
            f"https://www.{name_slug}.com",
            f"https://www.{name_slug}.in",
            f"https://www.{name_slug}.ai",
            f"https://{name_slug}.com",
        ]
        for candidate in guessed_urls:
            try:
                resp = requests.head(candidate, timeout=5, allow_redirects=True)
                if resp.status_code < 400:
                    result["has_website"]  = True
                    result["website_url"] = candidate
                    break
            except Exception:
                pass
            time.sleep(0.3)

    # 2. GitHub check: free public GitHub search API (60 requests/hr unauthenticated)
    try:
        gh_name = re.sub(r"\s+", "+", company["name"].strip())
        r = requests.get(
            "https://api.github.com/search/repositories",
            params={"q": f"{gh_name}+language:Python", "per_page": 1},
            headers={"Accept": "application/vnd.github+json"},
            timeout=8,
        )
        if r.status_code == 200:
            items = r.json().get("items", [])
            if items:
                owner = items[0].get("owner", {}).get("login", "")
                org_name = re.sub(r"\s+", "", company["name"]).lower()
                if org_name in owner.lower() or owner.lower() in org_name:
                    result["has_github"]  = True
                    result["github_url"] = items[0].get("html_url")
    except Exception:
        pass

    return result


# ══════════════════════════════════════════════════════════════════════════════
# SCORING & FILTERING
# ══════════════════════════════════════════════════════════════════════════════

def calculate_score(company: dict[str, Any]) -> int:
    score = 0
    if company.get("has_funding"):           score += 30
    if company.get("govt_verified"):         score += 25  # NEW: government-verified bonus
    if company.get("has_linkedin"):          score += 15
    if company.get("has_website"):           score += 15
    if company.get("has_technical_founder"): score += 15
    if company.get("has_github"):            score += 10
    if company.get("news_mentions", 0) > 0:  score += 10
    if company.get("ai_ml_signals"):         score += 5
    return min(score, 100)


def has_red_flags(company: dict[str, Any]) -> bool:
    flags = 0
    if not company.get("has_website"):           flags += 1
    if not company.get("has_linkedin"):          flags += 1
    if not company.get("has_technical_founder"): flags += 1
    if company.get("news_mentions", 0) == 0:     flags += 1
    # Government-verified companies are trusted even with other missing signals
    if company.get("govt_verified"):
        return False
    return flags >= 3


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main(dry_run: bool = False) -> int:
    print("=" * 70)
    print("  HireSense — God-Level Company Discovery (5-Layer Pipeline)")
    print("=" * 70)

    client = None if dry_run else get_supabase_client()
    if dry_run:
        print("[DRY RUN] No data will be written to the database.\n")

    # ── Gather from all 5 layers ───────────────────────────────────────────
    all_discovered: list[dict[str, Any]] = []
    all_discovered += layer1_startup_india()
    all_discovered += layer1_india_ai()
    all_discovered += layer2_rss_feeds()
    all_discovered += layer3_serper_linkedin()
    all_discovered += layer4_clutch()
    all_discovered += layer4_nasscom()
    all_discovered += layer5_ihub_gujarat()

    # ── Deduplicate by name ────────────────────────────────────────────────
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for c in all_discovered:
        key = c["name"].lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(c)

    print(f"\n{'='*70}")
    print(f"  Total unique raw companies found: {len(unique)}")
    print(f"{'='*70}\n")

    # ── Skip already-known companies ───────────────────────────────────────
    already_discovered: set[str] = set()
    already_watchlist: set[str] = set()

    if client:
        try:
            rows = client.table("discovered_companies").select("name").execute().data or []
            already_discovered = {r["name"].lower() for r in rows}
        except Exception:
            pass
        try:
            rows = client.table("companies").select("name").execute().data or []
            already_watchlist = {r["name"].lower() for r in rows}
        except Exception:
            pass

    new_found = 0
    errors: list[str] = []

    for company in unique:
        try:
            name_lower = company["name"].lower()

            if name_lower in already_discovered:
                logger.debug("Already discovered: %s", company["name"])
                continue
            if name_lower in already_watchlist:
                logger.debug("Already in watchlist: %s", company["name"])
                continue

            # Smart verification (zero search API calls)
            _sleep(0.5, 1.5)
            verification = verify_company_smart(company)
            company.update(verification)

            # Red flag filter
            if has_red_flags(company):
                logger.info("[skip] Red flags: %s", company["name"])
                continue

            # Score
            score = calculate_score(company)
            tier = "high" if score >= 70 else "medium" if score >= 40 else "low"

            # Skip very low confidence (score < 25)
            if score < 25:
                logger.info("[skip] Low score (%d): %s", score, company["name"])
                continue

            print(f"[save] {company['name']} | score={score} ({tier}) | {company.get('source', '?')}")

            if dry_run:
                print(f"       linkedin={company.get('linkedin_url')} website={company.get('website_url')}")
                new_found += 1
                continue

            # Save to Supabase
            if client:
                client.table("discovered_companies").insert({
                    "name":                  company["name"],
                    "location":              company.get("location"),
                    "website":               company.get("website_url"),
                    "linkedin_url":          company.get("linkedin_url"),
                    "github_url":            company.get("github_url"),
                    "has_website":           company.get("has_website", False),
                    "has_linkedin":          company.get("has_linkedin", False),
                    "has_github":            company.get("has_github", False),
                    "has_funding":           company.get("has_funding", False),
                    "has_technical_founder": company.get("has_technical_founder", False),
                    "news_mentions":         company.get("news_mentions", 0),
                    "ai_ml_signals":         ", ".join(company.get("ai_ml_signals", [])),
                    "source":                company.get("source"),
                    "source_url":            company.get("source_url"),
                    "potential_score":       score,
                    "potential_tier":        tier,
                    "raw_data":              company,
                    "discovered_at":         datetime.now(timezone.utc).isoformat(),
                }).execute()
                already_discovered.add(name_lower)

            new_found += 1

        except Exception as exc:
            errors.append(f"{company.get('name', 'unknown')}: {exc}")
            logger.error("[discovery] Error: %s", exc)

    status = "success" if not errors else "partial_success"
    if client:
        log_scraper_run(client, "company_discovery", status, new_found, "\n".join(errors) if errors else None)
    elif dry_run:
        print(f"\n[DRY RUN] Would have saved {new_found} companies.")

    print(f"\n{'='*70}")
    print(f"  Done. New companies saved: {new_found}. Errors: {len(errors)}")
    if errors:
        for e in errors[:5]:
            print(f"  ⚠ {e}")
    print(f"{'='*70}")

    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="HireSense God-Level Company Discovery")
    parser.add_argument("--dry-run", action="store_true", help="Run without writing to database")
    args = parser.parse_args()
    raise SystemExit(main(dry_run=args.dry_run))

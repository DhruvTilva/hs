"""
scrapers/company_discovery.py  — God-Level++ Edition

8-Layer Multi-Source Intelligence Pipeline:
  Layer 1: Official Indian Government APIs (Startup India, IndiaAI.gov.in)
  Layer 2: RSS Feed Intelligence + Gemini AI Name Extractor
  Layer 3: Serper.dev LinkedIn X-Ray (2,500 free credits, no card)
  Layer 4: Direct Directory Scraping (Clutch.co, NASSCOM)
  Layer 5: i-Hub Gujarat Portal (state-government curated startups)
  Layer 6: GitHub Organization Intelligence (real dev activity in Ahmedabad)
  Layer 7: Premier Incubator Portfolios (IIMA Ventures, IIT-GN, EDII, AIC-GIIC)
  Layer 8: Hacker News "Who Is Hiring" Thread (highest hiring intent signal)

Smart Verification (ZERO search API calls):
  - Website: direct HTTP GET check
  - LinkedIn: extracted from search results already gathered
  - GitHub: free GitHub API (5,000 req/hr with token)
  - Funding/Founder: extracted from RSS article text

Multi-Source Confidence Engine:
  - Companies found in 2+ independent sources get confidence bonus
  - Incubator + any source = extremely high confidence
  - HN hiring + any source = confirmed active hiring

Run:     python scrapers/company_discovery.py [--dry-run]
Schedule: Manual via GitHub Actions UI (Guide → Automations → Company Discovery Scanner)
"""
from __future__ import annotations

import argparse
import os
import re
import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
import time
import random
import json
import logging
from collections import Counter
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

SERPER_KEY   = os.getenv("SERPER_1_DISCOVERY_KEY", "")        # serper.dev — 2,500 free searches, no card!
GEMINI_KEY   = os.getenv("GEMINI_API_KEY", "")    # Gemini Flash — 1M tokens/day free
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")      # Your existing GitHub PAT — 5,000 req/hr

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
    "llm", "large language model", "neural network", "ai-powered", "ml model",
]

TECH_FOUNDER_SIGNALS = [
    "cto", "chief technology", "phd", "researcher", "data scientist",
    "machine learning", "ml ", "ai ",
]

NOISE_WORDS = {
    "home", "about", "contact", "blog", "careers", "login", "signup",
    "privacy", "terms", "cookie", "india", "gujarat", "ahmedabad", "technology",
    "services", "overview", "news", "events", "jobs", "help", "support",
    "portfolio", "team", "mission", "vision", "investors", "incubation",
}

LOCATION_SIGNALS  = ["ahmedabad", "gandhinagar", "gift city", "gujarat", "giftcity"]
FUNDING_SIGNALS   = ["raised", "funding", "seed", "series a", "series b", "investment", "crore", "lakh", "$", "₹"]

COMPANY_NAME_PATTERNS = [
    r"([A-Z][A-Za-z0-9\s&]+(?:Technologies?|Tech|AI|Labs?|Solutions?|Systems?|Analytics|Data|Robotics|Intelligence|Innovations?|Ventures?|Inc|Pvt|Ltd)?),?\s+(?:an?\s+)?(?:AI|ML|tech|startup|company|platform)",
    r"([A-Z][A-Za-z0-9\s&]+(?:Technologies?|Tech|AI|Labs?|Solutions?|Systems?|Analytics)?)\s+(?:raises?|raised|secures?|secured|gets?|got)\s+(?:funding|investment|seed|series|\$|₹|crore|lakh)",
    r"([A-Z][A-Za-z0-9\s&]+(?:Technologies?|Tech|AI|Labs?|Solutions?|Systems?|Analytics)?)\s+(?:opens?|opened|launches?|launched|expands?)\s+(?:office|center|hub|operations)\s+in\s+(?:Ahmedabad|Gandhinagar|Gujarat|GIFT)",
    r"([A-Z][A-Za-z0-9\s&]+(?:Technologies?|Tech|AI|Labs?|Solutions?|Systems?|Analytics)?),\s+(?:based|headquartered|located)\s+in\s+(?:Ahmedabad|Gandhinagar|Gujarat|GIFT)",
]

# ── Utility ───────────────────────────────────────────────────────────────────

def _headers() -> dict:
    return random.choice(ROTATING_HEADERS)


def _github_headers() -> dict:
    h = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


def _safe_get(url: str, *, timeout: int = 12, params: dict | None = None) -> requests.Response | None:
    try:
        r = requests.get(url, headers=_headers(), params=params, timeout=timeout)
        if r.status_code == 200:
            return r
    except Exception as exc:
        logger.debug("GET %s failed: %s", url, exc)
    return None


def _clean_name(raw: str) -> str:
    name = raw.strip().strip(".,;:-|")
    name = re.sub(r"\s*[-|]\s*(LinkedIn|Clutch|IndiaAI|NASSCOM|Tracxn|Startup India|i-Hub|IIMA|IIT|EDII|AIC).*", "", name, flags=re.I)
    name = re.sub(r"^(About|Overview|Home|Portfolio|Startups?)\s+", "", name, flags=re.I)
    return name.strip()


def _is_valid_name(name: str) -> bool:
    if not name or len(name) < 3 or len(name) > 80:
        return False
    if name.lower() in NOISE_WORDS:
        return False
    if not re.search(r"[A-Z]", name):
        return False
    return True


def _has_ai_signal(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in AI_ML_KEYWORDS)


def _sleep(lo: float = 1.5, hi: float = 3.5) -> None:
    time.sleep(random.uniform(lo, hi))


def _extract_names_from_text(text: str) -> list[str]:
    found = []
    for pattern in COMPANY_NAME_PATTERNS:
        for m in re.findall(pattern, text):
            name = _clean_name(m)
            if _is_valid_name(name):
                found.append(name)
    return list(set(found))


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 1 — Official Indian Government APIs
# ══════════════════════════════════════════════════════════════════════════════

def layer1_startup_india() -> list[dict[str, Any]]:
    """Query official Startup India DPIIT public API — zero API key, no limits."""
    print("\n[L1] Startup India Government API...")
    discovered: list[dict[str, Any]] = []

    api_url = "https://api.startupindia.gov.in/sih/api/pub/user/startups/search"
    # Fetch all Gujarat startups across Technology sectors and filter locally
    # Removed city filter at API level — catches Gandhinagar, GIFT City, Surat etc.
    for page in range(0, 5):  # More pages = more coverage
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
            # API returns data under different keys depending on version
            startups = (
                data.get("data") or
                data.get("startups") or
                data.get("results") or
                (data.get("payload") or {}).get("startups") or
                []
            )
            if not startups:
                break
            for s in startups:
                # Accept any Gujarat city — not just Ahmedabad
                city = (
                    s.get("city") or
                    s.get("cityOfOperation") or
                    s.get("registeredCity") or ""
                ).strip()
                # Require AI signal in description
                desc = (
                    s.get("description") or
                    s.get("shortDesc") or
                    s.get("about") or ""
                ).lower()
                if not _has_ai_signal(desc):
                    continue
                name = (
                    s.get("name") or
                    s.get("startupName") or
                    s.get("entityName") or ""
                ).strip()
                if not name:
                    continue
                location = city or "Gujarat"
                discovered.append({
                    "name": name,
                    "location": location,
                    "website": s.get("website") or s.get("websiteUrl"),
                    "source": "Startup India",
                    "source_url": "https://www.startupindia.gov.in",
                    "ai_ml_signals": [kw for kw in AI_ML_KEYWORDS if kw in desc],
                    "has_website": bool(s.get("website") or s.get("websiteUrl")),
                    "govt_verified": True,
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
    urls = ["https://indiaai.gov.in/startups", "https://indiaai.gov.in/startups?state=Gujarat"]
    for url in urls:
        r = _safe_get(url, timeout=15)
        if not r:
            continue
        soup = BeautifulSoup(r.text, "html.parser")
        for tag in soup.find_all(["h2", "h3", "h4", "a", "span"], string=True):
            text = tag.get_text(strip=True)
            name = _clean_name(text)
            if not _is_valid_name(name):
                continue
            parent_text = (tag.parent.get_text(" ", strip=True) if tag.parent else "").lower()
            if not any(loc in parent_text for loc in ["gujarat", "ahmedabad", "gandhinagar", "gift"]):
                continue
            if not _has_ai_signal(parent_text):
                continue
            discovered.append({"name": name, "location": "Ahmedabad", "source": "IndiaAI Registry", "source_url": url, "govt_verified": True})
        _sleep(2, 4)

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
# LAYER 2 — RSS Feed Intelligence + Gemini AI Name Extractor
# ══════════════════════════════════════════════════════════════════════════════

RSS_FEEDS = [
    # National AI news — broad but useful with Gemini filtering
    "https://yourstory.com/feed",
    "https://inc42.com/feed/",
    "https://analyticsindiamag.com/feed/",
    # Gujarat/Ahmedabad-specific feeds — highest signal
    "https://inc42.com/tag/ahmedabad/feed/",
    "https://inc42.com/tag/gujarat/feed/",
    "https://yourstory.com/tag/ahmedabad/feed",
    "https://yourstory.com/tag/gujarat/feed",
    "https://yourstory.com/tag/artificial-intelligence/feed",
    # National tech/startup feed for AI funding news
    "https://economictimes.indiatimes.com/tech/startups/rssfeeds/78570550.cms",
    "https://community.nasscom.in/feed",
]


def _gemini_extract_companies(article_text: str) -> list[str]:
    """
    Use Gemini Flash (free: 15 RPM, 1M tokens/day) to intelligently extract
    AI/ML company names from news article text — far more accurate than regex.
    Falls back to empty list gracefully if GEMINI_API_KEY is not set.
    """
    if not GEMINI_KEY:
        return []
    try:
        prompt = (
            "Extract the names of AI or ML companies that are based in Gujarat, Ahmedabad, "
            "Gandhinagar, or GIFT City from the following news article text. "
            "Return ONLY a valid JSON array of company name strings, nothing else. "
            "If no such companies are mentioned, return []. "
            f"Article:\n{article_text[:3000]}"
        )
        r = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_KEY}",
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=15,
        )
        if r.status_code != 200:
            return []
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        # Parse the JSON array from the response
        match = re.search(r"\[.*?\]", text, re.DOTALL)
        if match:
            names = json.loads(match.group())
            return [n.strip() for n in names if isinstance(n, str) and _is_valid_name(n.strip())]
    except Exception as exc:
        logger.debug("[L2] Gemini extraction failed: %s", exc)
    return []


def layer2_rss_feeds() -> list[dict[str, Any]]:
    """Parse RSS/Atom feeds — completely free, real-time.
    Uses Gemini AI for intelligent name extraction from article text when key is available,
    falls back to regex patterns otherwise."""
    print("\n[L2] RSS Feed Intelligence + Gemini AI Extractor...")
    discovered: list[dict[str, Any]] = []

    try:
        import feedparser  # type: ignore
    except ImportError:
        logger.warning("[L2] feedparser not installed — skipping. Run: pip install feedparser")
        return discovered

    gemini_calls = 0
    MAX_GEMINI_CALLS = 15  # safe within free rate limit

    for feed_url in RSS_FEEDS:
        try:
            feed = feedparser.parse(feed_url, agent="Mozilla/5.0")
            entries = feed.get("entries", [])
            logger.info("[L2] %s → %d entries", feed_url, len(entries))

            for entry in entries:
                title   = entry.get("title", "")
                summary = entry.get("summary", "") or entry.get("description", "")
                content = f"{title} {summary}"

                if not _has_ai_signal(content.lower()):
                    continue
                # Accept articles about Gujarat OR generic AI funding (Gemini will extract Gujarat companies)
                has_location = any(loc in content.lower() for loc in LOCATION_SIGNALS)
                is_location_feed = any(tag in feed_url for tag in ["ahmedabad", "gujarat"])
                if not has_location and not is_location_feed:
                    continue

                has_funding      = any(sig in content.lower() for sig in FUNDING_SIGNALS)
                has_tech_founder = any(sig in content.lower() for sig in TECH_FOUNDER_SIGNALS)
                ai_signals       = [kw for kw in AI_ML_KEYWORDS if kw in content.lower()]

                # Try Gemini AI extraction first (much better than regex)
                names = []
                if GEMINI_KEY and gemini_calls < MAX_GEMINI_CALLS:
                    names = _gemini_extract_companies(content)
                    gemini_calls += 1
                    time.sleep(0.5)  # respect 15 RPM rate limit

                # Fallback to regex if Gemini not available or returned nothing
                if not names:
                    names = _extract_names_from_text(content)

                for name in names:
                    discovered.append({
                        "name": name,
                        "location": "Gujarat",
                        "source": f"RSS: {feed.feed.get('title', feed_url)}",
                        "source_url": entry.get("link", feed_url),
                        "has_funding": has_funding,
                        "has_technical_founder": has_tech_founder,
                        "ai_ml_signals": ai_signals,
                        "news_mentions": 1,
                    })

            _sleep(1, 2)
        except Exception as exc:
            logger.warning("[L2] Feed %s error: %s", feed_url, exc)

    print(f"[L2] RSS + Gemini AI → {len(discovered)} raw company mentions ({gemini_calls} AI calls)")
    return discovered


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 3 — Serper.dev LinkedIn X-Ray
# ══════════════════════════════════════════════════════════════════════════════

SERPER_LINKEDIN_QUERIES = [
    # Core AI/ML — Ahmedabad
    'site:linkedin.com/company "artificial intelligence" OR "machine learning" "Ahmedabad"',
    'site:linkedin.com/company "generative ai" OR "llm" "Ahmedabad"',
    'site:linkedin.com/company "deep learning" OR "neural network" "Ahmedabad"',
    'site:linkedin.com/company "computer vision" OR "natural language processing" "Ahmedabad"',
    'site:linkedin.com/company "NLP" OR "computer vision" "Ahmedabad"',
    # Core AI/ML — Gujarat & GIFT City
    'site:linkedin.com/company "artificial intelligence" OR "machine learning" "Gujarat"',
    'site:linkedin.com/company "GenAI" OR "LLM" "Gujarat"',
    'site:linkedin.com/company "artificial intelligence" OR "machine learning" "GIFT City"',
    # Core AI/ML — Gandhinagar (IIT-GN ecosystem)
    'site:linkedin.com/company "AI" OR "machine learning" "Gandhinagar"',
    'site:linkedin.com/company "AI startup" "Ahmedabad" OR "Gandhinagar"',
    # AI Sub-domains — high specificity, low false positive rate
    'site:linkedin.com/company "mlops" OR "ml infrastructure" "Ahmedabad" OR "Gujarat"',
    'site:linkedin.com/company "data science" OR "data analytics" "Ahmedabad"',
    'site:linkedin.com/company "AI product" OR "AI platform" "Ahmedabad"',
    'site:linkedin.com/company "conversational AI" OR "chatbot AI" "Ahmedabad"',
    'site:linkedin.com/company "AI research" OR "applied AI" "Gujarat"',
    'site:linkedin.com/company "machine learning" "fintech" "GIFT City"',
    'site:linkedin.com/company "generative AI" "Gujarat" startup',
    'site:linkedin.com/company "deep tech" OR "deeptech" "Ahmedabad"',
    'site:linkedin.com/company "AI" "healthcare" "Ahmedabad" OR "Gujarat"',
    'site:linkedin.com/company "large language model" OR "foundation model" "India" "Ahmedabad"',
    'site:linkedin.com/company "AI" "robotics" OR "autonomous" "Ahmedabad" OR "Gujarat"',
    'site:linkedin.com/company "AI" "supply chain" OR "logistics AI" "Gujarat"',
]


def _serper_search(query: str, num: int = 5) -> list[dict[str, str]]:
    if not SERPER_KEY:
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
    if not SERPER_KEY:
        print("\n[L3] Serper.dev key not set — skipping. Sign up free at serper.dev!")
        return []

    print(f"\n[L3] Serper.dev LinkedIn X-Ray ({len(SERPER_LINKEDIN_QUERIES)} queries)...")
    discovered: list[dict[str, Any]] = []

    for query in SERPER_LINKEDIN_QUERIES:
        results = _serper_search(query, num=5)
        for r in results:
            url = r.get("url", "")
            if "linkedin.com/company" not in url:
                continue
            title = r.get("title", "")
            name = _clean_name(re.split(r"\s*[-|]\s*(LinkedIn|Overview|Company)", title)[0])
            if not _is_valid_name(name):
                continue
            discovered.append({
                "name": name, "location": "Ahmedabad",
                "has_linkedin": True, "linkedin_url": url,
                "source": "Serper LinkedIn X-Ray", "source_url": url,
            })
        _sleep(1, 2)

    print(f"[L3] Serper → {len(discovered)} LinkedIn companies")
    return discovered


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 4 — Directory Intelligence (GoodFirms, TechBehemoths, NASSCOM X-Ray)
# Replaces broken Clutch (Cloudflare-blocked) and NASSCOM (login-gated)
# ══════════════════════════════════════════════════════════════════════════════

def layer4_goodfirms() -> list[dict[str, Any]]:
    """GoodFirms is publicly accessible and has structured AI company listings for Ahmedabad."""
    print("\n[L4] GoodFirms AI Directory (Ahmedabad)...")
    discovered: list[dict[str, Any]] = []
    urls = [
        "https://www.goodfirms.co/artificial-intelligence/ahmedabad",
        "https://www.goodfirms.co/machine-learning/ahmedabad",
        "https://www.goodfirms.co/natural-language-processing/ahmedabad",
        "https://www.goodfirms.co/computer-vision/ahmedabad",
    ]
    for url in urls:
        r = _safe_get(url, timeout=20)
        if not r:
            _sleep(2, 4)
            continue
        soup = BeautifulSoup(r.text, "html.parser")
        # GoodFirms uses structured cards with company names in h4 or .company-name
        for selector in ["h4.company-name", "h4", ".company-name", ".firm-name", "[itemprop='name']"]:
            for tag in soup.select(selector):
                name = _clean_name(tag.get_text(strip=True))
                if _is_valid_name(name) and len(name) > 3:
                    discovered.append({
                        "name": name,
                        "location": "Ahmedabad",
                        "source": "GoodFirms Directory",
                        "source_url": url,
                        "has_website": True,
                    })
        _sleep(2, 4)
    # Deduplicate
    seen: set[str] = set()
    unique = []
    for c in discovered:
        if c["name"].lower() not in seen:
            seen.add(c["name"].lower())
            unique.append(c)
    print(f"[L4] GoodFirms → {len(unique)} companies")
    return unique


def layer4_techbehemoths() -> list[dict[str, Any]]:
    """TechBehemoths has AI companies directory for India, publicly accessible."""
    print("[L4] TechBehemoths AI Directory...")
    discovered: list[dict[str, Any]] = []
    if not SERPER_KEY:
        return discovered
    # Use Serper X-Ray since TechBehemoths uses JS rendering
    queries = [
        'site:techbehemoths.com "artificial intelligence" "Ahmedabad"',
        'site:techbehemoths.com "machine learning" "Ahmedabad"',
        'site:techbehemoths.com "AI" "Gujarat"',
    ]
    for query in queries:
        results = _serper_search(query, num=8)
        for r in results:
            url = r.get("url", "")
            title = r.get("title", "")
            snippet = r.get("snippet", "")
            if "techbehemoths.com" not in url:
                continue
            # Company name is usually in title before the " | TechBehemoths" suffix
            name = _clean_name(re.split(r"\s*[-|]\s*(TechBehemoths|Reviews)", title)[0])
            if not _is_valid_name(name):
                continue
            discovered.append({
                "name": name,
                "location": "Ahmedabad",
                "source": "TechBehemoths Directory",
                "source_url": url,
                "has_website": True,
            })
        _sleep(1, 2)
    seen: set[str] = set()
    unique = []
    for c in discovered:
        if c["name"].lower() not in seen:
            seen.add(c["name"].lower())
            unique.append(c)
    print(f"[L4] TechBehemoths → {len(unique)} companies")
    return unique


def layer4_nasscom_xray() -> list[dict[str, Any]]:
    """NASSCOM members via Serper X-Ray — bypasses login wall."""
    print("[L4] NASSCOM member X-Ray via Serper...")
    discovered: list[dict[str, Any]] = []
    if not SERPER_KEY:
        return discovered
    queries = [
        'site:nasscom.in "Gujarat" OR "Ahmedabad" "artificial intelligence"',
        'site:nasscom.in "AI" "Ahmedabad"',
        'site:nasscom.in "machine learning" "Gujarat"',
    ]
    for query in queries:
        results = _serper_search(query, num=8)
        for r in results:
            url = r.get("url", "")
            title = r.get("title", "")
            if "nasscom.in" not in url:
                continue
            name = _clean_name(re.split(r"\s*[-|]\s*(NASSCOM|Community)", title)[0])
            if not _is_valid_name(name):
                continue
            discovered.append({
                "name": name,
                "location": "Gujarat",
                "source": "NASSCOM X-Ray",
                "source_url": url,
            })
        _sleep(1, 2)
    seen: set[str] = set()
    unique = []
    for c in discovered:
        if c["name"].lower() not in seen:
            seen.add(c["name"].lower())
            unique.append(c)
    print(f"[L4] NASSCOM X-Ray → {len(unique)} companies")
    return unique



# ══════════════════════════════════════════════════════════════════════════════
# LAYER 5 — i-Hub Gujarat
# ══════════════════════════════════════════════════════════════════════════════

def layer5_ihub_gujarat() -> list[dict[str, Any]]:
    print("\n[L5] i-Hub Gujarat (State Government Startup Directory)...")
    discovered: list[dict[str, Any]] = []

    # First try direct scrape
    urls_to_try = ["https://ihubgujarat.in/startups", "https://ihubgujarat.in/portfolio", "https://ihubgujarat.in/ecosystem"]
    for url in urls_to_try:
        r = _safe_get(url, timeout=20)
        if not r:
            _sleep(2, 3)
            continue
        soup = BeautifulSoup(r.text, "html.parser")
        for selector in ["h2", "h3", "h4", ".startup-name", ".company-name", ".portfolio-title", ".card-title", "[class*='startup']", "[class*='company']"]:
            for tag in soup.select(selector):
                text = tag.get_text(strip=True)
                name = _clean_name(text)
                if not _is_valid_name(name) or len(name) < 4:
                    continue
                if name.lower() in {"home", "about", "contact", "team", "news", "events"}:
                    continue
                discovered.append({"name": name, "location": "Ahmedabad", "source": "i-Hub Gujarat", "source_url": url, "govt_verified": True})
        if discovered:
            break
        _sleep(2, 4)

    # Fallback: Serper X-Ray if direct scrape failed (JS-rendered pages)
    if not discovered and SERPER_KEY:
        logger.info("[L5] Direct scrape returned 0 — falling back to Serper X-Ray")
        xray_queries = [
            'site:ihubgujarat.in startup',
            'site:ihubgujarat.in company',
            '"ihub gujarat" OR "i-hub gujarat" AI startup',
        ]
        for query in xray_queries:
            results = _serper_search(query, num=10)
            for r in results:
                url = r.get("url", "")
                title = r.get("title", "")
                name = _clean_name(re.split(r"\s*[-|]\s*(i-Hub|iHub|Gujarat)", title)[0])
                if not _is_valid_name(name) or len(name) < 4:
                    continue
                discovered.append({
                    "name": name,
                    "location": "Gujarat",
                    "source": "i-Hub Gujarat",
                    "source_url": url,
                    "govt_verified": True,
                })
            _sleep(1, 2)

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
# LAYER 6 — GitHub Organization Intelligence (NEW)
# Real developer activity in Ahmedabad — no paid tool has this signal
# ══════════════════════════════════════════════════════════════════════════════

def layer6_github_orgs() -> list[dict[str, Any]]:
    """
    Search GitHub for Python/ML developers in Ahmedabad.
    Extract their 'company' field. Companies where 3+ devs work = real AI company.
    Uses GITHUB_TOKEN if available (5,000 req/hr), otherwise free 60 req/hr.
    """
    print("\n[L6] GitHub Organization Intelligence (real dev activity in Ahmedabad)...")
    company_counter: Counter = Counter()
    company_meta: dict[str, dict] = {}

    search_queries = [
        "location:Ahmedabad machine learning",
        "location:Ahmedabad artificial intelligence",
        "location:Ahmedabad deep learning",
        "location:Ahmedabad llm",
        "location:Ahmedabad pytorch",
        "location:Ahmedabad huggingface",
        "location:Ahmedabad transformers",
        "location:Ahmedabad cuda",
        "location:Gandhinagar machine learning",
    ]

    for q in search_queries:
        try:
            r = requests.get(
                "https://api.github.com/search/users",
                params={"q": q, "per_page": 30},
                headers=_github_headers(),
                timeout=10,
            )
            if r.status_code == 403:
                logger.warning("[L6] GitHub rate limit hit — skipping remaining queries")
                break
            if r.status_code != 200:
                continue

            users = r.json().get("items", [])
            for user in users:
                company_raw = (user.get("company") or "").strip().lstrip("@")
                if not company_raw or len(company_raw) < 3:
                    continue
                # Clean common noise
                if any(noise in company_raw.lower() for noise in ["freelance", "student", "self", "none", "n/a", "github"]):
                    continue
                company_name = _clean_name(company_raw)
                if not _is_valid_name(company_name):
                    continue

                company_counter[company_name] += 1
                if company_name not in company_meta:
                    company_meta[company_name] = {
                        "name": company_name, "location": "Ahmedabad",
                        "source": "GitHub Developer Intelligence",
                        "source_url": f"https://github.com/search?q={requests.utils.quote(q)}&type=users",
                        "github_devs_count": 0,
                    }
                company_meta[company_name]["github_devs_count"] = company_counter[company_name]

            _sleep(1.5, 3)
        except Exception as exc:
            logger.warning("[L6] GitHub query '%s' error: %s", q, exc)

    # Include companies where 1+ developer listed it (Ahmedabad is small; 2 is too strict)
    # But grant score bonuses for 2+ and 3+
    discovered = []
    for company_name, count in company_counter.items():
        if count >= 1:  # Changed from 2 to 1 — small city, 1 dev is still a real signal
            meta = company_meta[company_name].copy()
            meta["has_github"] = True
            github_handle = re.sub(r'\s+', '', company_name).lower()
            meta["github_url"] = f"https://github.com/{github_handle}"
            meta["has_technical_founder"] = True  # Real devs work here
            if count >= 3:
                meta["multi_dev_verified"] = True  # 3+ devs = proven team
            elif count >= 2:
                meta["has_funding"] = meta.get("has_funding", False)  # 2 devs still counts as validated
            discovered.append(meta)

    print(f"[L6] GitHub Intelligence → {len(discovered)} companies")
    return discovered


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 7 — Premier Incubator Portfolios (NEW)
# IIM-A Ventures, IIT Gandhinagar, EDII Gujarat, AIC-GIIC
# Highest quality leads — academic and government vetted
# ══════════════════════════════════════════════════════════════════════════════

INCUBATOR_SOURCES = [
    {
        "name": "IIMA Ventures",
        "urls": ["https://iimaventures.com/portfolio", "https://iimaventures.com/startups", "https://iimaventures.com"],
        "selectors": ["h2", "h3", "h4", ".portfolio-item h3", ".startup-name", ".company-name", "[class*='portfolio'] h3", "[class*='startup'] h3"],
        "location": "Ahmedabad",
    },
    {
        "name": "IIT Gandhinagar Innovation",
        "urls": ["https://iitgn.ac.in/innovation/startups", "https://iitgn.ac.in/innovation", "https://innovation.iitgn.ac.in"],
        "selectors": ["h2", "h3", "h4", ".startup-name", ".portfolio-title", "td"],
        "location": "Gandhinagar",
    },
    {
        "name": "EDII Gujarat",
        "urls": ["https://www.edii.org/startups", "https://www.edii.org/portfolio", "https://edii.org"],
        "selectors": ["h2", "h3", "h4", ".startup", ".company"],
        "location": "Ahmedabad",
    },
    {
        "name": "AIC-GIIC",
        "urls": ["https://aicgiic.com/portfolio", "https://aicgiic.com/startups", "https://aicgiic.com"],
        "selectors": ["h2", "h3", "h4", ".portfolio-item", ".startup-name", "[class*='startup'] h3"],
        "location": "Gandhinagar",
    },
]


def _scrape_incubator(incubator: dict) -> list[dict[str, Any]]:
    discovered = []
    name_label = incubator["name"]
    timeout_per_url = 25  # max 25 seconds per URL, stays within 4-min budget

    for url in incubator["urls"]:
        try:
            r = requests.get(url, headers=_headers(), timeout=timeout_per_url)
            if r.status_code != 200:
                continue

            soup = BeautifulSoup(r.text, "html.parser")

            for selector in incubator["selectors"]:
                for tag in soup.select(selector):
                    text = tag.get_text(strip=True)
                    name = _clean_name(text)
                    if not _is_valid_name(name) or len(name) < 4:
                        continue
                    # Context check — surrounding text should ideally have AI signals
                    # but we trust incubators even without AI keywords (they are pre-vetted)
                    discovered.append({
                        "name": name,
                        "location": incubator["location"],
                        "source": f"Incubator: {name_label}",
                        "source_url": url,
                        "govt_verified": True,       # Academic/govt incubators = top tier trust
                        "incubator_backed": True,    # Special flag for multi-source scoring
                        "has_technical_founder": True,  # All incubator companies have tech founders
                    })

            if discovered:
                break  # Got data, no need to try other URLs for this incubator

        except Exception as exc:
            logger.debug("[L7] %s URL %s failed: %s", name_label, url, exc)
        _sleep(1, 2)

    return discovered


def layer7_incubator_portfolios() -> list[dict[str, Any]]:
    """
    Scrape portfolio pages from Gujarat's premier incubators.
    Uses requests+BeautifulSoup (fast, no Playwright overhead).
    Max 30-sec timeout per incubator = stays well within 4-min budget.
    """
    print("\n[L7] Premier Incubator Portfolios (IIM-A, IIT-GN, EDII, AIC-GIIC)...")
    all_discovered: list[dict[str, Any]] = []

    for incubator in INCUBATOR_SOURCES:
        try:
            found = _scrape_incubator(incubator)
            print(f"[L7]   {incubator['name']} → {len(found)} companies")
            all_discovered += found
        except Exception as exc:
            logger.warning("[L7] %s error: %s", incubator["name"], exc)

    # De-dupe within this layer
    seen: set[str] = set()
    unique = []
    for c in all_discovered:
        key = c["name"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(c)

    print(f"[L7] Incubators Total → {len(unique)} unique companies")
    return unique


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 8 — Hacker News "Who Is Hiring" Thread (NEW)
# Highest hiring intent signal — companies post themselves, 100% authentic
# ══════════════════════════════════════════════════════════════════════════════

def layer8_hackernews_hiring() -> list[dict[str, Any]]:
    """
    Parse Hacker News 'Who is Hiring' monthly thread using the free Algolia HN API.
    Companies that post here are: real, actively hiring AI engineers, tech-forward, funded.
    This is the highest hiring intent signal that exists for tech companies globally.
    """
    print("\n[L8] Hacker News 'Who Is Hiring' Thread (Algolia HN API)...")
    discovered: list[dict[str, Any]] = []

    india_signals = ["india", "ahmedabad", "gujarat", "bangalore", "mumbai", "hyderabad", "bengaluru"]

    try:
        # Find the latest "Ask HN: Who is hiring?" thread
        r = requests.get(
            "https://hn.algolia.com/api/v1/search",
            params={"query": "Ask HN: Who is hiring?", "tags": "story", "hitsPerPage": 3},
            timeout=10,
        )
        if r.status_code != 200:
            print("[L8] HN API unavailable — skipping")
            return discovered

        hits = r.json().get("hits", [])
        if not hits:
            print("[L8] No HN hiring thread found")
            return discovered

        thread_id = hits[0]["objectID"]
        thread_title = hits[0].get("title", "")
        print(f"[L8] Found thread: {thread_title} (ID: {thread_id})")

        # Fetch comments from the thread
        comments_r = requests.get(
            "https://hn.algolia.com/api/v1/search",
            params={
                "tags": f"comment,story_{thread_id}",
                "hitsPerPage": 200,
            },
            timeout=15,
        )
        if comments_r.status_code != 200:
            print("[L8] Could not fetch HN comments — skipping")
            return discovered

        comments = comments_r.json().get("hits", [])
        print(f"[L8] Processing {len(comments)} HN hiring comments...")

        india_hiring_count = 0
        for comment in comments:
            text = (comment.get("comment_text") or "").lower()
            if not text:
                continue

            # Only look at India-relevant posts
            if not any(sig in text for sig in india_signals):
                continue
            if not _has_ai_signal(text):
                continue

            india_hiring_count += 1

            # HN comments typically start with: "CompanyName | Location | Role | ..."
            # Extract company name from the structured format
            raw_text = comment.get("comment_text") or ""
            lines = [line.strip() for line in raw_text.split("\n") if line.strip()]

            company_name = None
            for line in lines[:3]:  # company name is usually in first 3 lines
                # Pattern: "Company Name | Location | ..."
                parts = re.split(r"\s*\|\s*", line)
                if parts:
                    candidate = _clean_name(re.sub(r"<[^>]+>", "", parts[0]).strip())
                    if _is_valid_name(candidate) and len(candidate) > 3:
                        company_name = candidate
                        break

            if not company_name:
                # Fallback: regex extraction from full text
                names = _extract_names_from_text(raw_text)
                if names:
                    company_name = names[0]

            if not company_name:
                continue

            # Extract location hint
            location = "India"
            text_lower = text.lower()
            if "ahmedabad" in text_lower:
                location = "Ahmedabad"
            elif "gandhinagar" in text_lower or "gift" in text_lower:
                location = "Gandhinagar"
            elif "gujarat" in text_lower:
                location = "Gujarat"

            discovered.append({
                "name": company_name,
                "location": location,
                "source": "HN Who's Hiring",
                "source_url": f"https://news.ycombinator.com/item?id={thread_id}",
                "has_technical_founder": True,  # HN posters are always technical founders/CTOs
                "hn_hiring": True,              # Special flag for multi-source confidence
                "news_mentions": 1,
            })

        print(f"[L8] HN Hiring → {india_hiring_count} India AI hiring posts → {len(discovered)} companies")

    except Exception as exc:
        logger.warning("[L8] HN scraper error: %s", exc)

    return discovered


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 9 — HuggingFace Intelligence (NEW)
# ══════════════════════════════════════════════════════════════════════════════

def layer9_huggingface_intelligence() -> list[dict[str, Any]]:
    print("\n[L9] HuggingFace Open Source Intelligence...")
    if not SERPER_KEY:
        return []

    discovered: list[dict[str, Any]] = []
    queries = [
        'site:huggingface.co "Ahmedabad"',
        'site:huggingface.co "Gandhinagar"',
        'site:huggingface.co "GIFT City"',
        'site:huggingface.co "Gujarat"',
    ]

    for query in queries:
        results = _serper_search(query, num=10)
        for r in results:
            url = r.get("url", "")
            title = r.get("title", "")
            
            # Extract Org or Username from HuggingFace URL
            # https://huggingface.co/OrganizationName
            match = re.search(r"huggingface\.co/([^/]+)", url)
            if not match:
                continue
                
            name_raw = match.group(1).replace("-", " ")
            name = _clean_name(name_raw)
            if not _is_valid_name(name) or len(name) < 3:
                continue
                
            # Filter out generic hub/model paths
            if name.lower() in ["models", "datasets", "spaces", "docs", "blog", "pricing", "join", "login", "tasks", "papers"]:
                continue

            discovered.append({
                "name": name, 
                "location": "Ahmedabad",
                "source": "HuggingFace OS Intelligence",
                "source_url": url,
                "has_technical_founder": True,
                "ai_ml_signals": ["huggingface", "open-source models"],
            })
        _sleep(1, 2)

    print(f"[L9] HuggingFace → {len(discovered)} organizations/publishers")
    return discovered


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 10 — Naukri X-Ray (HIGHEST INTENT SIGNAL)
# Companies actively posting AI/ML jobs RIGHT NOW in Ahmedabad
# If they're hiring, they're real, growing, and actively working in AI
# ══════════════════════════════════════════════════════════════════════════════

def layer10_naukri_xray() -> list[dict[str, Any]]:
    """Find AI/ML companies ACTIVELY HIRING in Ahmedabad via Naukri job listings."""
    print("\n[L10] Naukri Job Intelligence (Active AI Hiring)...")
    if not SERPER_KEY:
        return []

    discovered: list[dict[str, Any]] = []
    queries = [
        'site:naukri.com "machine learning engineer" "Ahmedabad"',
        'site:naukri.com "data scientist" "Ahmedabad"',
        'site:naukri.com "AI engineer" "Ahmedabad"',
        'site:naukri.com "NLP engineer" "Ahmedabad" OR "Gandhinagar"',
        'site:naukri.com "computer vision engineer" "Ahmedabad"',
        'site:naukri.com "generative AI" "Ahmedabad" OR "Gujarat"',
        'site:naukri.com "LLM" OR "large language model" "Ahmedabad"',
        'site:naukri.com "deep learning" "Ahmedabad"',
    ]

    for query in queries:
        results = _serper_search(query, num=10)
        for r in results:
            url = r.get("url", "")
            title = r.get("title", "")
            snippet = r.get("snippet", "")
            if "naukri.com" not in url:
                continue

            # Naukri title format: "Job Title at Company Name" or "Company Name - Job Title"
            # Extract company name from title
            company_name = None
            # Pattern 1: "Role at Company" or "Role - Company"
            m = re.search(r"(?:at|@|-|–|by)\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s*[-|]|\s*in\s+|$)", title)
            if m:
                company_name = _clean_name(m.group(1).strip())
            # Pattern 2: Try from snippet
            if not company_name or not _is_valid_name(company_name):
                m2 = re.search(r"Company:\s*([A-Z][A-Za-z0-9\s&.]+?)(?:\s*[-|\n]|$)", snippet)
                if m2:
                    company_name = _clean_name(m2.group(1).strip())

            if not company_name or not _is_valid_name(company_name):
                continue

            # Skip known noise (job aggregators, staffing firms)
            skip_names = {"naukri", "indeed", "linkedin", "foundit", "monster", "timesjobs", "placement", "staffing"}
            if any(noise in company_name.lower() for noise in skip_names):
                continue

            discovered.append({
                "name": company_name,
                "location": "Ahmedabad",
                "source": "Naukri Job Intelligence",
                "source_url": url,
                "has_technical_founder": True,  # AI role posting = technical culture
                "ai_ml_signals": ["active hiring", "ml role"],
                "news_mentions": 1,  # Active hiring = fresh evidence
            })
        _sleep(1, 2)

    # Deduplicate
    seen: set[str] = set()
    unique = []
    for c in discovered:
        if c["name"].lower() not in seen:
            seen.add(c["name"].lower())
            unique.append(c)
    print(f"[L10] Naukri Job Intelligence → {len(unique)} companies actively hiring AI")
    return unique


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 11 — News Intelligence (Funding + Announcement X-Ray)
# Companies that raised money or made announcements in Gujarat AI space
# These are companies with momentum and investor backing
# ══════════════════════════════════════════════════════════════════════════════

def layer11_news_intelligence() -> list[dict[str, Any]]:
    """Extract Gujarat AI companies from funding news and announcements."""
    print("\n[L11] News Intelligence (Funding & Announcement X-Ray)...")
    if not SERPER_KEY:
        return []

    discovered: list[dict[str, Any]] = []
    queries = [
        'site:inc42.com "Ahmedabad" "funding" "AI" OR "machine learning"',
        'site:inc42.com "Gujarat" "raised" "AI" OR "deep tech"',
        'site:yourstory.com "Ahmedabad" "AI" "startup" "funding"',
        'site:yourstory.com "Gujarat" "raised" "machine learning"',
        '"Ahmedabad" "AI startup" "raises" OR "raised" "crore" OR "million" 2024 OR 2025',
        '"Gujarat" "artificial intelligence" "funded" OR "investment" site:entrackr.com',
    ]

    for query in queries:
        results = _serper_search(query, num=10)
        for r in results:
            url = r.get("url", "")
            title = r.get("title", "")
            snippet = r.get("snippet", "")
            combined = f"{title} {snippet}"

            if not _has_ai_signal(combined.lower()):
                continue

            # Use Gemini to extract company names from news snippets
            names = []
            if GEMINI_KEY:
                names = _gemini_extract_companies(combined)
            if not names:
                names = _extract_names_from_text(combined)

            has_funding = any(sig in combined.lower() for sig in FUNDING_SIGNALS)
            ai_signals = [kw for kw in AI_ML_KEYWORDS if kw in combined.lower()]

            for name in names:
                if not _is_valid_name(name):
                    continue
                discovered.append({
                    "name": name,
                    "location": "Ahmedabad",
                    "source": "News Intelligence",
                    "source_url": url,
                    "has_funding": has_funding,
                    "ai_ml_signals": ai_signals,
                    "news_mentions": 1,
                })
        _sleep(1, 2)

    # Deduplicate
    seen: set[str] = set()
    unique = []
    for c in discovered:
        if c["name"].lower() not in seen:
            seen.add(c["name"].lower())
            unique.append(c)
    print(f"[L11] News Intelligence → {len(unique)} companies from funding news")
    return unique


# ══════════════════════════════════════════════════════════════════════════════
# SMART VERIFICATION — Zero Search API calls
# ══════════════════════════════════════════════════════════════════════════════

def verify_company_smart(company: dict[str, Any]) -> dict[str, Any]:
    result = {
        "has_website":           company.get("has_website", False),
        "website_url":           company.get("website"),
        "has_linkedin":          company.get("has_linkedin", False),
        "linkedin_url":          company.get("linkedin_url"),
        "has_github":            company.get("has_github", False),
        "github_url":            company.get("github_url"),
        "has_funding":           company.get("has_funding", False),
        "has_technical_founder": company.get("has_technical_founder", False),
        "news_mentions":         company.get("news_mentions", 0) + (1 if company.get("source", "").startswith("RSS") else 0),
        "ai_ml_signals":         company.get("ai_ml_signals", []),
        "govt_verified":         company.get("govt_verified", False),
        "incubator_backed":      company.get("incubator_backed", False),
        "hn_hiring":             company.get("hn_hiring", False),
        "multi_dev_verified":    company.get("multi_dev_verified", False),
    }

    # Website check is disabled for domain guessing to prevent dangerous false positives.
    # We only trust websites provided by the source.

    # GitHub org check: free GitHub API
    if not result["has_github"]:
        try:
            gh_name = re.sub(r"\s+", "+", company["name"].strip())
            r = requests.get(
                "https://api.github.com/search/repositories",
                params={"q": f"{gh_name}+language:Python", "per_page": 1},
                headers=_github_headers(),
                timeout=8,
            )
            if r.status_code == 200:
                items = r.json().get("items", [])
                if items:
                    owner = items[0].get("owner", {})
                    owner_login = owner.get("login", "")
                    owner_type = owner.get("type", "")
                    org_name = re.sub(r"\s+", "", company["name"]).lower()
                    # strictly verify it's an Organization, not a personal user repo
                    if owner_type == "Organization" and (org_name in owner_login.lower() or owner_login.lower() in org_name):
                        result["has_github"]  = True
                        result["github_url"] = items[0].get("html_url")
        except Exception:
            pass

    return result


# ══════════════════════════════════════════════════════════════════════════════
# MULTI-SOURCE CONFIDENCE ENGINE (NEW)
# Companies found across multiple independent sources are far more likely to be real
# ══════════════════════════════════════════════════════════════════════════════

def apply_multi_source_confidence(companies: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Merge duplicate company names from different sources into a single enriched entry.
    The more sources independently found the same company, the higher the confidence.
    """
    # Group all entries by normalized company name
    grouped: dict[str, list[dict]] = {}
    for c in companies:
        key = c["name"].lower().strip()
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(c)

    merged: list[dict[str, Any]] = []
    for key, entries in grouped.items():
        # Start from the richest entry (most fields filled)
        base = max(entries, key=lambda e: sum(1 for v in e.values() if v))
        
        # Merge all signals from all sources into the base entry
        all_sources = list({e.get("source", "") for e in entries if e.get("source")})
        base["sources_found"] = all_sources
        base["source_count"]  = len(entries)

        # Merge boolean signals from all entries (OR logic — any source finding it = True)
        for entry in entries:
            for field in ["has_funding", "has_linkedin", "has_website", "has_technical_founder",
                          "has_github", "govt_verified", "incubator_backed", "hn_hiring", "multi_dev_verified"]:
                if entry.get(field):
                    base[field] = True
            # Merge LinkedIn URL if not already set
            if entry.get("linkedin_url") and not base.get("linkedin_url"):
                base["linkedin_url"] = entry["linkedin_url"]
            # Merge website URL if not already set
            if entry.get("website") and not base.get("website"):
                base["website"] = entry["website"]
            # Accumulate news mentions
            base["news_mentions"] = base.get("news_mentions", 0) + entry.get("news_mentions", 0)
            # Merge AI signals
            existing = set(base.get("ai_ml_signals", []))
            existing.update(entry.get("ai_ml_signals", []))
            base["ai_ml_signals"] = list(existing)

        merged.append(base)

    return merged


def calculate_score(company: dict[str, Any]) -> int:
    score = 0
    source = company.get("source", "")

    # ── Technical Depth Weighting ──
    if company.get("has_github"):            score += 40
    if company.get("has_technical_founder"): score += 30
    if company.get("has_funding"):           score += 20
    if company.get("govt_verified"):         score += 15
    if company.get("has_linkedin"):          score += 10
    if company.get("news_mentions", 0) > 0:  score += 5
    if company.get("has_website"):           score += 5

    # AI Signal Keywords
    if company.get("ai_ml_signals"):         score += 40

    # ── Source-Specific Intent Bonuses (NEW) ──
    if "Serper LinkedIn X-Ray" in source:
        score += 20  # Found via explicit AI LinkedIn search
    if "Naukri Job Intelligence" in source:
        score += 25  # Actively hiring AI roles = confirmed real + growing
    if "News Intelligence" in source:
        score += 20  # Media coverage = established company
    if "HuggingFace" in source:
        score += 30  # Publishing AI models = proven technical depth
    if "GoodFirms" in source or "TechBehemoths" in source:
        score += 5   # Reviewed directory listing
    if "NASSCOM" in source:
        score += 10  # Industry body member

    # ── Multi-Source Confidence Bonuses ──
    source_count = company.get("source_count", 1)
    if source_count >= 4:
        score += 40   # Found in 4+ independent sources = extremely high confidence
    elif source_count >= 3:
        score += 30   # Found in 3+ independent sources = almost certainly real
    elif source_count == 2:
        score += 15   # Found in 2 sources = high confidence

    if company.get("incubator_backed"):      score += 40   # IIM-A / IIT-GN says it's legit
    if company.get("hn_hiring"):             score += 40   # Self-posted on HN = confirmed hiring now
    if company.get("multi_dev_verified"):    score += 40   # 3+ devs on GitHub = proven team

    return min(score, 100)


def has_red_flags(company: dict[str, Any]) -> bool:
    # Phase 4: Anti-Agency Filter — check SOURCE URL and AI signals, NOT company name
    # This avoids false positives where the company name contains agency-sounding words
    source_text = (company.get("source_url", "") + " " + " ".join(company.get("ai_ml_signals", []))).lower()
    anti_keywords = [
        "seo agency", "digital marketing agency", "bpo", "call center", "data entry",
        "magento developer", "wordpress developer", "shopify developer",
        "web design company", "mobile app development company",
        "erp implementation", "sap implementation", "salesforce customization"
    ]
    agency_hits = sum(1 for kw in anti_keywords if kw in source_text)
    if agency_hits >= 1:  # Even 1 agency keyword in source context = flag
        logger.info("[skip] Anti-Agency Filter triggered: %s", company.get("name"))
        return True

    # Always trust these high-authority sources — no red flags possible
    if company.get("incubator_backed"):   return False
    if company.get("govt_verified"):      return False
    if company.get("hn_hiring"):          return False
    if company.get("multi_dev_verified"): return False

    # Phase 1 Fix: Decouple missing data from Red Flags.
    # The only real red flag is if they have ZERO online presence across all channels.
    if not company.get("has_website") and not company.get("has_linkedin") and not company.get("has_github"):
        return True  # Total ghost — no online presence whatsoever

    return False


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main(dry_run: bool = False) -> int:
    print("=" * 70)
    print("  HireSense — God-Level++ Company Discovery (8-Layer Pipeline)")
    print("=" * 70)

    client = None if dry_run else get_supabase_client()
    if dry_run:
        print("[DRY RUN] No data will be written to the database.\n")

    # ── Gather from all 8 layers ───────────────────────────────────────────
    all_discovered: list[dict[str, Any]] = []
    all_discovered += layer1_startup_india()
    all_discovered += layer1_india_ai()
    all_discovered += layer2_rss_feeds()
    all_discovered += layer3_serper_linkedin()
    all_discovered += layer4_goodfirms()       # Replaces broken Clutch (Cloudflare-blocked)
    all_discovered += layer4_techbehemoths()   # Replaces broken NASSCOM (login-gated)
    all_discovered += layer4_nasscom_xray()    # NASSCOM members via Serper X-Ray
    all_discovered += layer5_ihub_gujarat()
    all_discovered += layer6_github_orgs()
    all_discovered += layer7_incubator_portfolios()
    all_discovered += layer8_hackernews_hiring()
    all_discovered += layer9_huggingface_intelligence()
    all_discovered += layer10_naukri_xray()      # NEW: Active AI hiring companies
    all_discovered += layer11_news_intelligence() # NEW: Funded/announced AI companies

    # ── Apply Multi-Source Confidence Engine ───────────────────────────────
    print("\n[ENGINE] Applying multi-source confidence scoring...")
    all_discovered = apply_multi_source_confidence(all_discovered)

    # Sort: multi-source companies (found in 2+ sources) first
    all_discovered.sort(key=lambda c: c.get("source_count", 1), reverse=True)

    multi_source_count = sum(1 for c in all_discovered if c.get("source_count", 1) >= 2)
    print(f"[ENGINE] {len(all_discovered)} unique companies ({multi_source_count} multi-source validated)")

    print(f"\n{'='*70}")
    print(f"  Total unique raw companies: {len(all_discovered)}")
    print(f"  Multi-source validated:     {multi_source_count}")
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

    for company in all_discovered:
        try:
            name_lower = company["name"].lower()
            if name_lower in already_discovered or name_lower in already_watchlist:
                continue

            _sleep(0.5, 1.5)
            verification = verify_company_smart(company)
            company.update(verification)

            if has_red_flags(company):
                logger.info("[skip] Red flags: %s", company["name"])
                continue

            score = calculate_score(company)
            tier = "high" if score >= 70 else "medium" if score >= 40 else "low"

            if score < 25:
                logger.info("[skip] Low score (%d): %s", score, company["name"])
                continue

            sources_str = ", ".join(company.get("sources_found", [company.get("source", "?")]))
            print(f"[save] {company['name']} | score={score} ({tier}) | sources={company.get('source_count',1)} | {sources_str[:60]}")

            if dry_run:
                new_found += 1
                continue

            if client:
                client.table("discovered_companies").insert({
                    "name":                  company["name"],
                    "location":              company.get("location"),
                    "website":               company.get("website_url") or company.get("website"),
                    "linkedin_url":          company.get("linkedin_url"),
                    "github_url":            company.get("github_url"),
                    "has_website":           company.get("has_website", False),
                    "has_linkedin":          company.get("has_linkedin", False),
                    "has_github":            company.get("has_github", False),
                    "has_funding":           company.get("has_funding", False),
                    "has_technical_founder": company.get("has_technical_founder", False),
                    "news_mentions":         company.get("news_mentions", 0),
                    "ai_ml_signals":         ", ".join(company.get("ai_ml_signals", [])),
                    "source":                ", ".join(company.get("sources_found", [company.get("source", "?")])),
                    "source_url":            company.get("source_url"),
                    "potential_score":       score,
                    "potential_tier":        tier,
                    "raw_data":              {k: v for k, v in company.items() if isinstance(v, (str, int, float, bool, list, type(None)))},
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
    parser = argparse.ArgumentParser(description="HireSense God-Level++ Company Discovery")
    parser.add_argument("--dry-run", action="store_true", help="Run without writing to database")
    args = parser.parse_args()
    raise SystemExit(main(dry_run=args.dry_run))

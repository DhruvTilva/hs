"""
scrapers/indeed_scraper.py — god-level Indeed India AI/ML job scraper
"""
from __future__ import annotations

import json
import random
import re
import sys
import time
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import requests
from bs4 import BeautifulSoup

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
)

# ─────────────────────────────────────────────────────────────
# PART 1 — KEYWORDS & LOCATIONS
# ─────────────────────────────────────────────────────────────

PRIMARY_KEYWORDS: list[str] = [
    "AI engineer",
    "ML engineer",
    "machine learning engineer",
    "artificial intelligence engineer",
    "deep learning engineer",
    "AI developer",
    "ML developer",
    "data scientist",
    "senior data scientist",
    "lead data scientist",
    "data science engineer",
    "applied scientist",
    "data analyst AI",
    "generative AI engineer",
    "GenAI engineer",
    "LLM engineer",
    "large language model engineer",
    "prompt engineer",
    "AI product engineer",
    "foundation model engineer",
    "conversational AI engineer",
    "NLP engineer",
    "natural language processing engineer",
    "computer vision engineer",
    "MLOps engineer",
    "ML platform engineer",
    "AI infrastructure engineer",
    "model deployment engineer",
    "recommendation systems engineer",
    "AI researcher",
    "ML researcher",
    "research scientist AI",
    "research engineer machine learning",
    "AI research analyst",
    "applied AI engineer",
    "applied machine learning",
    "AI solutions architect",
    "AI architect",
    "ML architect",
    "AI consultant",
    "PyTorch engineer",
    "TensorFlow engineer",
    "LangChain engineer",
    "RAG engineer",
    "vector database engineer",
    "Hugging Face engineer",
    "MLflow engineer",
    "transformer engineer",
    "reinforcement learning",
    "neural network engineer",
    "machine learning",
    "artificial intelligence",
    "deep learning",
    "data science",
]

LOCATIONS_PRIMARY: list[str] = [
    "Ahmedabad",
    "Gandhinagar",
    "GIFT City",
    "Gujarat",
    "Ahmedabad, Gujarat",
]

LOCATIONS_REMOTE: list[str] = [
    "Work from home",
    "Remote",
]

BASE_URL = "https://in.indeed.com/jobs"
DETAIL_BASE = "https://in.indeed.com/viewjob"

# ─────────────────────────────────────────────────────────────
# PART 4 — HEADER SETS
# ─────────────────────────────────────────────────────────────

HEADER_SETS: list[dict[str, str]] = [
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-IN,en-GB;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
    },
    {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9,gu;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
    },
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
    },
    {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    },
    {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
    },
]

# ─────────────────────────────────────────────────────────────
# PART 7 — FILTER CONSTANTS
# ─────────────────────────────────────────────────────────────

_AI_WORDS: list[str] = [
    "ai", " ml ", "machine learning", "data scien", "deep learning",
    "neural", "nlp", "computer vision", "mlops", "llm", "genai",
    "generative", "artificial intelligence", "data engineer",
    "research engineer", "applied scientist", "prompt",
    "langchain", "pytorch", "tensorflow", "hugging", "rag",
    "vector", "analytics engineer", "algorithm", "model train",
    "predictive", "forecasting", "transformer", "reinforcement",
    "feature engineer", "recommendation", "classification",
    "image recogni", "speech recogni", "ocr", "chatbot",
]

_NOISE_TITLES: list[str] = [
    "sales manager", "business development", "marketing manager",
    "hr manager", "human resource", "accountant", "finance manager",
    "customer support", "receptionist", "telecaller",
    "content writer", "graphic design", "social media",
    "civil engineer", "mechanical engineer", "electrical engineer",
    "field executive", "delivery", "driver",
]

_LOCATION_SIGNALS: list[str] = [
    "ahmedabad", "gandhinagar", "gift", "gujarat", "gujrat",
    "india", "remote", "work from home", "wfh", "anywhere", "hybrid",
]

_TECH_SKILLS: list[str] = [
    "python", "pytorch", "tensorflow", "keras", "scikit-learn",
    "langchain", "langgraph", "llama", "openai", "anthropic",
    "hugging face", "transformers", "bert", "gpt", "gemini",
    "rag", "vector database", "pinecone", "weaviate", "qdrant",
    "mlflow", "airflow", "kubeflow", "ray", "dask",
    "spark", "sql", "postgresql", "mongodb", "redis",
    "docker", "kubernetes", "aws", "gcp", "azure",
    "fastapi", "flask", "django", "streamlit",
    "git", "ci/cd", "rest api", "graphql",
    "r", "scala", "java", "c++", "julia",
    "computer vision", "opencv", "yolo",
    "nlp", "spacy", "nltk", "llm", "fine-tuning",
    "reinforcement learning", "generative ai", "diffusion models",
    "pandas", "numpy", "matplotlib", "seaborn",
]

_TARGET_STACK: list[str] = [
    "python", "pytorch", "tensorflow", "langchain", "llm",
    "transformers", "hugging face", "openai", "rag",
    "vector", "mlflow", "kubernetes", "docker", "fastapi",
]

_SUFFIX_RE = re.compile(
    r"\b(pvt\.?|ltd\.?|private|limited|inc\.?|corp\.?|llp\.?|technologies|solutions|tech|services)\b",
    re.IGNORECASE,
)

# ─────────────────────────────────────────────────────────────
# SESSION MANAGEMENT
# ─────────────────────────────────────────────────────────────

def create_fresh_session() -> tuple[requests.Session, dict[str, str]]:
    session = requests.Session()
    headers = random.choice(HEADER_SETS).copy()
    try:
        session.get("https://in.indeed.com", headers=headers, timeout=15)
        time.sleep(random.uniform(1.0, 2.0))
    except Exception:
        pass
    return session, headers


# ─────────────────────────────────────────────────────────────
# PART 5 — FETCH WITH RETRY + BLOCK DETECTION
# ─────────────────────────────────────────────────────────────

_BLOCK_SIGNALS: list[str] = [
    "please verify you are a human",
    "captcha",
    "unusual traffic",
    "access denied",
    "blocked",
    "robots.txt",
    "/challenge",
]


def fetch_page(
    url: str,
    session: requests.Session,
    headers: dict[str, str],
    params: dict[str, Any] | None = None,
    max_retries: int = 3,
    stats: dict[str, Any] | None = None,
) -> tuple[str | None, requests.Session, dict[str, str]]:
    for attempt in range(max_retries):
        try:
            resp = session.get(url, params=params, headers=headers, timeout=25, allow_redirects=True)

            if resp.status_code == 429:
                wait = 45.0 + random.uniform(10, 20)
                print(f"  ⏸  429 rate-limit — waiting {wait:.0f}s")
                if stats is not None:
                    stats["blocked_count"] += 1
                time.sleep(wait)
                continue

            if resp.status_code in (403, 503):
                session, headers = create_fresh_session()
                wait = (2 ** attempt) * 5 + random.uniform(2, 5)
                print(f"  ⚠  HTTP {resp.status_code} — fresh session, waiting {wait:.1f}s")
                if stats is not None:
                    stats["blocked_count"] += 1
                time.sleep(wait)
                continue

            if resp.status_code != 200:
                continue

            html = resp.text
            if any(sig in html.lower() for sig in _BLOCK_SIGNALS):
                print("  ⚠  block page detected (200 but CAPTCHA/challenge)")
                if stats is not None:
                    stats["blocked_count"] += 1
                time.sleep(30.0 + random.uniform(5, 15))
                continue

            if len(html) < 5000:
                continue

            return html, session, headers

        except (requests.Timeout, requests.ConnectionError) as exc:
            wait = 2 ** attempt + random.uniform(1, 3)
            print(f"  ✗  network error ({exc}) — retrying in {wait:.1f}s")
            time.sleep(wait)

    return None, session, headers


# ─────────────────────────────────────────────────────────────
# PART 6 — DATA EXTRACTION (Modes A + B + C)
# ─────────────────────────────────────────────────────────────

def _extract_salary_from_attributes(attrs: list[dict[str, Any]]) -> str:
    for attr in attrs:
        label = str(attr.get("label", "")).lower()
        if "salary" in label or "₹" in label or "lpa" in label or "ctc" in label:
            return str(attr.get("label", ""))
    return ""


def extract_jobs_mosaic(html: str) -> tuple[list[dict[str, Any]], int]:
    """MODE A — extract jobs from embedded window.mosaic JSON. Returns (jobs, total_count)."""
    pattern = r'window\.mosaic\.providerData\["mosaic-provider-jobcards"\]=(\{.+?\});'
    match = re.search(pattern, html, re.DOTALL)
    if not match:
        return [], 0
    try:
        data = json.loads(match.group(1))
        model = data["metaData"]["mosaicProviderJobCardsModel"]
        results: list[dict[str, Any]] = model.get("results") or []
        tier_summaries: list[dict[str, Any]] = model.get("tierSummaries") or []
        total = sum(int(t.get("jobCount", 0)) for t in tier_summaries)
    except (KeyError, ValueError, TypeError):
        return [], 0

    jobs: list[dict[str, Any]] = []
    for r in results:
        job_key = str(r.get("jobkey") or r.get("jobKey") or "")
        if not job_key:
            continue

        title = str(r.get("displayTitle") or r.get("title") or "").strip()
        company = str(r.get("company") or "").strip()
        raw_loc = r.get("formattedLocation") or (
            (r.get("jobLocationCity") or "") + ", " + (r.get("jobLocationState") or "")
        )
        location = str(raw_loc).strip(", ").strip()

        posted_text = str(r.get("formattedRelativeTime") or "")
        salary = str(r.get("salary") or _extract_salary_from_attributes(r.get("taxonomyAttributes") or []))

        job_types: list[str] = [
            attr.get("label", "")
            for attr in (r.get("taxonomyAttributes") or [])
            if attr.get("label") in ("Full-time", "Part-time", "Contract", "Internship")
        ]

        remote_model = r.get("remoteWorkModel") or {}
        remote_flag = str(r.get("remoteLocation") or remote_model.get("text") or "")
        sponsored = bool(r.get("sponsored"))
        urgency = str(r.get("urgencyLabel") or "")
        rating_model = r.get("ratingModel") or {}
        company_rating = rating_model.get("ratingValue")
        snippet = str(r.get("snippet") or "")[:300]

        jobs.append({
            "job_key": job_key,
            "title": title,
            "company": company,
            "location": location,
            "posted_text": posted_text,
            "salary": salary,
            "job_types": ", ".join(job_types),
            "remote_flag": remote_flag,
            "sponsored": sponsored,
            "urgency": urgency,
            "company_rating": company_rating,
            "snippet": snippet,
            "apply_url": f"{DETAIL_BASE}?jk={job_key}",
            "_mode": "mosaic",
        })

    return jobs, total


def extract_jobs_html(html: str) -> list[dict[str, Any]]:
    """MODE B — BeautifulSoup HTML card parsing fallback."""
    soup = BeautifulSoup(html, "html.parser")
    jobs: list[dict[str, Any]] = []

    containers = (
        soup.select("div.job_seen_beacon")
        or soup.select("div.slider_container")
        or soup.select("li.css-1ac2h1w")
        or soup.select("div[class*='jobCard']")
        or soup.select("div.result")
    )

    for card in containers:
        # Title
        title_node = (
            card.select_one("h2.jobTitle > a")
            or card.select_one("a[data-jk]")
            or card.select_one("td.resultContent h2 a")
            or card.select_one("h2 span[title]")
        )
        if not title_node:
            continue
        title = " ".join(title_node.get_text(" ").split())
        href = str(title_node.get("href") or "")

        # job_key from href
        jk_match = re.search(r"jk=([a-z0-9]+)", href)
        if not jk_match:
            # try data-jk attribute
            jk_val = title_node.get("data-jk") or card.find(attrs={"data-jk": True})
            job_key = str(jk_val.get("data-jk") if hasattr(jk_val, "get") else jk_val or "")
        else:
            job_key = jk_match.group(1)

        # Company
        company_node = (
            card.select_one("[data-testid='company-name']")
            or card.select_one("span.companyName")
            or card.select_one("a[data-tn-element='companyName']")
        )
        company = " ".join(company_node.get_text(" ").split()) if company_node else ""

        # Location
        loc_node = (
            card.select_one("[data-testid='text-location']")
            or card.select_one("div.companyLocation")
            or card.select_one("[data-testid='job-location']")
        )
        location = " ".join(loc_node.get_text(" ").split()) if loc_node else ""

        # Posted
        date_node = (
            card.select_one("span.date")
            or card.select_one("[data-testid='myJobsStateDate']")
            or card.select_one("span[class*='date']")
        )
        posted_text = " ".join(date_node.get_text(" ").split()) if date_node else ""

        # Salary
        salary_node = (
            card.select_one("[data-testid='attribute_snippet_testid']")
            or card.select_one(".salary-snippet-container")
            or card.select_one("div[class*='salary']")
            or card.select_one(".metadata.salary-snippet")
        )
        salary = " ".join(salary_node.get_text(" ").split()) if salary_node else ""

        if not title:
            continue

        jobs.append({
            "job_key": job_key,
            "title": title,
            "company": company,
            "location": location,
            "posted_text": posted_text,
            "salary": salary,
            "job_types": "",
            "remote_flag": "",
            "sponsored": False,
            "urgency": "",
            "company_rating": None,
            "snippet": "",
            "apply_url": f"{DETAIL_BASE}?jk={job_key}" if job_key else f"https://in.indeed.com{href}",
            "_mode": "html",
        })

    return jobs


def extract_job_detail(html: str) -> dict[str, Any]:
    """MODE C — extract enriched data from individual job detail page."""
    soup = BeautifulSoup(html, "html.parser")

    desc_node = soup.find("div", id="jobDescriptionText") or soup.find(
        "div", class_=re.compile(r"jobDescription", re.I)
    )
    full_desc = desc_node.get_text(" ", strip=True) if desc_node else ""
    description_500 = full_desc[:500]

    skills = extract_skills_from_text(full_desc)

    benefits_node = soup.find("div", id="benefits")
    benefits = benefits_node.get_text(" ", strip=True)[:200] if benefits_node else ""

    rating_node = soup.find("span", class_=re.compile(r"rating", re.I)) or soup.find(
        "div", attrs={"data-testid": "ratingsDisplay"}
    )
    company_rating_detail = rating_node.get_text(strip=True) if rating_node else ""

    applicants_node = soup.find(string=re.compile(r"\d+\s+(applicant|people\s+clicked)", re.I))
    applicant_count = applicants_node.strip() if applicants_node else ""

    exp_match = re.search(
        r"(\d+)\+?\s*(?:to\s*\d+\s*)?year[s]?\s*(?:of\s*)?(?:experience|exp)",
        full_desc, re.IGNORECASE,
    )
    experience = exp_match.group(0) if exp_match else ""

    return {
        "full_description": description_500,
        "skills": skills,
        "benefits": benefits,
        "company_rating_detail": company_rating_detail,
        "applicant_count": applicant_count,
        "experience": experience,
    }


def extract_skills_from_text(text: str) -> str:
    found = [s for s in _TECH_SKILLS if s.lower() in text.lower()]
    return ", ".join(found)


def extract_jobs_from_page(html: str, stats: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    """Try MODE A first, fall back to MODE B."""
    jobs, total = extract_jobs_mosaic(html)
    if jobs:
        stats["total_mosaic_success"] += 1
        return jobs, total
    jobs = extract_jobs_html(html)
    if jobs:
        stats["total_html_fallback"] += 1
    return jobs, 0


# ─────────────────────────────────────────────────────────────
# PART 7 — FILTER HELPERS
# ─────────────────────────────────────────────────────────────

def ai_signal_check(title: str, snippet: str) -> bool:
    text = (title + " " + snippet).lower()
    return any(word in text for word in _AI_WORDS)


def is_noise_title(title: str) -> bool:
    t = title.lower()
    return any(n in t for n in _NOISE_TITLES)


def location_relevant_check(location: str) -> bool:
    loc = location.lower()
    return any(sig in loc for sig in _LOCATION_SIGNALS)


def parse_hours_old(posted_text: str) -> float | None:
    text = posted_text.lower().strip()
    if not text:
        return None
    if "just posted" in text or "today" in text:
        return 4.0
    if "30+" in text or "30 days" in text:
        return 999.0
    m = re.search(r"(\d+)\s*(hour|day|minute)", text)
    if not m:
        return None
    val = int(m.group(1))
    unit = m.group(2)
    if "minute" in unit:
        return val / 60.0
    if "hour" in unit:
        return float(val)
    if "day" in unit:
        return float(val * 24)
    return None


def clean_company(name: str) -> str:
    return _SUFFIX_RE.sub("", name.lower()).strip()


# ─────────────────────────────────────────────────────────────
# PART 8 — BONUS SCORING
# ─────────────────────────────────────────────────────────────

def compute_indeed_bonus(job: dict[str, Any]) -> int:
    bonus = 0

    if job.get("salary") and str(job["salary"]).lower() not in ("", "not disclosed"):
        bonus += 4

    if job.get("benefits"):
        bonus += 2

    if "urgent" in str(job.get("urgency", "")).lower():
        bonus += 5

    remote = str(job.get("remote_flag", "")).lower()
    if "remote" in remote or "work from home" in remote:
        bonus += 3
    elif "hybrid" in remote:
        bonus += 2

    if job.get("sponsored"):
        bonus += 2

    try:
        rating = float(str(job.get("company_rating") or job.get("company_rating_detail") or "0").replace(",", "."))
        if rating >= 4.0:
            bonus += 4
        elif rating >= 3.5:
            bonus += 2
    except (ValueError, TypeError):
        pass

    skills_text = str(job.get("skills", "")).lower()
    desc_text = str(job.get("full_description", "")).lower()
    matched = sum(1 for s in _TARGET_STACK if s in skills_text or s in desc_text)
    bonus += min(matched * 2, 8)

    applicants_text = str(job.get("applicant_count", ""))
    m = re.search(r"(\d+)", applicants_text)
    if m:
        n = int(m.group(1))
        if n < 10:
            bonus += 6
        elif n < 25:
            bonus += 3

    return min(bonus, 20)


# ─────────────────────────────────────────────────────────────
# PART 9 — DEDUPLICATION
# ─────────────────────────────────────────────────────────────

def job_key_exists(client: Any, job_key: str) -> bool:
    """Check if this Indeed job_key was already inserted."""
    if not client or not job_key:
        return False
    try:
        result = (
            client.table("opportunities")
            .select("id")
            .eq("source", "indeed")
            .filter("raw_data->>job_key", "eq", job_key)
            .limit(1)
            .execute()
        )
        return bool(result.data)
    except Exception:
        return False


def find_cross_source_duplicate(client: Any, company_name: str, role_title: str, days: int = 7) -> list[str]:
    if not client:
        return []
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    try:
        result = (
            client.table("opportunities")
            .select("source")
            .eq("company_name", company_name)
            .eq("role_title", role_title)
            .gte("found_at", cutoff)
            .execute()
        )
        return [row["source"] for row in (result.data or []) if row.get("source")]
    except Exception:
        return []


def insert_with_dedup(client: Any, opp: Opportunity, job_key: str, stats: dict[str, Any]) -> bool:
    if client is None:
        stats["total_inserted"] += 1
        return True

    # 1. Job key dedup (most reliable)
    if job_key and job_key_exists(client, job_key):
        stats["total_skipped_duplicate"] += 1
        return False

    # 2. Exact same-source dedup
    exact = find_recent_duplicate(client, opp, days=7, source_scoped=True)
    if exact:
        stats["total_skipped_duplicate"] += 1
        return False

    # 3. Cross-source annotation
    other_sources = find_cross_source_duplicate(client, opp.company_name, opp.role_title or "", days=7)
    raw = dict(opp.raw_data or {})
    if other_sources:
        raw["also_found_on"] = other_sources

    opp = Opportunity(
        company_name=opp.company_name,
        role_title=opp.role_title,
        location=opp.location,
        source=opp.source,
        signal_type=opp.signal_type,
        apply_url=opp.apply_url,
        priority_score=opp.priority_score,
        freshness_score=opp.freshness_score,
        raw_data=raw,
    )

    try:
        client.table("opportunities").insert(asdict(opp)).execute()
        stats["total_inserted"] += 1
        return True
    except Exception as exc:
        stats.setdefault("_errors", []).append(f"insert error: {exc}")
        return False


# ─────────────────────────────────────────────────────────────
# CORE PROCESSING
# ─────────────────────────────────────────────────────────────

def process_job(
    job: dict[str, Any],
    keyword: str,
    search_location: str,
    client: Any,
    company_tiers: dict[str, int | None],
    stats: dict[str, Any],
    pending_detail: list[dict[str, Any]],
) -> None:
    """Filter, score, and insert a single extracted job dict."""
    title = job.get("title", "").strip()
    company = job.get("company", "").strip()

    if not title or len(title) < 3 or not company:
        return
    if is_noise_title(title):
        stats["total_skipped_noise"] += 1
        return
    if not ai_signal_check(title, job.get("snippet", "")):
        stats["total_skipped_no_ai_signal"] += 1
        return

    location = job.get("location") or search_location
    if not location_relevant_check(location):
        return

    hours_old = parse_hours_old(job.get("posted_text", ""))
    if hours_old is not None and hours_old > 72:
        stats["total_skipped_old"] += 1
        return

    h = hours_old if hours_old is not None else 24.0
    company_tier = company_tiers.get(clean_company(company))
    base_score = calculate_priority_score("normal", h, title, location, company_tier)
    bonus = compute_indeed_bonus(job)
    final_score = min(base_score + bonus, 100)

    if h <= 4:
        freshness = 35
    elif h <= 12:
        freshness = 30
    elif h <= 24:
        freshness = 25
    else:
        freshness = 15

    job_key = job.get("job_key", "")
    raw: dict[str, Any] = {
        "job_key": job_key,
        "keyword": keyword,
        "search_location": search_location,
        "salary": job.get("salary"),
        "job_types": job.get("job_types"),
        "remote_flag": job.get("remote_flag"),
        "sponsored": job.get("sponsored"),
        "urgency": job.get("urgency"),
        "company_rating": job.get("company_rating"),
        "snippet": job.get("snippet"),
        "hours_old": round(h, 2),
        "extraction_mode": job.get("_mode", "unknown"),
    }

    opp = Opportunity(
        company_name=company,
        role_title=title,
        location=location,
        source="indeed",
        signal_type="normal",
        apply_url=job.get("apply_url"),
        priority_score=final_score,
        freshness_score=freshness,
        raw_data=raw,
    )

    inserted = insert_with_dedup(client, opp, job_key, stats)
    stats["total_jobs_found"] += 1

    # Queue for detail enrichment if score is high enough
    if inserted and final_score > 45 and job_key:
        pending_detail.append({**job, "raw": raw, "base_score": base_score})


def run_search(
    keyword: str,
    location: str,
    session: requests.Session,
    headers: dict[str, str],
    client: Any,
    company_tiers: dict[str, int | None],
    stats: dict[str, Any],
    pending_detail: list[dict[str, Any]],
    *,
    start: int = 0,
    fromage: int = 3,
    extra_params: dict[str, Any] | None = None,
) -> tuple[int, requests.Session, dict[str, str]]:
    """Fetch one search results page and process all jobs. Returns (total_count, session, headers)."""
    params: dict[str, Any] = {
        "q": keyword,
        "l": location,
        "sort": "date",
        "fromage": str(fromage),
        "filter": "0",
        "start": start,
        "radius": "50",
    }
    if extra_params:
        params.update(extra_params)

    stats["total_requests"] += 1
    stats["pages_scraped"] += 1

    html, session, headers = fetch_page(BASE_URL, session, headers, params=params, stats=stats)
    if not html:
        stats.setdefault("_errors", []).append(f"{keyword}/{location} start={start}: no response")
        print(f"  ✗  {keyword!r} / {location!r} start={start} → no response")
        return 0, session, headers

    jobs, total = extract_jobs_from_page(html, stats)
    mode = jobs[0].get("_mode", "?") if jobs else "empty"

    inserted_before = stats["total_inserted"]
    for job in jobs:
        process_job(job, keyword, location, client, company_tiers, stats, pending_detail)

    inserted_this = stats["total_inserted"] - inserted_before
    print(f"  ✓  {keyword!r} / {location!r} start={start} [{mode}] → {len(jobs)} jobs ({inserted_this} inserted)")
    return total, session, headers


# ─────────────────────────────────────────────────────────────
# PART 10 — RUN STRATEGY
# ─────────────────────────────────────────────────────────────

def main() -> int:
    print("🚀 Indeed Scraper starting...")

    client = get_supabase_client()
    if client is None:
        log_scraper_run(client, "indeed_scraper", "dry_run", 0, None)
        print("✅ Indeed Scraper done. (dry run)")
        return 0

    company_tiers: dict[str, int | None] = {}
    try:
        rows = client.table("companies").select("name, tier").execute().data or []
        company_tiers = {
            clean_company(str(r["name"])): r.get("tier")
            for r in rows if r.get("name")
        }
    except Exception as exc:
        print(f"Warning: could not load company tiers: {exc}")

    stats: dict[str, Any] = {
        "total_requests": 0,
        "total_mosaic_success": 0,
        "total_html_fallback": 0,
        "total_detail_fetches": 0,
        "total_jobs_found": 0,
        "total_inserted": 0,
        "total_skipped_duplicate": 0,
        "total_skipped_no_ai_signal": 0,
        "total_skipped_old": 0,
        "total_skipped_noise": 0,
        "blocked_count": 0,
        "keywords_covered": 0,
        "pages_scraped": 0,
    }

    pending_detail: list[dict[str, Any]] = []
    request_counter = 0

    session, headers = create_fresh_session()

    def _sleep_between(lo: float = 2.0, hi: float = 4.0) -> None:
        nonlocal request_counter, session, headers
        request_counter += 1
        if request_counter % 20 == 0:
            cool = random.uniform(10, 18)
            print(f"  ⏸  cooling + rotating session after {request_counter} requests ({cool:.1f}s)…")
            time.sleep(cool)
            session, headers = create_fresh_session()
        else:
            time.sleep(random.uniform(lo, hi))

    # ── PASS 1: Primary keywords × Gujarat locations (pages 1–3) ──
    print("\n=== PASS 1: Primary keywords × Gujarat locations ===")
    for keyword in PRIMARY_KEYWORDS[:20]:
        stats["keywords_covered"] += 1
        for location in LOCATIONS_PRIMARY:
            total, session, headers = run_search(keyword, location, session, headers, client, company_tiers, stats, pending_detail, start=0, fromage=3)
            _sleep_between(2.0, 4.0)
            if total > 10:
                total, session, headers = run_search(keyword, location, session, headers, client, company_tiers, stats, pending_detail, start=10, fromage=3)
                _sleep_between(1.5, 3.0)
            if total > 20:
                _, session, headers = run_search(keyword, location, session, headers, client, company_tiers, stats, pending_detail, start=20, fromage=3)
                _sleep_between(1.5, 3.0)

    # ── PASS 2: Fresh (24h) + exact-match variant for top 15 keywords ──
    print("\n=== PASS 2: Last-24h + exact-match variants (Ahmedabad) ===")
    for keyword in PRIMARY_KEYWORDS[:15]:
        # Last 24h
        _, session, headers = run_search(keyword, "Ahmedabad", session, headers, client, company_tiers, stats, pending_detail, start=0, fromage=1)
        _sleep_between(2.0, 4.0)
        # Exact-match quoted query
        _, session, headers = run_search(f'"{keyword}"', "Ahmedabad", session, headers, client, company_tiers, stats, pending_detail, start=0, fromage=3)
        _sleep_between(2.0, 4.0)

    # ── PASS 3: Remote/WFH roles ──
    print("\n=== PASS 3: Remote / WFH roles ===")
    for keyword in PRIMARY_KEYWORDS[:20]:
        for location in LOCATIONS_REMOTE:
            _, session, headers = run_search(keyword, location, session, headers, client, company_tiers, stats, pending_detail,
                       start=0, fromage=3, extra_params={"sc": "0kf:attr(DSQF7);"})
            _sleep_between(2.0, 4.0)

    # ── PASS 4: Remaining keywords × Ahmedabad only ──
    print("\n=== PASS 4: Remaining keywords × Ahmedabad ===")
    for keyword in PRIMARY_KEYWORDS[20:]:
        stats["keywords_covered"] += 1
        _, session, headers = run_search(keyword, "Ahmedabad", session, headers, client, company_tiers, stats, pending_detail, start=0, fromage=3)
        _sleep_between(2.0, 4.0)

    # ── PASS 5 (conditional): Company-direct posts if few results ──
    if stats["total_inserted"] < 20:
        print("\n=== PASS 5: Direct employer posts (low-result fallback) ===")
        for keyword in PRIMARY_KEYWORDS[:10]:
            _, session, headers = run_search(keyword, "Ahmedabad", session, headers, client, company_tiers, stats, pending_detail,
                       start=0, fromage=3, extra_params={"sc": "0kf:attr(EMPLOYER);"})
            _sleep_between(2.0, 4.0)

    # ─────────────────────────────────────────────────────────
    # PART 11 — DETAIL PAGE ENRICHMENT
    # ─────────────────────────────────────────────────────────
    if pending_detail:
        print(f"\n=== Detail enrichment: {min(len(pending_detail), 30)} jobs ===")
        for job in pending_detail[:30]:
            job_key = job.get("job_key", "")
            if not job_key:
                continue
            detail_url = f"{DETAIL_BASE}?jk={job_key}"
            detail_html, session, headers = fetch_page(detail_url, session, headers, stats=stats)
            stats["total_detail_fetches"] += 1
            if detail_html:
                detail = extract_job_detail(detail_html)
                # Update raw_data in DB if possible — best-effort only
                try:
                    existing = (
                        client.table("opportunities")
                        .select("id, raw_data")
                        .eq("source", "indeed")
                        .filter("raw_data->>job_key", "eq", job_key)
                        .limit(1)
                        .execute()
                    )
                    if existing.data:
                        row = existing.data[0]
                        updated_raw = {**(row.get("raw_data") or {}), **detail}
                        client.table("opportunities").update({"raw_data": updated_raw}).eq("id", row["id"]).execute()
                except Exception:
                    pass
            time.sleep(random.uniform(3.0, 6.0))

    # ─────────────────────────────────────────────────────────
    # PART 12 — REPORTING
    # ─────────────────────────────────────────────────────────
    blocked = stats["blocked_count"]
    new_found = stats["total_inserted"]
    errors_list: list[str] = stats.get("_errors", [])

    print(f"\n{'═'*55}")
    print(f"  Requests: {stats['total_requests']} | Mosaic hits: {stats['total_mosaic_success']} | HTML fallback: {stats['total_html_fallback']} | Blocked: {blocked}")
    print(f"  Jobs found: {stats['total_jobs_found']} | Inserted: {new_found} | Skipped (dup): {stats['total_skipped_duplicate']} | Noise: {stats['total_skipped_noise']}")
    print(f"  Detail pages fetched: {stats['total_detail_fetches']}")
    print(f"{'═'*55}")

    if blocked > 5:
        try:
            send_telegram_message(f"⚠️ Indeed scraper blocked {blocked}× — check headers")
        except Exception:
            pass

    status = "success"
    if blocked > 0 or errors_list:
        status = "blocked" if blocked > max(len(errors_list), 1) else "partial_success"

    try:
        client.table("scraper_logs").insert({
            "source": "indeed_scraper",
            "status": status,
            "new_found": new_found,
            "errors": "\n".join(errors_list) if errors_list else None,
        }).execute()
    except Exception as exc:
        print(f"Warning: could not write scraper_log: {exc}")

    print("✅ Indeed Scraper done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

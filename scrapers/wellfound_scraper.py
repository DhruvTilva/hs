"""
scrapers/wellfound_scraper.py — god-level Wellfound AI/ML job scraper
Uses curl_cffi to bypass DataDome TLS fingerprinting.
Extracts jobs from __NEXT_DATA__ Apollo GraphQL cache.
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

# ── curl_cffi import with graceful fallback ──────────────────
try:
    from curl_cffi import requests as cffi_requests  # type: ignore[import-untyped]
    _CFFI_AVAILABLE = True
except ImportError:
    import requests as cffi_requests  # type: ignore[no-redef]
    _CFFI_AVAILABLE = False

# ─────────────────────────────────────────────────────────────
# PART 1 — SLUGS AND PARAMS
# ─────────────────────────────────────────────────────────────

ROLE_SLUGS: list[str] = [
    "machine-learning-engineer",
    "data-scientist",
    "ai-engineer",
    "deep-learning-engineer",
    "nlp-engineer",
    "computer-vision-engineer",
    "mlops-engineer",
    "data-engineer",
    "generative-ai-engineer",
    "llm-engineer",
    "ai-researcher",
    "research-scientist",
    "applied-scientist",
    "data-analyst",
    "backend-engineer",
    "software-engineer",
    "full-stack-engineer",
]

LOCATION_SLUGS_PRIMARY: list[str] = ["india", "ahmedabad", "gujarat"]
LOCATION_SLUGS_REMOTE: list[str] = ["remote"]

ROLE_PARAMS: list[str] = [
    "ml-engineer",
    "data-scientist",
    "ai-engineer",
    "nlp-engineer",
    "computer-vision-engineer",
    "mlops-engineer",
    "deep-learning-engineer",
    "generative-ai-engineer",
    "llm-engineer",
    "data-engineer",
    "research-scientist",
]

LOCATION_PARAMS: list[str] = ["ahmedabad", "gandhinagar", "india", "gujarat", "remote"]

# ─────────────────────────────────────────────────────────────
# PART 2 — SESSION + HEADERS
# ─────────────────────────────────────────────────────────────

HEADER_SETS: list[dict[str, str]] = [
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-CH-UA": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
    },
    {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9,gu;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-CH-UA": '"Chromium";v="124", "Google Chrome";v="124"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"macOS"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Upgrade-Insecure-Requests": "1",
    },
    {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Upgrade-Insecure-Requests": "1",
    },
]


def get_headers() -> dict[str, str]:
    return random.choice(HEADER_SETS).copy()


def create_wellfound_session() -> Any:
    if _CFFI_AVAILABLE:
        session = cffi_requests.Session(impersonate="chrome124")
    else:
        session = cffi_requests.Session()
    try:
        session.get("https://wellfound.com/", headers=get_headers(), timeout=20)
        time.sleep(random.uniform(2.0, 4.0))
    except Exception:
        pass
    return session


def is_blocked(html: str, status: int) -> bool:
    if status in (403, 429, 503):
        return True
    if not html or len(html) < 3000:
        return True
    _BLOCK_SIGNALS = [
        "datadome", "captcha", "please verify",
        "access denied", "unusual traffic", "robot",
        "blocked", "challenge", "are you human",
    ]
    return any(s in html.lower() for s in _BLOCK_SIGNALS)


def fetch_wellfound_page(
    url: str,
    session: Any,
    stats: dict[str, Any],
    max_retries: int = 3,
) -> tuple[str | None, Any]:
    for attempt in range(max_retries):
        try:
            resp = session.get(url, headers=get_headers(), timeout=25, allow_redirects=True)
            html = resp.text
            status = resp.status_code

            if is_blocked(html, status):
                print(f"  ⚠  blocked attempt {attempt + 1} — {url[:70]}")
                stats["blocked_count"] += 1
                time.sleep(15.0 + random.uniform(5, 15))
                session = create_wellfound_session()
                continue

            return html, session

        except Exception as exc:
            wait = 2 ** attempt + random.uniform(1, 3)
            print(f"  ✗  request error attempt {attempt + 1}: {exc}")
            time.sleep(wait)

    return None, session


# ─────────────────────────────────────────────────────────────
# PART 3 — __NEXT_DATA__ EXTRACTION
# ─────────────────────────────────────────────────────────────

def extract_next_data(html: str) -> dict[str, Any]:
    try:
        soup = BeautifulSoup(html, "html.parser")
        script = soup.find("script", id="__NEXT_DATA__")
        if script and script.string:
            return json.loads(script.string)  # type: ignore[arg-type]
    except Exception:
        pass
    try:
        match = re.search(
            r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>',
            html, re.DOTALL,
        )
        if match:
            return json.loads(match.group(1))
    except Exception:
        pass
    return {}


def _resolve_ref(apollo: dict[str, Any], ref_obj: Any) -> dict[str, Any]:
    if not ref_obj or not isinstance(ref_obj, dict):
        return {}
    return apollo.get(ref_obj.get("__ref", ""), {})


def extract_jobs_from_next_data(next_data: dict[str, Any]) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    try:
        apollo: dict[str, Any] = (
            next_data.get("props", {})
                     .get("pageProps", {})
                     .get("apolloState", {})
        )
        if not apollo:
            return []

        job_nodes = {k: v for k, v in apollo.items() if isinstance(v, dict) and v.get("__typename") == "JobListing"}
        company_nodes = {k: v for k, v in apollo.items() if isinstance(v, dict) and v.get("__typename") == "Startup"}

        for cache_key, job in job_nodes.items():
            try:
                company_ref = job.get("startup", {})
                company_key = company_ref.get("__ref", "") if isinstance(company_ref, dict) else ""
                company = company_nodes.get(company_key, {})

                # Resolve salary
                salary_obj = _resolve_ref(apollo, job.get("salary")) if isinstance(job.get("salary"), dict) else {}
                salary_min = salary_obj.get("minValue")
                salary_max = salary_obj.get("maxValue")
                salary_currency = salary_obj.get("currencyCode", "INR")
                if salary_min and salary_max:
                    salary_str = f"{salary_currency} {salary_min}–{salary_max}"
                elif salary_min or salary_max:
                    salary_str = f"{salary_currency} {salary_min or salary_max}"
                else:
                    salary_str = ""

                # Resolve equity
                equity_obj = _resolve_ref(apollo, job.get("equity")) if isinstance(job.get("equity"), dict) else {}
                eq_min = equity_obj.get("minValue")
                eq_max = equity_obj.get("maxValue")
                equity_str = f"{eq_min}%–{eq_max}%" if (eq_min is not None and eq_max is not None) else ""

                # Resolve locations
                locations: list[str] = []
                for loc_ref in (job.get("locationNames") or []):
                    if isinstance(loc_ref, str):
                        locations.append(loc_ref)
                    elif isinstance(loc_ref, dict):
                        resolved = apollo.get(loc_ref.get("__ref", ""), {})
                        name = resolved.get("name", "")
                        if name:
                            locations.append(name)

                # Resolve skills
                skills: list[str] = []
                for skill_ref in (job.get("skills") or []):
                    if isinstance(skill_ref, str):
                        skills.append(skill_ref)
                    elif isinstance(skill_ref, dict):
                        resolved = apollo.get(skill_ref.get("__ref", ""), {})
                        display = resolved.get("displayName") or resolved.get("name", "")
                        if display:
                            skills.append(display)

                job_id = str(job.get("id") or cache_key.replace("JobListing:", ""))
                job_slug = job.get("slug") or ""
                wellfound_url = (
                    f"https://wellfound.com/jobs/{job_id}-{job_slug}"
                    if job_slug else f"https://wellfound.com/jobs/{job_id}"
                )
                external_url = job.get("applyUrl") or job.get("atsUrl") or ""
                created_at = job.get("createdAt") or job.get("liveStartAt") or ""

                jobs.append({
                    "job_id": job_id,
                    "title": str(job.get("title") or job.get("role") or ""),
                    "company_name": str(company.get("name") or ""),
                    "company_slug": str(company.get("slug") or ""),
                    "company_description": str(company.get("highConcept") or "")[:200],
                    "company_website": str(company.get("websiteUrl") or ""),
                    "company_linkedin": str(company.get("linkedInUrl") or ""),
                    "funding_stage": str(company.get("fundingStage") or ""),
                    "company_size": str(company.get("companySize") or ""),
                    "total_funding": str(company.get("totalFunding") or ""),
                    "location": ", ".join(locations) if locations else "Remote",
                    "remote_ok": bool(job.get("remote")),
                    "work_type": str(job.get("jobType") or ""),
                    "salary": salary_str,
                    "equity": equity_str,
                    "skills": ", ".join(skills[:15]),
                    "description": str(job.get("description") or "")[:500],
                    "apply_url": external_url or wellfound_url,
                    "wellfound_url": wellfound_url,
                    "created_at": created_at,
                    "visa_sponsorship": bool(job.get("visaSponsorship")),
                    "job_type": str(job.get("jobType") or ""),
                    "experience_level": str(job.get("experienceLevel") or ""),
                    "_method": "next_data",
                })
            except Exception:
                continue
    except Exception:
        pass
    return jobs


# ─────────────────────────────────────────────────────────────
# PART 4 — HTML FALLBACK PARSER
# ─────────────────────────────────────────────────────────────

def extract_jobs_from_html(html: str, source_url: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    jobs: list[dict[str, Any]] = []

    containers = (
        soup.select("div[data-test='StartupResult']")
        or soup.select("div[class*='styles_component']")
        or soup.select("div[class*='JobCard']")
        or soup.select("li[class*='job']")
    )

    for container in containers:
        try:
            title_node = (
                container.select_one("a[href*='/jobs/']")
                or container.select_one("h2")
                or container.select_one("h3")
            )
            title = title_node.get_text(" ", strip=True) if title_node else ""
            href = str(title_node.get("href", "")) if title_node else ""

            company_node = (
                container.select_one("a[href*='/company/']")
                or container.select_one("[class*='startup']")
                or container.select_one("[class*='company']")
            )
            company = company_node.get_text(" ", strip=True) if company_node else ""

            salary_node = container.find(string=re.compile(r"[\$₹£€]?\d+[kK]"))
            equity_node = container.find(string=re.compile(r"\d+\.?\d*%"))
            salary = salary_node.strip() if salary_node else ""
            equity = equity_node.strip() if equity_node else ""

            loc_node = container.select_one("[class*='location']")
            location = loc_node.get_text(" ", strip=True) if loc_node else "Remote"

            if not title:
                continue

            apply_url = (
                f"https://wellfound.com{href}" if href.startswith("/")
                else href or "https://wellfound.com/jobs"
            )
            jobs.append({
                "job_id": "",
                "title": title,
                "company_name": company,
                "company_slug": "",
                "company_description": "",
                "company_website": "",
                "company_linkedin": "",
                "funding_stage": "",
                "company_size": "",
                "total_funding": "",
                "location": location,
                "remote_ok": "remote" in location.lower(),
                "work_type": "",
                "salary": salary,
                "equity": equity,
                "skills": "",
                "description": "",
                "apply_url": apply_url,
                "wellfound_url": apply_url,
                "created_at": "",
                "visa_sponsorship": False,
                "job_type": "",
                "experience_level": "",
                "_method": "html_fallback",
            })
        except Exception:
            continue

    return jobs


def extract_jobs_from_page(html: str, source_url: str, stats: dict[str, Any]) -> list[dict[str, Any]]:
    """Try __NEXT_DATA__ first, fall back to HTML."""
    next_data = extract_next_data(html)
    jobs = extract_jobs_from_next_data(next_data)
    if jobs:
        stats["next_data_hits"] += 1
        return jobs
    jobs = extract_jobs_from_html(html, source_url)
    if jobs:
        stats["html_fallback_hits"] += 1
    return jobs


# ─────────────────────────────────────────────────────────────
# PART 5 — FILTERING
# ─────────────────────────────────────────────────────────────

_AI_SIGNAL_WORDS: list[str] = [
    "ai", " ml", "machine learning", "data scien",
    "deep learning", "neural", "nlp", "computer vision",
    "mlops", "llm", "genai", "generative", "artificial",
    "data engineer", "research scientist", "applied scientist",
    "prompt", "langchain", "pytorch", "tensorflow",
    "hugging", "rag", "vector", "recommendation",
    "forecasting", "prediction", "analytics engineer",
    "reinforcement", "transformer", "diffusion", "foundation model",
]

_NOISE_TITLES: list[str] = [
    "sales", "marketing", "hr ", "human resource",
    "accountant", "finance manager", "customer support",
    "receptionist", "content writer", "graphic design",
    "social media", "civil engineer", "mechanical",
    "electrical engineer", "field executive", "delivery",
]

_LOCATION_SIGNALS: list[str] = [
    "ahmedabad", "gandhinagar", "gift", "gujarat",
    "india", "remote", "work from home", "wfh",
    "anywhere", "worldwide", "global",
]

_SUFFIX_RE = re.compile(
    r"\b(pvt\.?|ltd\.?|private|limited|inc\.?|corp\.?|llp\.?|technologies|tech|solutions|services)\b",
    re.IGNORECASE,
)

_TARGET_STACK: list[str] = [
    "python", "pytorch", "tensorflow", "langchain", "llm",
    "transformers", "openai", "rag", "vector", "mlflow",
    "kubernetes", "docker", "fastapi", "hugging face",
    "scikit", "spark", "airflow", "kubeflow",
]


def has_ai_signal(title: str, description: str, skills: str) -> bool:
    text = f"{title} {description} {skills}".lower()
    return any(w in text for w in _AI_SIGNAL_WORDS)


def is_noise(title: str) -> bool:
    t = title.lower()
    return any(n in t for n in _NOISE_TITLES)


def is_location_relevant(location: str, remote_ok: bool) -> bool:
    if remote_ok:
        return True
    return any(s in location.lower() for s in _LOCATION_SIGNALS)


def parse_hours_old(created_at: str) -> float | None:
    if not created_at:
        return None
    try:
        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max((datetime.now(timezone.utc) - dt).total_seconds() / 3600.0, 0.0)
    except Exception:
        pass
    text = created_at.lower()
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
# PART 6 — WELLFOUND BONUS SCORING
# ─────────────────────────────────────────────────────────────

def compute_wellfound_bonus(job: dict[str, Any]) -> int:
    bonus = 0

    if job.get("equity") and str(job["equity"]) not in ("", "No equity"):
        bonus += 5

    if job.get("salary"):
        bonus += 4

    stage = str(job.get("funding_stage", "")).lower()
    if stage in ("seed", "series a", "pre-seed", "angel"):
        bonus += 4
    elif stage in ("series b", "series c"):
        bonus += 2

    size = str(job.get("company_size", "")).lower()
    if any(s in size for s in ["1-10", "11-50", "1 - 10", "11 - 50"]):
        bonus += 3
    elif any(s in size for s in ["51-200", "51 - 200"]):
        bonus += 1

    if job.get("remote_ok"):
        bonus += 3

    skills_text = str(job.get("skills", "")).lower()
    matched = sum(1 for s in _TARGET_STACK if s in skills_text)
    bonus += min(matched * 2, 8)

    if job.get("visa_sponsorship"):
        bonus += 2

    if "full" in str(job.get("job_type", "")).lower():
        bonus += 1

    return min(bonus, 22)


# ─────────────────────────────────────────────────────────────
# PART 8+9 — DEDUPLICATION + signal_type
# ─────────────────────────────────────────────────────────────

def wellfound_job_id_exists(client: Any, job_id: str) -> bool:
    if not client or not job_id:
        return False
    try:
        result = (
            client.table("opportunities")
            .select("id")
            .eq("source", "wellfound")
            .filter("raw_data->>wellfound_job_id", "eq", job_id)
            .limit(1)
            .execute()
        )
        return bool(result.data)
    except Exception:
        return False


def find_cross_source_duplicate(client: Any, company_name: str, role_title: str, days: int = 14) -> list[str]:
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


def resolve_signal_type(job: dict[str, Any], watched_companies: set[str]) -> str:
    company_clean = clean_company(job.get("company_name", ""))
    if company_clean in watched_companies:
        return "early"
    stage = str(job.get("funding_stage", "")).lower()
    equity = str(job.get("equity", ""))
    if equity and stage in ("seed", "pre-seed", "angel"):
        return "proactive"
    return "normal"


def insert_with_dedup(
    client: Any,
    opp: Opportunity,
    job_id: str,
    stats: dict[str, Any],
) -> bool:
    if client is None:
        stats["total_inserted"] += 1
        return True

    # 1. Wellfound job_id dedup
    if job_id and wellfound_job_id_exists(client, job_id):
        stats["total_skipped_dup"] += 1
        return False

    # 2. Same-source exact dedup (14 days for Wellfound — jobs stay live longer)
    exact = find_recent_duplicate(client, opp, days=14, source_scoped=True)
    if exact:
        stats["total_skipped_dup"] += 1
        return False

    # 3. Cross-source annotation
    other_sources = find_cross_source_duplicate(client, opp.company_name, opp.role_title or "", days=14)
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
# CORE JOB PROCESSING
# ─────────────────────────────────────────────────────────────

def process_jobs(
    jobs: list[dict[str, Any]],
    source_url: str,
    client: Any,
    company_tiers: dict[str, int | None],
    watched_companies: set[str],
    stats: dict[str, Any],
) -> int:
    inserted_count = 0
    equity_salary_count = 0

    for job in jobs:
        try:
            title = str(job.get("title", "")).strip()
            company_name = str(job.get("company_name", "")).strip()

            if not title or len(title) < 3 or not company_name:
                continue
            if is_noise(title):
                stats["total_skipped_no_ai"] += 1
                continue
            if not has_ai_signal(title, job.get("description", ""), job.get("skills", "")):
                stats["total_skipped_no_ai"] += 1
                continue
            if not is_location_relevant(job.get("location", ""), bool(job.get("remote_ok"))):
                stats["total_skipped_location"] += 1
                continue

            hours_old = parse_hours_old(job.get("created_at", ""))
            h = hours_old if hours_old is not None else 48.0

            signal_type = resolve_signal_type(job, watched_companies)
            company_tier = company_tiers.get(clean_company(company_name))
            base_score = calculate_priority_score(signal_type, h, title, job.get("location", ""), company_tier)
            bonus = compute_wellfound_bonus(job)
            final_score = min(base_score + bonus, 100)

            if h <= 6:
                freshness = 35
            elif h <= 24:
                freshness = 25
            elif h <= 72:
                freshness = 15
            else:
                freshness = 8

            raw_data: dict[str, Any] = {
                "wellfound_job_id": job.get("job_id", ""),
                "wellfound_url": job.get("wellfound_url", ""),
                "company_slug": job.get("company_slug", ""),
                "company_description": job.get("company_description", ""),
                "company_website": job.get("company_website", ""),
                "company_linkedin": job.get("company_linkedin", ""),
                "funding_stage": job.get("funding_stage", ""),
                "company_size": job.get("company_size", ""),
                "total_funding": job.get("total_funding", ""),
                "salary": job.get("salary", ""),
                "equity": job.get("equity", ""),
                "skills": job.get("skills", ""),
                "description": job.get("description", ""),
                "remote_ok": job.get("remote_ok", False),
                "work_type": job.get("work_type", ""),
                "job_type": job.get("job_type", ""),
                "experience_level": job.get("experience_level", ""),
                "visa_sponsorship": job.get("visa_sponsorship", False),
                "extraction_method": job.get("_method", "unknown"),
                "source_url": source_url,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "bonus_score": bonus,
            }

            opp = Opportunity(
                company_name=company_name,
                role_title=title,
                location=job.get("location") or "Remote",
                source="wellfound",
                signal_type=signal_type,
                apply_url=job.get("apply_url"),
                priority_score=final_score,
                freshness_score=freshness,
                raw_data=raw_data,
            )

            if insert_with_dedup(client, opp, job.get("job_id", ""), stats):
                inserted_count += 1
                stats["total_jobs_extracted"] += 1
                if job.get("equity") and job.get("salary"):
                    equity_salary_count += 1
                    stats["equity_jobs_found"] += 1

        except Exception:
            continue

    return inserted_count


# ─────────────────────────────────────────────────────────────
# PART 7 — RUN STRATEGY
# ─────────────────────────────────────────────────────────────

def main() -> int:
    print("🚀 Wellfound Scraper starting...")

    client = get_supabase_client()
    if client is None:
        log_scraper_run(client, "wellfound_scraper", "dry_run", 0, None)
        print("✅ Wellfound Scraper done. (dry run)")
        return 0

    # Load company data from Supabase
    company_tiers: dict[str, int | None] = {}
    watched_companies: set[str] = set()
    watched_slugs: list[str] = []

    try:
        rows = client.table("companies").select("name, tier, career_page_watched").execute().data or []
        for r in rows:
            if r.get("name"):
                key = clean_company(str(r["name"]))
                company_tiers[key] = r.get("tier")
                if r.get("career_page_watched"):
                    watched_companies.add(key)
                    # Derive Wellfound slug from company name
                    slug = re.sub(r"[^a-z0-9]+", "-", str(r["name"]).lower()).strip("-")
                    watched_slugs.append(slug)
    except Exception as exc:
        print(f"Warning: could not load companies: {exc}")

    stats: dict[str, Any] = {
        "total_requests": 0,
        "next_data_hits": 0,
        "html_fallback_hits": 0,
        "total_jobs_extracted": 0,
        "total_inserted": 0,
        "total_skipped_dup": 0,
        "total_skipped_no_ai": 0,
        "total_skipped_location": 0,
        "blocked_count": 0,
        "companies_scraped": 0,
        "equity_jobs_found": 0,
    }

    request_counter = 0
    session = create_wellfound_session()

    def _sleep(lo: float = 2.5, hi: float = 4.5) -> None:
        nonlocal request_counter, session
        request_counter += 1
        if request_counter % 15 == 0:
            cool = random.uniform(8, 15)
            print(f"  ⏸  cooling {cool:.1f}s + new session after {request_counter} requests")
            time.sleep(cool)
            session = create_wellfound_session()
        else:
            time.sleep(random.uniform(lo, hi))

    def _run_url(url: str, source_label: str) -> None:
        nonlocal session
        nonlocal session
        stats["total_requests"] += 1
        html, session = fetch_wellfound_page(url, session, stats)
        if not html:
            print(f"  ✗  {source_label} → no response")
            return
        jobs = extract_jobs_from_page(html, url, stats)
        method = jobs[0].get("_method", "?") if jobs else "empty"
        inserted = process_jobs(jobs, url, client, company_tiers, watched_companies, stats)
        equity_in_batch = sum(1 for j in jobs if j.get("equity") and j.get("salary"))
        extra = f", {equity_in_batch} equity+salary" if equity_in_batch else ""
        print(f"  ✓  {source_label} [{method}] → {len(jobs)} jobs ({inserted} inserted{extra})")

    # ── PASS 1: Pattern A — role/location pages ──────────────
    print("\n=== PASS 1: Pattern A (role/location) ===")
    for role_slug in ROLE_SLUGS[:10]:
        for loc_slug in LOCATION_SLUGS_PRIMARY:
            url = f"https://wellfound.com/role/l/{role_slug}/{loc_slug}"
            _run_url(url, f"{role_slug} / {loc_slug}")
            _sleep(2.5, 4.5)
            # Fetch page 2 if we got jobs (total unknown — always try p2 for primary)
            url_p2 = f"{url}?page=2"
            stats["total_requests"] += 1
            html2, session = fetch_wellfound_page(url_p2, session, stats)
            if html2:
                jobs2 = extract_jobs_from_page(html2, url_p2, stats)
                if jobs2:
                    method2 = jobs2[0].get("_method", "?")
                    ins2 = process_jobs(jobs2, url_p2, client, company_tiers, watched_companies, stats)
                    print(f"  ✓  {role_slug} / {loc_slug} p2 [{method2}] → {len(jobs2)} jobs ({ins2} inserted)")
            _sleep(1.5, 3.0)

    # ── PASS 2: Pattern A — remote roles ─────────────────────
    print("\n=== PASS 2: Pattern A (remote roles) ===")
    for role_slug in ROLE_SLUGS[:8]:
        url = f"https://wellfound.com/role/l/{role_slug}/remote"
        _run_url(url, f"{role_slug} / remote")
        _sleep(2.0, 4.0)

    # ── PASS 3: Pattern B — filtered search ──────────────────
    print("\n=== PASS 3: Pattern B (filtered search) ===")
    for role_param in ROLE_PARAMS[:8]:
        for loc_param in ["ahmedabad", "india", "remote"]:
            url = f"https://wellfound.com/jobs?role={role_param}&location={loc_param}"
            _run_url(url, f"jobs?role={role_param}&loc={loc_param}")
            _sleep(2.0, 4.0)

    # ── PASS 4: Pattern D — India location browse ────────────
    print("\n=== PASS 4: Pattern D (India location browse) ===")
    for page_num in range(1, 4):
        url = f"https://wellfound.com/location/india?page={page_num}"
        _run_url(url, f"location/india?page={page_num}")
        _sleep(3.0, 5.0)

    # ── PASS 5: Pattern C — watched company jobs ─────────────
    if watched_slugs:
        print(f"\n=== PASS 5: Pattern C ({len(watched_slugs)} watched companies) ===")
        for slug in watched_slugs[:20]:
            url = f"https://wellfound.com/company/{slug}/jobs"
            stats["companies_scraped"] += 1
            _run_url(url, f"company/{slug}")
            _sleep(2.0, 3.0)

    # ─────────────────────────────────────────────────────────
    # PART 11 — REPORTING
    # ─────────────────────────────────────────────────────────
    blocked = stats["blocked_count"]
    new_found = stats["total_inserted"]
    errors_list: list[str] = stats.get("_errors", [])

    print(f"\n{'═' * 55}")
    print(f"  Requests: {stats['total_requests']} | __NEXT_DATA__ hits: {stats['next_data_hits']} | HTML fallback: {stats['html_fallback_hits']}")
    print(f"  Jobs extracted: {stats['total_jobs_extracted']} | Inserted: {new_found} | Equity+Salary: {stats['equity_jobs_found']}")
    print(f"  Blocked: {blocked} | Watchlisted companies scraped: {stats['companies_scraped']}")
    print(f"{'═' * 55}")

    if stats["equity_jobs_found"] > 0:
        try:
            send_telegram_message(
                f"💰 Wellfound: {stats['equity_jobs_found']} jobs with salary+equity disclosed today"
            )
        except Exception:
            pass

    if blocked > 4:
        try:
            send_telegram_message(
                f"⚠️ Wellfound blocked {blocked}× — DataDome may need new headers"
            )
        except Exception:
            pass

    status = "success"
    if blocked > 0 or errors_list:
        status = "blocked" if blocked > max(len(errors_list), 1) else "partial_success"

    try:
        client.table("scraper_logs").insert({
            "source": "wellfound_scraper",
            "status": status,
            "new_found": new_found,
            "errors": "\n".join(errors_list) if errors_list else None,
        }).execute()
    except Exception as exc:
        print(f"Warning: could not write scraper_log: {exc}")

    print("✅ Wellfound Scraper done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

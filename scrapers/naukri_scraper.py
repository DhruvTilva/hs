"""
scrapers/naukri_scraper.py — god-level Naukri AI/ML job scraper
"""
from __future__ import annotations

import random
import re
import sys
import time
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.score import calculate_priority_score
from scrapers.common import (
    Opportunity,
    find_recent_duplicate,
    get_supabase_client,
    log_scraper_run,
    parse_datetime,
    send_telegram_message,
    send_scraper_completion_notification,
)

# ─────────────────────────────────────────────────────────────
# PART 1 — KEYWORDS & LOCATIONS
# ─────────────────────────────────────────────────────────────

PRIMARY_KEYWORDS: list[str] = [
    # Core AI/ML
    "artificial intelligence engineer",
    "machine learning engineer",
    "AI engineer",
    "ML engineer",
    "deep learning engineer",
    "AI developer",
    "ML developer",
    # Data Science
    "data scientist",
    "senior data scientist",
    "lead data scientist",
    "data science engineer",
    "applied scientist",
    # GenAI / LLM
    "generative AI engineer",
    "GenAI engineer",
    "LLM engineer",
    "large language model engineer",
    "prompt engineer",
    "AI product engineer",
    "foundation model engineer",
    # Specializations
    "NLP engineer",
    "natural language processing engineer",
    "computer vision engineer",
    "CV engineer",
    "MLOps engineer",
    "ML platform engineer",
    "AI infrastructure engineer",
    "model deployment engineer",
    # Research
    "AI researcher",
    "ML researcher",
    "research scientist AI",
    "research engineer AI",
    "AI research associate",
    "AI research analyst",
    # Applied/Consulting
    "applied AI engineer",
    "applied machine learning engineer",
    "AI consultant",
    "ML consultant",
    "AI solutions architect",
    "AI architect",
    # Data Engineering (AI focused)
    "data engineer AI",
    "AI data engineer",
    "feature engineering",
    "ML data engineer",
    # Broader catch-all
    "machine learning",
    "artificial intelligence",
    "deep learning",
    "neural network engineer",
    "reinforcement learning engineer",
    "MLflow engineer",
    "PyTorch engineer",
    "TensorFlow engineer",
    "Hugging Face engineer",
    "LangChain engineer",
    "RAG engineer",
    "vector database engineer",
]

LOCATIONS_PRIMARY: list[str] = [
    "Ahmedabad",
    "Gandhinagar",
    "GIFT City",
    "Giftcity-Ahmedabad",
    "Giftcity-gandhinagar",
    "Gujarat",
]

LOCATIONS_SECONDARY: list[str] = [
    "India",
    "Work from home",
]

NAUKRI_URL = "https://www.naukri.com/jobapi/v3/search"

# ─────────────────────────────────────────────────────────────
# PART 3 — HEADER ROTATION
# ─────────────────────────────────────────────────────────────

HEADER_SETS: list[dict[str, str]] = [
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.naukri.com/",
        "Origin": "https://www.naukri.com",
        "appid": "109",
        "systemid": "109",
        "Connection": "keep-alive",
    },
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-IN,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.naukri.com/jobs-in-india",
        "appid": "109",
        "systemid": "Naukri",
        "Connection": "keep-alive",
    },
    {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-GB,en;q=0.9",
        "Referer": "https://www.naukri.com/machine-learning-jobs",
        "appid": "109",
        "systemid": "109",
    },
    {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.8",
        "Referer": "https://www.naukri.com/data-scientist-jobs-in-ahmedabad",
        "appid": "109",
        "systemid": "109",
    },
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
        "Accept": "application/json, text/javascript, */*",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.naukri.com/",
        "appid": "109",
        "systemid": "Naukri",
    },
    {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
        "Accept": "application/json",
        "Accept-Language": "en-IN,en;q=0.9",
        "Referer": "https://www.naukri.com/",
        "appid": "109",
        "systemid": "109",
    },
]

# ─────────────────────────────────────────────────────────────
# PART 6 — SMART FILTERING CONSTANTS
# ─────────────────────────────────────────────────────────────

AI_SIGNAL_WORDS: list[str] = [
    "ai", "ml", "machine learning", "data scien", "deep learning",
    "neural", "nlp", "computer vision", "mlops", "llm", "genai",
    "generative", "artificial intelligence", "data engineer",
    "research engineer", "applied scientist", "prompt", "langchain",
    "pytorch", "tensorflow", "hugging", "rag", "vector", "analytics",
    "algorithm", "model", "prediction", "forecasting",
]

NOISE_TITLE_WORDS: list[str] = [
    "sales", "marketing", " hr ", "human resource", "accountant",
    "finance manager", "business development", "customer support",
    "receptionist", "telecaller", "bpo", "collection", "insurance agent",
]

LOCATION_SIGNALS: list[str] = [
    "ahmedabad", "gandhinagar", "gift city", "giftcity", "gujarat",
    "remote", "work from home", "wfh", "india",
]

TARGET_SKILLS: list[str] = [
    "python", "pytorch", "tensorflow", "langchain", "llm", "transformers",
    "hugging face", "openai", "rag", "vector", "mlflow", "kubernetes",
    "docker",
]


# ─────────────────────────────────────────────────────────────
# PART 4 — REQUEST LOGIC
# ─────────────────────────────────────────────────────────────

def _fallback_ua() -> str:
    """Try fake_useragent; silently fall back to a hardcoded string."""
    try:
        from fake_useragent import UserAgent  # type: ignore[import-untyped]
        return str(UserAgent().random)
    except Exception:
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def request_with_retry(
    params: dict[str, Any],
    *,
    max_retries: int = 3,
    blocked_wait: float = 30.0,
) -> tuple[dict[str, Any], bool]:
    """
    Returns (payload_dict, was_blocked).
    payload_dict is {} on total failure.
    """
    for attempt in range(max_retries):
        headers = random.choice(HEADER_SETS).copy()
        try:
            resp = requests.get(NAUKRI_URL, params=params, headers=headers, timeout=20)

            if resp.status_code == 429:
                print(f"  ⏸  rate-limited — waiting {blocked_wait}s")
                time.sleep(blocked_wait)
                continue

            if resp.status_code in (403, 503):
                wait = (2 ** attempt) + random.uniform(1, 3)
                print(f"  ⚠  HTTP {resp.status_code} — waiting {wait:.1f}s (attempt {attempt+1})")
                time.sleep(wait)
                continue

            if resp.status_code == 200:
                try:
                    data = resp.json()
                    if data:
                        return data, False
                except ValueError:
                    pass
                return {}, False

        except requests.RequestException as exc:
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                print(f"  ✗  request error: {exc}")

    # All retries exhausted — swap in fallback UA for next call
    HEADER_SETS.append({"User-Agent": _fallback_ua(), "appid": "109", "systemid": "109"})
    return {}, True


# ─────────────────────────────────────────────────────────────
# DATA HELPERS
# ─────────────────────────────────────────────────────────────

def coalesce(*values: Any) -> Any:
    for v in values:
        if v not in (None, ""):
            return v
    return None


def normalize_title(title: Any) -> str:
    return re.sub(r"\s+", " ", str(title or "")).strip()


def estimate_hours_old(job: dict[str, Any]) -> float:
    raw = coalesce(
        job.get("createdDate"), job.get("created_date"),
        job.get("modifiedDate"), job.get("postedDate"), job.get("date"),
    )
    ts = parse_datetime(str(raw)) if raw else None
    if ts is None:
        return 24.0
    return max((datetime.now(timezone.utc) - ts).total_seconds() / 3600.0, 0.0)


def parse_jobs(payload: dict[str, Any]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for key in ("jobDetails", "jobs", "data", "result"):
        val = payload.get(key)
        if isinstance(val, list):
            candidates.extend(item for item in val if isinstance(item, dict))
    if not candidates and isinstance(payload.get("response"), dict):
        for key in ("jobDetails", "jobs", "data"):
            val = payload["response"].get(key)  # type: ignore[union-attr]
            if isinstance(val, list):
                candidates.extend(item for item in val if isinstance(item, dict))
    return candidates


def extract_job(job: dict[str, Any], keyword: str, location: str) -> dict[str, Any] | None:
    """Extract and normalise all fields from a raw job dict. Returns None to skip."""
    title = normalize_title(coalesce(
        job.get("title"), job.get("jobTitle"), job.get("designation"),
    ))
    if len(title) < 3:
        return None

    company_name = str(coalesce(
        job.get("companyName"), job.get("company"), job.get("company_name"),
    ) or "Unknown").strip()
    if not company_name or company_name == "Unknown":
        return None

    # Location — flatten list or string
    raw_loc = coalesce(
        job.get("placeholders"), job.get("location"), job.get("place"), job.get("jobLocation"),
    )
    if isinstance(raw_loc, list):
        raw_loc = ", ".join(str(x.get("label", x) if isinstance(x, dict) else x) for x in raw_loc[:3])
    job_location = str(raw_loc or location).strip()

    apply_url = str(coalesce(
        job.get("jobUrl"), job.get("url"), job.get("applyUrl"), job.get("jdURL"),
    ) or "")

    salary = str(coalesce(
        job.get("salary"), job.get("salaryDetail"), job.get("salaryStr"), job.get("ctcString"),
    ) or "")

    experience = str(coalesce(
        job.get("experience"), job.get("minExp"), job.get("experienceText"),
    ) or "")

    raw_skills = job.get("keySkills") or job.get("skills") or job.get("tagsAndSkills") or []
    if isinstance(raw_skills, list):
        skills = ", ".join(
            str(s.get("label", s) if isinstance(s, dict) else s) for s in raw_skills
        )
    else:
        skills = str(raw_skills)

    job_id = str(coalesce(job.get("jobId"), job.get("job_id"), job.get("id")) or "")
    posted_date = str(coalesce(job.get("createdDate"), job.get("modifiedDate"), job.get("postedDate")) or "")
    job_type = str(coalesce(job.get("jobType"), job.get("employmentType")) or "")
    work_mode = str(coalesce(job.get("wfhType"), job.get("workMode")) or "")

    # Company rating — nested in ambitionBoxData
    amb = job.get("ambitionBoxData") or {}
    company_rating_raw = amb.get("AggregateRating") or job.get("rating")
    try:
        company_rating: float | None = float(company_rating_raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        company_rating = None

    description_raw = job.get("jobDescription") or ""
    description = str(description_raw)[:500] if description_raw else ""

    hours_old = estimate_hours_old(job)
    is_fresh = hours_old <= 6

    return {
        "title": title,
        "company_name": company_name,
        "job_location": job_location,
        "apply_url": apply_url or None,
        "salary": salary or None,
        "experience": experience or None,
        "skills": skills or None,
        "job_id": job_id or None,
        "posted_date": posted_date or None,
        "job_type": job_type or None,
        "work_mode": work_mode or None,
        "company_rating": company_rating,
        "description": description or None,
        "hours_old": hours_old,
        "is_fresh": is_fresh,
        "keyword": keyword,
        "search_location": location,
    }


# ─────────────────────────────────────────────────────────────
# PART 6 — FILTERING
# ─────────────────────────────────────────────────────────────

def has_ai_signal(title: str) -> bool:
    t = title.lower()
    return any(word in t for word in AI_SIGNAL_WORDS)


def is_noise_title(title: str) -> bool:
    t = title.lower()
    return any(word in t for word in NOISE_TITLE_WORDS)


def location_relevant(job_location: str) -> bool:
    loc = job_location.lower()
    return any(sig in loc for sig in LOCATION_SIGNALS)


# ─────────────────────────────────────────────────────────────
# PART 7 — SCORING ENHANCEMENT
# ─────────────────────────────────────────────────────────────

def compute_bonus(
    salary: str | None,
    skills: str | None,
    company_rating: float | None,
    work_mode: str | None,
) -> int:
    bonus = 0
    if salary and salary.lower() not in ("", "not disclosed"):
        bonus += 3
    if skills:
        matched = sum(1 for s in TARGET_SKILLS if s in skills.lower())
        bonus += min(matched * 2, 8)
    if company_rating is not None and company_rating >= 3.5:
        bonus += 2
    if work_mode:
        wm = work_mode.lower()
        if "hybrid" in wm:
            bonus += 2
        elif "wfh" in wm or "work from home" in wm or "remote" in wm:
            bonus += 1
    return bonus


# ─────────────────────────────────────────────────────────────
# PART 8 — CROSS-SOURCE DEDUP
# ─────────────────────────────────────────────────────────────

_SUFFIX_RE = re.compile(r"\b(pvt\.?|ltd\.?|private|limited|inc\.?|corp\.?|llp\.?)\b", re.IGNORECASE)


def clean_company(name: str) -> str:
    return _SUFFIX_RE.sub("", name.lower()).strip()


def find_cross_source_duplicate(
    client: Any,
    company_name: str,
    role_title: str,
    days: int = 7,
) -> list[str]:
    """
    Returns a list of sources where the same company+role was found within `days`.
    Empty list means no cross-source duplicate.
    """
    if client is None:
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


def insert_with_dedup(
    client: Any,
    opp: Opportunity,
    *,
    stats: dict[str, int],
) -> bool:
    """
    Exact-match dedup (same source): skip.
    Cross-source match: insert but annotate raw_data.also_found_on.
    """
    if client is None:
        stats["inserted"] += 1
        return True

    # 1. Exact same-source dedup
    exact = find_recent_duplicate(client, opp, days=7, source_scoped=True)
    if exact:
        stats["skipped_dup"] += 1
        return False

    # 2. Cross-source dedup — annotate but still insert
    other_sources = find_cross_source_duplicate(client, opp.company_name, opp.role_title or "", days=7)
    if other_sources:
        rd = dict(opp.raw_data or {})
        rd["also_found_on"] = other_sources
        opp = Opportunity(
            company_name=opp.company_name,
            role_title=opp.role_title,
            location=opp.location,
            source=opp.source,
            signal_type=opp.signal_type,
            apply_url=opp.apply_url,
            priority_score=opp.priority_score,
            freshness_score=opp.freshness_score,
            raw_data=rd,
        )

    try:
        payload = asdict(opp)
        client.table("opportunities").insert(payload).execute()
        stats["inserted"] += 1
        stats["inserted_opps"].append(opp)
        return True
    except Exception as exc:
        stats["errors"].append(f"insert error for {opp.company_name}: {exc}")
        return False


# ─────────────────────────────────────────────────────────────
# CORE REQUEST RUNNER
# ─────────────────────────────────────────────────────────────

def run_query(
    keyword: str,
    location: str,
    *,
    page: int = 1,
    job_age: int = 3,
    wfh_type: int | None = None,
    stats: dict[str, int],
    client: Any,
    company_tiers: dict[str, int | None],
) -> None:
    params: dict[str, Any] = {
        "noOfResults": 50,
        "urlType": "search_by_key_loc",
        "searchType": "adv",
        "keyword": keyword,
        "location": location,
        "jobAge": job_age,
        "sort": 1,
        "pageNo": page,
    }
    if wfh_type is not None:
        params["wfhType"] = wfh_type

    stats["total_requests"] += 1
    payload, was_blocked = request_with_retry(params)

    if was_blocked:
        stats["blocked_count"] += 1
        print(f"  ✗  {keyword!r} / {location!r} → blocked")
        stats["errors"].append(f"{keyword} / {location} (p{page}): blocked")
        return

    jobs_raw = parse_jobs(payload)
    stats["total_jobs_found"] += len(jobs_raw)
    inserted_this_query = 0

    for job_raw in jobs_raw:
        job = extract_job(job_raw, keyword, location)
        if job is None:
            continue

        # ── PART 6: Filters ──
        if job["hours_old"] > 72:
            continue
        if not has_ai_signal(job["title"]):
            stats["skipped_no_ai"] += 1
            continue
        if is_noise_title(job["title"]):
            stats["skipped_no_ai"] += 1
            continue
        if not location_relevant(job["job_location"]):
            continue

        # ── PART 7: Scoring ──
        company_tier = company_tiers.get(clean_company(job["company_name"]))
        base_score = calculate_priority_score(
            "normal", job["hours_old"], job["title"], job["job_location"], company_tier,
        )
        bonus = compute_bonus(
            job["salary"], job["skills"], job["company_rating"], job["work_mode"],
        )
        final_score = min(base_score + bonus, 100)

        freshness_score = 35 if job["hours_old"] <= 6 else 25 if job["hours_old"] <= 24 else 15

        raw_data: dict[str, Any] = {
            "keyword": job["keyword"],
            "search_location": job["search_location"],
            "salary": job["salary"],
            "experience": job["experience"],
            "skills": job["skills"],
            "job_id": job["job_id"],
            "posted_date": job["posted_date"],
            "job_type": job["job_type"],
            "work_mode": job["work_mode"],
            "company_rating": job["company_rating"],
            "description": job["description"],
            "hours_old": round(job["hours_old"], 2),
            "is_fresh": job["is_fresh"],
            "bonus_score": bonus,
        }

        opp = Opportunity(
            company_name=job["company_name"],
            role_title=job["title"],
            location=job["job_location"],
            source="naukri",
            signal_type="normal",
            apply_url=job["apply_url"],
            priority_score=final_score,
            freshness_score=freshness_score,
            raw_data=raw_data,
        )

        if insert_with_dedup(client, opp, stats=stats):
            inserted_this_query += 1

    tag = f"p{page}" if page > 1 else ""
    print(f"  ✓  {keyword!r} / {location!r} {tag}→ {len(jobs_raw)} found, {inserted_this_query} inserted")


# ─────────────────────────────────────────────────────────────
# PART 9 — RUN STRATEGY
# ─────────────────────────────────────────────────────────────

def main() -> int:
    client = get_supabase_client()
    if client is None:
        log_scraper_run(client, "naukri_scraper", "dry_run", 0, None)
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
        "total_jobs_found": 0,
        "inserted": 0,
        "skipped_dup": 0,
        "skipped_no_ai": 0,
        "blocked_count": 0,
        "errors": [],
        "inserted_opps": [],
    }

    request_counter = 0

    def _sleep_between(min_s: float = 1.5, max_s: float = 3.5) -> None:
        nonlocal request_counter
        request_counter += 1
        if request_counter % 15 == 0:
            cool = random.uniform(8, 15)
            print(f"  ⏸  cooling off {cool:.1f}s after {request_counter} requests…")
            time.sleep(cool)
        else:
            time.sleep(random.uniform(min_s, max_s))

    # ── PASS 1: High-priority — primary keywords × primary locations ──
    print("\n=== PASS 1: Primary keywords × Gujarat locations ===")
    for keyword in PRIMARY_KEYWORDS[:20]:
        for location in LOCATIONS_PRIMARY:
            run_query(keyword, location, page=1, job_age=3, stats=stats, client=client, company_tiers=company_tiers)
            _sleep_between(2.0, 4.0)

    # ── PASS 2: Pagination — top 10 keywords × Ahmedabad page 2 ──
    print("\n=== PASS 2: Pagination (top 10 × Ahmedabad, page 2) ===")
    for keyword in PRIMARY_KEYWORDS[:10]:
        run_query(keyword, "Ahmedabad", page=2, job_age=3, stats=stats, client=client, company_tiers=company_tiers)
        _sleep_between(2.0, 4.0)

    # ── PASS 3: Remote/WFH — primary keywords × secondary locations ──
    print("\n=== PASS 3: Remote/WFH roles (India + WFH) ===")
    for keyword in PRIMARY_KEYWORDS[:15]:
        for location in LOCATIONS_SECONDARY:
            run_query(keyword, location, page=1, job_age=1, wfh_type=2, stats=stats, client=client, company_tiers=company_tiers)
            _sleep_between(2.0, 4.0)

    # ── PASS 4: Remaining keywords × Ahmedabad only ──
    print("\n=== PASS 4: Remaining keywords × Ahmedabad ===")
    for keyword in PRIMARY_KEYWORDS[20:]:
        run_query(keyword, "Ahmedabad", page=1, job_age=3, stats=stats, client=client, company_tiers=company_tiers)
        _sleep_between(1.5, 3.5)

    # ─────────────────────────────────────────────────────────
    # PART 10 — LOGGING AND REPORTING
    # ─────────────────────────────────────────────────────────

    blocked = stats["blocked_count"]
    new_found = stats["inserted"]
    errors_list: list[str] = stats["errors"]

    if blocked > 5:
        try:
            send_telegram_message(
                f"⚠️ Naukri scraper got blocked {blocked} times. Consider adding delays."
            )
        except Exception:
            pass

    status = "success"
    if blocked > 0 or errors_list:
        status = "blocked" if blocked > len(errors_list) else "partial_success"

    summary: dict[str, Any] = {
        "total_requests": stats["total_requests"],
        "total_jobs_found": stats["total_jobs_found"],
        "total_inserted": new_found,
        "total_skipped_duplicate": stats["skipped_dup"],
        "total_skipped_no_ai_signal": stats["skipped_no_ai"],
        "blocked_count": blocked,
        "keywords_covered": len(PRIMARY_KEYWORDS),
        "locations_covered": len(LOCATIONS_PRIMARY) + len(LOCATIONS_SECONDARY),
    }

    print(f"\n{'='*55}")
    print(f"  Requests:    {summary['total_requests']}")
    print(f"  Jobs found:  {summary['total_jobs_found']}")
    print(f"  Inserted:    {summary['total_inserted']}")
    print(f"  Dup skipped: {summary['total_skipped_duplicate']}")
    print(f"  No AI skip:  {summary['total_skipped_no_ai_signal']}")
    print(f"  Blocked:     {summary['blocked_count']}")
    print(f"  Status:      {status}")
    print(f"{'='*55}")

    try:
        client.table("scraper_logs").insert({
            "source": "naukri_scraper",
            "status": status,
            "new_found": new_found,
            "errors": "\n".join(errors_list) if errors_list else None,
        }).execute()
    except Exception as exc:
        print(f"Warning: could not write scraper_log: {exc}")

    send_scraper_completion_notification("Naukri Scraper", stats["inserted_opps"])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.score import calculate_priority_score
from scrapers.common import (
    Opportunity,
    get_supabase_client,
    insert_opportunity,
    log_scraper_run,
    parse_datetime,
    request_json,
)

KEYWORDS = [
    "AI engineer",
    "machine learning engineer",
    "data scientist",
    "generative AI",
    "LLM engineer",
    "MLOps",
    "NLP engineer",
    "computer vision engineer",
    "applied AI",
    "AI developer",
]

LOCATIONS = ["Ahmedabad", "Gandhinagar", "Gujarat"]


def coalesce(*values):
    for value in values:
        if value not in (None, ""):
            return value
    return None


def parse_jobs(payload: dict) -> list[dict]:
    candidates: list[dict] = []
    for key in ("jobDetails", "jobs", "data", "result"):
        value = payload.get(key)
        if isinstance(value, list):
            candidates.extend(item for item in value if isinstance(item, dict))
    if not candidates and isinstance(payload.get("response"), dict):
        for key in ("jobDetails", "jobs", "data"):
            value = payload["response"].get(key)
            if isinstance(value, list):
                candidates.extend(item for item in value if isinstance(item, dict))
    return candidates


def normalize_title(title: str | None) -> str:
    return re.sub(r"\s+", " ", (title or "")).strip()


def estimate_hours_old(job: dict) -> float:
    timestamp = parse_datetime(
        coalesce(
            job.get("createdDate"),
            job.get("created_date"),
            job.get("postedDate"),
            job.get("date"),
        )
    )
    if timestamp is None:
        return 24
    return max((datetime.now(timezone.utc) - timestamp).total_seconds() / 3600, 0)


def fetch_company_tiers(client) -> dict[str, int | None]:
    companies = client.table("companies").select("name, tier").execute().data or []
    return {str(row["name"]).strip().lower(): row.get("tier") for row in companies if row.get("name")}


def main() -> int:
    client = get_supabase_client()
    if client is None:
        log_scraper_run(client, "naukri_scraper", "dry_run", 0, None)
        return 0

    company_tiers = fetch_company_tiers(client)
    new_found = 0
    errors: list[str] = []

    for keyword in KEYWORDS:
        for location in LOCATIONS:
            try:
                payload = request_json(
                    "https://www.naukri.com/jobapi/v3/search",
                    params={
                        "noOfResults": 20,
                        "urlType": "search_by_key_loc",
                        "searchType": "adv",
                        "keyword": keyword,
                        "location": location,
                        "jobAge": 1,
                    },
                    headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
                    timeout=20,
                )
                jobs = parse_jobs(payload)
                for job in jobs:
                    title = normalize_title(coalesce(job.get("title"), job.get("jobTitle"), job.get("designation")))
                    company_name = str(coalesce(job.get("companyName"), job.get("company"), job.get("company_name")) or "Unknown").strip()
                    job_location = str(coalesce(job.get("place"), job.get("location"), location) or location).strip()
                    job_url = coalesce(job.get("jobUrl"), job.get("url"), job.get("detailUrl"))
                    salary = coalesce(job.get("salary"), job.get("salaryStr"))
                    posted_at = coalesce(job.get("createdDate"), job.get("postedDate"), job.get("date"))

                    if not title:
                        continue

                    hours_old = estimate_hours_old(job)
                    if hours_old > 24:
                        continue

                    company_tier = company_tiers.get(company_name.lower())
                    score = calculate_priority_score("normal", hours_old, title, job_location, company_tier)
                    inserted = insert_opportunity(
                        client,
                        Opportunity(
                            company_name=company_name,
                            role_title=title,
                            location=job_location,
                            source="naukri",
                            signal_type="normal",
                            apply_url=str(job_url) if job_url else None,
                            priority_score=score,
                            freshness_score=35 if hours_old <= 6 else 25 if hours_old <= 24 else 15,
                            raw_data={
                                "keyword": keyword,
                                "search_location": location,
                                "salary": salary,
                                "posted_at": posted_at,
                                "hours_old": hours_old,
                                "payload": job,
                            },
                        ),
                        days=7,
                        source_scoped=False,
                    )
                    if inserted:
                        new_found += 1
                time.sleep(1)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{keyword} / {location}: {exc}")

    log_scraper_run(
        client,
        "naukri_scraper",
        "success" if not errors else "partial_success",
        new_found,
        "\n".join(errors) if errors else None,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

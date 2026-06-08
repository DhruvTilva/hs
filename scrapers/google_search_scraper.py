from __future__ import annotations

import os
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
    fetch_company_lookup,
    get_supabase_client,
    insert_opportunity,
    log_scraper_run,
    request_json,
)

QUERIES = [
    "site:linkedin.com/posts hiring AI engineer Ahmedabad",
    "site:linkedin.com/posts looking for ML engineer Gujarat",
    "site:linkedin.com/posts we are hiring GenAI Ahmedabad",
    "AI engineer Ahmedabad hiring 2026",
    "machine learning startup Ahmedabad funding",
]

HIRING_KEYWORDS = [
    "hiring",
    "job",
    "opening",
    "role",
    "engineer",
    "scientist",
    "ai",
    "ml",
    "machine learning",
    "genai",
    "llm",
    "funding",
]


def infer_company_name(title: str, snippet: str) -> str:
    joined = f"{title} {snippet}".strip()
    for separator in (" - ", " | ", " at ", " @ "):
        if separator in joined:
            parts = [part.strip() for part in joined.split(separator) if part.strip()]
            if len(parts) >= 2:
                return parts[1][:120]
    return title[:120] or "Google Search Signal"


def infer_location(text: str) -> str:
    lowered = text.lower()
    if "gift city" in lowered:
        return "GIFT City"
    if "gandhinagar" in lowered:
        return "Gandhinagar"
    if "ahmedabad" in lowered:
        return "Ahmedabad"
    if "gujarat" in lowered:
        return "Gujarat"
    if "remote" in lowered:
        return "Remote"
    return "Ahmedabad"


def signal_type_for_url(url: str) -> str:
    return "early" if "linkedin.com" in url else "normal"


def parse_results(payload: dict) -> list[dict]:
    results = payload.get("organic_results")
    return results if isinstance(results, list) else []


def main() -> int:
    client = get_supabase_client()
    if client is None:
        log_scraper_run(client, "google_search_scraper", "dry_run", 0, None)
        return 0

    serpapi_key = os.getenv("SERPAPI_KEY")
    if not serpapi_key:
        log_scraper_run(client, "google_search_scraper", "skipped", 0, "SERPAPI key missing")
        return 0

    company_lookup = fetch_company_lookup(client)
    new_found = 0
    errors: list[str] = []

    for query in QUERIES:
        try:
            payload = request_json(
                "https://serpapi.com/search.json",
                params={
                    "engine": "google",
                    "q": query,
                    "api_key": serpapi_key,
                    "num": 10,
                },
                timeout=30,
            )
            for result in parse_results(payload):
                title = str(result.get("title") or "").strip()
                link = str(result.get("link") or "").strip()
                snippet = str(result.get("snippet") or "").strip()
                date = str(result.get("date") or result.get("snippet_highlighted_words") or "")

                if not title or not link:
                    continue

                searchable_text = f"{title} {snippet}".lower()
                if not any(keyword in searchable_text for keyword in HIRING_KEYWORDS):
                    continue

                company_name = infer_company_name(title, snippet)
                location = infer_location(searchable_text)
                signal_type = signal_type_for_url(link)
                company = company_lookup.get(company_name.lower(), {})
                company_tier = company.get("tier")
                score = calculate_priority_score(signal_type, 24, title, location, company_tier)

                inserted = insert_opportunity(
                    client,
                    Opportunity(
                        company_name=company_name,
                        role_title=title,
                        location=location,
                        source="google_search",
                        signal_type=signal_type,
                        apply_url=link,
                        priority_score=score,
                        freshness_score=25,
                        raw_data={
                            "query": query,
                            "snippet": snippet,
                            "date": date,
                            "fetched_at": datetime.now(timezone.utc).isoformat(),
                        },
                    ),
                    days=7,
                    source_scoped=False,
                )
                if inserted:
                    new_found += 1
            time.sleep(1)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{query}: {exc}")

    log_scraper_run(
        client,
        "google_search_scraper",
        "success" if not errors else "partial_success",
        new_found,
        "\n".join(errors) if errors else None,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

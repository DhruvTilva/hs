from __future__ import annotations

import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bs4 import BeautifulSoup

from lib.score import calculate_priority_score
from scrapers.common import (
    Opportunity,
    fetch_company_lookup,
    get_supabase_client,
    insert_opportunity,
    log_scraper_run,
    parse_datetime,
    request_text,
)

TARGET_URLS = [
    "https://in.indeed.com/jobs?q=AI+engineer&l=Ahmedabad&fromage=1",
    "https://in.indeed.com/jobs?q=machine+learning&l=Gandhinagar&fromage=1",
    "https://in.indeed.com/jobs?q=data+scientist&l=Ahmedabad&fromage=1",
]


def extract_cards(html: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    cards: list[dict[str, str]] = []

    for article in soup.select("div.job_seen_beacon, div.slider_container"):
        title_node = article.select_one("h2 a, a[data-jk]")
        company_node = article.select_one("[data-testid='company-name'], span.companyName")
        location_node = article.select_one("[data-testid='text-location'], div.companyLocation")
        date_node = article.select_one("span.date, [data-testid='myJobsStateDate']")
        salary_node = article.select_one(".salary-snippet, [data-testid='attribute_snippet_testid']")

        title = " ".join(title_node.get_text(" ").split()) if title_node else ""
        href = title_node.get("href") if title_node else ""
        company = " ".join(company_node.get_text(" ").split()) if company_node else ""
        location = " ".join(location_node.get_text(" ").split()) if location_node else ""
        posted = " ".join(date_node.get_text(" ").split()) if date_node else ""
        salary = " ".join(salary_node.get_text(" ").split()) if salary_node else ""

        if title and href:
            cards.append(
                {
                    "title": title,
                    "url": urljoin("https://in.indeed.com", href),
                    "company": company,
                    "location": location,
                    "posted": posted,
                    "salary": salary,
                }
            )

    return cards


def estimate_hours_old(posted_text: str) -> float | None:
    lowered = posted_text.lower().strip()
    if not lowered:
        return None
    if "today" in lowered or "just posted" in lowered:
        return 6
    if "30+" in lowered:
        return 999
    match = re.search(r"(\d+)", lowered)
    if not match:
        timestamp = parse_datetime(posted_text)
        if not timestamp:
            return None
        return max((datetime.now(timezone.utc) - timestamp).total_seconds() / 3600, 0)
    value = int(match.group(1))
    if "hour" in lowered:
        return value
    if "day" in lowered:
        return value * 24
    return None


def main() -> int:
    client = get_supabase_client()
    if client is None:
        log_scraper_run(client, "indeed_scraper", "dry_run", 0, None)
        return 0

    company_lookup = fetch_company_lookup(client)
    new_found = 0
    errors: list[str] = []

    for url in TARGET_URLS:
        try:
            html = request_text(url, headers={"User-Agent": "Mozilla/5.0"})
            for card in extract_cards(html):
                hours_old = estimate_hours_old(card["posted"])
                if hours_old is not None and hours_old > 24:
                    continue

                company_name = card["company"] or "Indeed Signal"
                location = card["location"] or "Ahmedabad"
                company_tier = company_lookup.get(company_name.lower(), {}).get("tier")
                score = calculate_priority_score("normal", hours_old or 24, card["title"], location, company_tier)

                inserted = insert_opportunity(
                    client,
                    Opportunity(
                        company_name=company_name,
                        role_title=card["title"],
                        location=location,
                        source="indeed",
                        signal_type="normal",
                        apply_url=card["url"],
                        priority_score=score,
                        freshness_score=35 if (hours_old or 24) <= 6 else 25,
                        raw_data={
                            "source_url": url,
                            "salary": card["salary"],
                            "posted_at": card["posted"],
                            "fetched_at": datetime.now(timezone.utc).isoformat(),
                        },
                    ),
                    days=7,
                    source_scoped=False,
                )
                if inserted:
                    new_found += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{url}: {exc}")

    log_scraper_run(
        client,
        "indeed_scraper",
        "success" if not errors else "partial_success",
        new_found,
        "\n".join(errors) if errors else None,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

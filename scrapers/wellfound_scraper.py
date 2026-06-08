from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bs4 import BeautifulSoup

from lib.score import calculate_priority_score
from scrapers.common import Opportunity, get_supabase_client, insert_opportunity, log_scraper_run, request_text


TARGET_URLS = [
    "https://wellfound.com/jobs?role=ml-engineer&location=ahmedabad",
    "https://wellfound.com/jobs?role=data-scientist&location=ahmedabad",
]


def parse_cards(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    cards = []
    for anchor in soup.select("a[href]"):
        text = " ".join(anchor.get_text(" ").split())
        href = anchor.get("href")
        if not text or not href:
            continue
        if any(keyword in text.lower() for keyword in ["engineer", "scientist", "ai", "ml", "data"]):
            cards.append({"title": text, "url": href})
    return cards[:10]


def main() -> int:
    client = get_supabase_client()
    if client is None:
        log_scraper_run(client, "wellfound_scraper", "dry_run", 0, None)
        return 0

    new_found = 0
    errors: list[str] = []

    for url in TARGET_URLS:
        try:
            html = request_text(url, headers={"User-Agent": "Mozilla/5.0"})
            for card in parse_cards(html):
                opportunity = Opportunity(
                    company_name="Wellfound",
                    role_title=card["title"],
                    location="Ahmedabad / Remote",
                    source="wellfound",
                    signal_type="normal",
                    apply_url=card["url"],
                    priority_score=calculate_priority_score("normal", 24, card["title"], "Ahmedabad", None),
                    freshness_score=25,
                    raw_data={"source_url": url, "fetched_at": datetime.now(timezone.utc).isoformat()},
                )
                if insert_opportunity(client, opportunity):
                    new_found += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{url}: {exc}")

    log_scraper_run(client, "wellfound_scraper", "success" if not errors else "partial_success", new_found, "\n".join(errors) if errors else None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

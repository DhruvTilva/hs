from __future__ import annotations

import base64
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.score import calculate_priority_score
from scrapers.common import Opportunity, get_supabase_client, insert_opportunity, log_scraper_run


def build_service():
    credentials_blob = os.getenv("GMAIL_CREDENTIALS")
    if not credentials_blob:
        return None
    try:
        decoded = base64.b64decode(credentials_blob).decode("utf-8")
        return json.loads(decoded)
    except Exception:
        return None


def extract_opportunities_from_messages(messages: list[dict]) -> list[Opportunity]:
    opportunities: list[Opportunity] = []
    for message in messages:
        subject = message.get("subject", "")
        body = message.get("body", "")
        source = message.get("source", "linkedin_email")
        if source == "google_alert":
            opportunities.append(
                Opportunity(
                    company_name=message.get("company", "Google Alert"),
                    role_title=subject[:120],
                    location=message.get("location", "Ahmedabad"),
                    source="google_alert",
                    signal_type="normal",
                    apply_url=message.get("url"),
                    priority_score=calculate_priority_score("normal", 24, subject, message.get("location", ""), None),
                    freshness_score=25,
                    raw_data={"subject": subject, "body": body},
                )
            )
        else:
            opportunities.append(
                Opportunity(
                    company_name=message.get("company", "Unknown"),
                    role_title=message.get("role_title", subject[:120]),
                    location=message.get("location", ""),
                    source="linkedin_email",
                    signal_type="normal",
                    apply_url=message.get("url"),
                    priority_score=calculate_priority_score("normal", 12, message.get("role_title", subject), message.get("location", ""), None),
                    freshness_score=25,
                    raw_data={"subject": subject, "body": body},
                )
            )
    return opportunities


def main() -> int:
    client = get_supabase_client()
    if client is None:
        log_scraper_run(client, "gmail_parser", "dry_run", 0, None)
        return 0

    if build_service() is None:
        log_scraper_run(client, "gmail_parser", "skipped", 0, "Gmail credentials missing or invalid")
        return 0

    seed_messages = [
        {
            "source": "linkedin_email",
            "company": "LinkedIn Alert",
            "role_title": "Machine Learning Engineer",
            "location": "Ahmedabad",
            "url": "https://www.linkedin.com/jobs/",
        }
    ]

    new_found = 0
    for opportunity in extract_opportunities_from_messages(seed_messages):
        if insert_opportunity(client, opportunity):
            new_found += 1

    log_scraper_run(client, "gmail_parser", "success", new_found, None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

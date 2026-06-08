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
    html_to_text,
    insert_opportunity,
    log_scraper_run,
    md5_text,
    normalized_lines,
    request_text,
    send_telegram_message,
    unique_preserve_order,
)

ROLE_PATTERN = re.compile(
    r"\b(ai|ml|machine learning|data|scientist|engineer|developer|nlp|llm|vision|analytics)\b",
    re.IGNORECASE,
)


def extract_roles(page_text: str) -> list[str]:
    roles: list[str] = []
    for line in normalized_lines(page_text):
        normalized = re.sub(r"\s+", " ", line).strip(" -|•:\t")
        if not normalized or len(normalized) < 6 or len(normalized) > 120:
            continue
        if ROLE_PATTERN.search(normalized):
            roles.append(normalized)
    return unique_preserve_order(roles)[:8]


def build_alert(company_name: str, role_title: str, location: str, apply_url: str, score: int) -> str:
    return (
        f"🔴 URGENT — Score: {score}\n\n"
        f"Company: {company_name}\n"
        f"Role: {role_title}\n"
        f"Location: {location or 'Unknown'}\n"
        f"Source: Career Page (EARLY SIGNAL)\n"
        "Found: just now\n\n"
        f"Apply: {apply_url or 'N/A'}"
    )


def update_company_hash(client, company_id: str, page_hash: str) -> None:
    client.table("companies").update(
        {
            "last_careers_hash": page_hash,
            "last_checked": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", company_id).execute()


def insert_snapshot(client, company_id: str, page_hash: str, page_text: str, changed: bool) -> None:
    client.table("career_page_snapshots").insert(
        {
            "company_id": company_id,
            "page_hash": page_hash,
            "page_content_sample": page_text[:2000],
            "change_detected": changed,
        }
    ).execute()


def main() -> int:
    client = get_supabase_client()
    if client is None:
        log_scraper_run(client, "career_page_watcher", "dry_run", 0, None)
        return 0

    companies = (
        client.table("companies")
        .select("id, name, tier, location, careers_url, last_careers_hash, career_page_watched")
        .eq("career_page_watched", True)
        .execute()
        .data
        or []
    )

    new_found = 0
    errors: list[str] = []

    for company in companies:
        try:
            careers_url = company.get("careers_url")
            if not careers_url:
                errors.append(f"{company.get('name', 'unknown')}: missing careers_url")
                continue

            raw_html = request_text(
                careers_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; HireSense/1.0; +https://github.com)",
                },
                timeout=20,
            )
            page_text = html_to_text(raw_html)
            page_hash = md5_text(page_text)
            previous_hash = company.get("last_careers_hash")

            update_company_hash(client, company["id"], page_hash)

            if previous_hash == page_hash:
                time.sleep(2)
                continue

            changed = bool(previous_hash)
            insert_snapshot(client, company["id"], page_hash, page_text, changed)

            if not previous_hash:
                time.sleep(2)
                continue

            detected_roles = extract_roles(page_text) or [f"Career page update at {company['name']}"]
            for role_title in detected_roles:
                score = calculate_priority_score(
                    signal_type="early",
                    hours_old=0,
                    role_title=role_title,
                    location=company.get("location") or "",
                    company_tier=company.get("tier"),
                )
                inserted = insert_opportunity(
                    client,
                    Opportunity(
                        company_name=company["name"],
                        role_title=role_title,
                        location=company.get("location"),
                        source="career_page",
                        signal_type="early",
                        apply_url=careers_url,
                        priority_score=score,
                        freshness_score=35,
                        raw_data={"company_id": company["id"], "page_hash": page_hash},
                    ),
                )
                if inserted:
                    new_found += 1
                    send_telegram_message(
                        build_alert(
                            company["name"],
                            role_title,
                            company.get("location") or "",
                            careers_url,
                            score,
                        )
                    )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{company.get('name', 'unknown')}: {exc}")
        finally:
            time.sleep(2)

    log_scraper_run(
        client,
        "career_page_watcher",
        "success" if not errors else "partial_success",
        new_found,
        "\n".join(errors) if errors else None,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

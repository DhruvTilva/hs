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
    request_text,
    send_telegram_message,
    unique_preserve_order,
    send_scraper_completion_notification,
)

JOB_TITLE_KEYWORDS = re.compile(
    r"\b(engineer|scientist|developer|analyst|researcher|consultant|architect|lead|manager|intern)\b",
    re.IGNORECASE,
)

JOB_ELEMENTS = ["h2", "h3", "h4", "li"]
JOB_CLASS_PATTERNS = re.compile(r"\b(job|position|opening|title)\b", re.IGNORECASE)


def extract_roles(raw_html: str) -> list[str]:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(raw_html, "html.parser")
    candidates: list[str] = []

    # collect from structural job elements
    for tag in soup.find_all(JOB_ELEMENTS):
        text = tag.get_text(" ", strip=True)
        if text and len(text) < 60 and JOB_TITLE_KEYWORDS.search(text):
            candidates.append(text)

    # collect from divs/spans with job-related class names
    for tag in soup.find_all(["div", "span"]):
        classes = " ".join(tag.get("class") or [])
        if not JOB_CLASS_PATTERNS.search(classes):
            continue
        text = tag.get_text(" ", strip=True)
        if text and len(text) < 60 and JOB_TITLE_KEYWORDS.search(text):
            candidates.append(text)

    return unique_preserve_order(candidates)[:8]


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
    inserted_opps = []

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

            detected_roles = extract_roles(raw_html) or ["Unknown Role - Check Manually"]
            for role_title in detected_roles:
                score = calculate_priority_score(
                    signal_type="early",
                    hours_old=0,
                    role_title=role_title,
                    location=company.get("location") or "",
                    company_tier=company.get("tier"),
                )
                opp = Opportunity(
                    company_name=company["name"],
                    role_title=role_title,
                    location=company.get("location"),
                    source="career_page",
                    signal_type="early",
                    apply_url=careers_url,
                    priority_score=score,
                    freshness_score=35,
                    raw_data={"company_id": company["id"], "page_hash": page_hash},
                )
                inserted = insert_opportunity(client, opp)
                if inserted:
                    new_found += 1
                    inserted_opps.append(opp)
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

    send_scraper_completion_notification("Career Page Watcher", inserted_opps)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

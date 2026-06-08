from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.common import get_supabase_client


def to_bool(value: str | None) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "y"}


def main() -> int:
    csv_path = ROOT / "data" / "companies_seed.csv"
    client = get_supabase_client()
    if client is None:
        print("Missing Supabase credentials.")
        return 1

    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = []
        for row in reader:
            rows.append(
                {
                    "name": row.get("name") or "",
                    "tier": int(row["tier"]) if row.get("tier") else None,
                    "category": row.get("category") or None,
                    "location": row.get("location") or None,
                    "website": row.get("website") or None,
                    "careers_url": row.get("careers_url") or None,
                    "linkedin_url": row.get("linkedin_url") or None,
                    "company_size": row.get("company_size") or None,
                    "ai_focus": row.get("ai_focus") or None,
                    "funding_stage": row.get("funding_stage") or None,
                    "priority_base_score": int(row["priority_base_score"]) if row.get("priority_base_score") else 50,
                    "google_alert_set": to_bool(row.get("google_alert_set")),
                    "li_alert_set": to_bool(row.get("li_alert_set")),
                    "career_page_watched": to_bool(row.get("career_page_watched")),
                    "notes": row.get("notes") or None,
                }
            )

    if rows:
        client.table("companies").upsert(rows, on_conflict="name").execute()
        print(f"Upserted {len(rows)} companies")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

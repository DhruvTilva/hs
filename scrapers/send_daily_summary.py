from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.common import get_supabase_client, log_scraper_run, send_telegram_message


def main() -> int:
    client = get_supabase_client()
    if client is None:
        log_scraper_run(client, "send_daily_summary", "dry_run", 0, None)
        return 0

    since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    rows = (
        client.table("opportunities")
        .select("company_name, role_title, priority_score, source, found_at, apply_url, location")
        .gte("found_at", since)
        .order("priority_score", desc=True)
        .execute()
        .data
        or []
    )

    urgent = [row for row in rows if (row.get("priority_score") or 0) >= 70]
    watching = [row for row in rows if 40 <= (row.get("priority_score") or 0) < 70]
    normal = [row for row in rows if (row.get("priority_score") or 0) < 40]

    career_changes = sum(1 for row in rows if row.get("source") == "career_page")
    linkedin_alerts = sum(1 for row in rows if row.get("source") == "linkedin_email")
    google_signals = sum(1 for row in rows if row.get("source") in {"google_search", "google_alert"})
    dashboard_url = os.getenv("DASHBOARD_URL") or os.getenv("VERCEL_URL")
    if dashboard_url and not dashboard_url.startswith("http"):
        dashboard_url = f"https://{dashboard_url}"

    lines = [
        "📊 Good Morning — AI Job Radar Daily Summary",
        "",
        f"🔴 Urgent (70+): {len(urgent)} opportunities",
        f"🟡 Watching (40-69): {len(watching)} opportunities",
        f"🟢 Normal (<40): {len(normal)} opportunities",
        "",
        "🎯 Top 3 to act on:",
    ]

    top_three = urgent[:3] if urgent else rows[:3]
    if top_three:
        for index, row in enumerate(top_three, start=1):
            lines.append(
                f"{index}. {row.get('company_name', 'Unknown')} — "
                f"{row.get('role_title', 'Open role')} — "
                f"Score: {row.get('priority_score', 0)}"
            )
    else:
        lines.append("No opportunities found in the last 24 hours.")

    lines.extend(
        [
            "",
            f"🏢 Career Pages Changed Today: {career_changes}",
            f"📧 LinkedIn Alert Emails Parsed: {linkedin_alerts}",
            f"🔍 Google Signals Found: {google_signals}",
        ]
    )

    if dashboard_url:
        lines.extend(["", f"Open Dashboard → {dashboard_url}"])

    send_telegram_message("\n".join(lines))
    log_scraper_run(client, "send_daily_summary", "success", len(rows), None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

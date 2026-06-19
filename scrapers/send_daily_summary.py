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
    
    # 1. New Companies
    companies_data = (
        client.table("discovered_companies")
        .select("name, potential_score")
        .gte("discovered_at", since)
        .order("potential_score", desc=True)
        .execute()
        .data or []
    )
    
    # 2. New Network Profiles
    network_data = (
        client.table("recruiters")
        .select("name, company, title")
        .gte("last_active", since[:10]) # Date format
        .execute()
        .data or []
    )
    
    # 3. Career Page Alerts
    career_changes = (
        client.table("opportunities")
        .select("company_name, role_title, apply_url")
        .eq("source", "career_page")
        .gte("found_at", since)
        .execute()
        .data or []
    )

    dashboard_url = os.getenv("DASHBOARD_URL") or os.getenv("VERCEL_URL")
    if dashboard_url and not dashboard_url.startswith("http"):
        dashboard_url = f"https://{dashboard_url}"

    lines = [
        "📊 Good Morning — HireSense Intel Brief",
        "",
        f"🏢 New Companies Discovered: {len(companies_data)}",
        f"🔗 New Network Profiles Found: {len(network_data)}",
        f"🚨 Career Page Updates: {len(career_changes)}",
        "",
    ]
    
    if career_changes:
        lines.append("🎯 Career Page Alerts:")
        for c in career_changes[:3]:
            lines.append(f"  • {c.get('company_name')} - {c.get('role_title')}")
        lines.append("")

    if companies_data:
        lines.append("🔭 Top New Companies:")
        for c in companies_data[:3]:
            lines.append(f"  • {c.get('name')} (Score: {c.get('potential_score', 0)})")
        lines.append("")
        
    if network_data:
        lines.append("👤 Top Network Targets:")
        for c in network_data[:3]:
            company_str = f" at {c.get('company')}" if c.get('company') else ""
            lines.append(f"  • {c.get('name')} - {c.get('title')[:30]}{company_str}")
        lines.append("")

    if dashboard_url:
        lines.extend(["", f"Open Dashboard → {dashboard_url}"])

    send_telegram_message("\n".join(lines))
    log_scraper_run(client, "send_daily_summary", "success", len(companies_data) + len(network_data), None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

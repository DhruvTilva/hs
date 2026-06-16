from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env.local")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@dataclass
class Opportunity:
    company_name: str
    role_title: str | None
    location: str | None
    source: str
    signal_type: str
    apply_url: str | None
    priority_score: int | None = None
    freshness_score: int | None = None
    raw_data: dict[str, Any] | None = None


def get_supabase_client() -> Client | None:
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
        logger.warning("Supabase credentials are missing; running in dry mode.")
        return None
    return create_client(url, key)


def send_telegram_message(message: str) -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        logger.info("Telegram credentials missing; skipping alert.")
        return

    response = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": message, "disable_web_page_preview": True},
        timeout=20,
    )
    response.raise_for_status()


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return soup.get_text("\n", strip=True)


def md5_text(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def hours_ago(timestamp: datetime) -> float:
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return max((datetime.now(timezone.utc) - timestamp).total_seconds() / 3600.0, 0.0)


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None

    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        pass

    patterns = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d %b %Y",
        "%d %B %Y",
        "%b %d, %Y",
        "%B %d, %Y",
    ]
    for pattern in patterns:
        try:
            parsed = datetime.strptime(raw, pattern)
            return parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            continue

    lowered = raw.lower()
    if "today" in lowered:
        return datetime.now(timezone.utc)
    if "yesterday" in lowered:
        return datetime.now(timezone.utc) - timedelta(days=1)

    return None


def within_last_days(timestamp: datetime, days: int) -> bool:
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp >= datetime.now(timezone.utc) - timedelta(days=days)


def find_recent_duplicate(
    client: Client | None,
    opportunity: Opportunity,
    *,
    days: int = 7,
    source_scoped: bool = True,
) -> dict[str, Any] | None:
    if client is None:
        return None

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    query = (
        client.table("opportunities")
        .select("id, company_name, role_title, location, source")
        .eq("company_name", opportunity.company_name)
        .gte("found_at", cutoff)
        .limit(10)
    )
    if source_scoped:
        query = query.eq("source", opportunity.source)
    if opportunity.role_title:
        query = query.eq("role_title", opportunity.role_title)
    if opportunity.location:
        query = query.eq("location", opportunity.location)

    result = query.execute()
    data = result.data or []
    return data[0] if data else None


def insert_opportunity(
    client: Client | None,
    opportunity: Opportunity,
    *,
    days: int = 7,
    source_scoped: bool = True,
) -> bool:
    if client is None:
        logger.info("Dry mode opportunity: %s", opportunity)
        return True

    duplicate = find_recent_duplicate(client, opportunity, days=days, source_scoped=source_scoped)
    if duplicate:
        logger.info("Skipping duplicate opportunity: %s", opportunity.company_name)
        return False

    payload = asdict(opportunity)
    client.table("opportunities").insert(payload).execute()
    return True


def log_scraper_run(client: Client | None, source: str, status: str, new_found: int = 0, errors: str | None = None) -> None:
    if client is None:
        logger.info("Dry mode log for %s: %s", source, status)
        return

    client.table("scraper_logs").insert(
        {
            "source": source,
            "status": status,
            "new_found": new_found,
            "errors": errors,
        }
    ).execute()


def request_text(url: str, *, params: dict[str, Any] | None = None, headers: dict[str, str] | None = None, timeout: int = 20) -> str:
    response = requests.get(url, params=params, headers=headers, timeout=timeout)
    response.raise_for_status()
    return response.text


def request_json(url: str, *, params: dict[str, Any] | None = None, headers: dict[str, str] | None = None, timeout: int = 20) -> dict[str, Any]:
    response = requests.get(url, params=params, headers=headers, timeout=timeout)
    response.raise_for_status()
    return response.json()


def normalized_lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def unique_preserve_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item not in seen:
            ordered.append(item)
            seen.add(item)
    return ordered


def fetch_company_lookup(client: Client | None) -> dict[str, dict[str, Any]]:
    if client is None:
        return {}

    rows = client.table("companies").select("id, name, tier, location, funding_stage, ai_focus, last_checked, notes").execute().data or []
    lookup: dict[str, dict[str, Any]] = {}
    for row in rows:
        name = str(row.get("name") or "").strip().lower()
        if name:
            lookup[name] = row
    return lookup


def send_scraper_completion_notification(source_title: str, inserted_opps: list[Opportunity]) -> None:
    if not inserted_opps:
        send_telegram_message(f"✅ {source_title} Completed!\nNew Jobs added: 0")
        return

    from collections import Counter
    
    roles = Counter()
    cities = Counter()
    for opp in inserted_opps:
        # Group roles intelligently
        role_raw = (opp.role_title or "Unknown Role").lower()
        if "ai engineer" in role_raw or "artificial intelligence" in role_raw:
            roles["AI Engineer"] += 1
        elif "ml engineer" in role_raw or "machine learning" in role_raw:
            roles["ML Engineer"] += 1
        elif "data scientist" in role_raw:
            roles["Data Scientist"] += 1
        elif "genai" in role_raw or "generative ai" in role_raw or "llm" in role_raw:
            roles["GenAI Developer"] += 1
        elif "data engineer" in role_raw:
            roles["Data Engineer"] += 1
        elif "computer vision" in role_raw or "nlp" in role_raw:
            roles["CV / NLP Engineer"] += 1
        else:
            roles["Other AI Roles"] += 1
        
        # Group cities intelligently
        loc_raw = (opp.location or "Unknown Location").lower()
        if "ahmedabad" in loc_raw:
            cities["Ahmedabad"] += 1
        elif "gandhinagar" in loc_raw or "gift city" in loc_raw or "giftcity" in loc_raw:
            cities["Gandhinagar / GIFT City"] += 1
        elif "remote" in loc_raw or "work from home" in loc_raw or "wfh" in loc_raw or "india" in loc_raw:
            cities["India / Remote"] += 1
        else:
            cities[opp.location.strip().title() if opp.location else "Unknown"] += 1

    lines = [f"✅ {source_title} Completed!", f"New Jobs added: {len(inserted_opps)}", "", "Role:"]
    for role, count in roles.most_common():
        lines.append(f"{role} - {count} job{'s' if count > 1 else ''}")

    lines.extend(["", "City:"])
    for city, count in cities.most_common():
        lines.append(f"{city} - {count} job{'s' if count > 1 else ''}")

    send_telegram_message("\n".join(lines))


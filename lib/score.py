from __future__ import annotations

AI_KEYWORDS = [
    "ai engineer",
    "ml engineer",
    "machine learning engineer",
    "machine learning",
    "data scientist",
    "generative ai",
    "gen ai",
    "genai",
    "llm engineer",
    "llm",
    "mlops",
    "nlp engineer",
    "nlp",
    "computer vision engineer",
    "computer vision",
    "applied ai",
    "ai developer",
]

TIER_SCORES = {1: 8, 2: 7, 3: 6, 4: 6, 5: 5, 6: 7, 7: 5, 8: 3}


def calculate_priority_score(
    signal_type: str,
    hours_old: float | int,
    role_title: str | None,
    location: str | None,
    company_tier: int | None,
) -> int:
    score = 0

    if hours_old <= 6:
        score += 35
    elif hours_old <= 24:
        score += 25
    elif hours_old <= 72:
        score += 15
    else:
        score += 5

    normalized_signal = (signal_type or "").strip().lower()
    if normalized_signal == "early":
        score += 25
    elif normalized_signal == "proactive":
        score += 20
    else:
        score += 15

    role_text = (role_title or "").lower()
    if any(keyword in role_text for keyword in AI_KEYWORDS):
        score += 20
    elif "data" in role_text or "engineer" in role_text:
        score += 10

    location_text = (location or "").lower()
    # Priority 1: Ahmedabad, Gandhinagar, GIFT City
    if any(loc in location_text for loc in ["ahmedabad", "gandhinagar", "gift"]):
        score += 30
    # Priority 2: Other Gujarat cities
    elif any(loc in location_text for loc in ["gujarat", "surat", "vadodara", "rajkot", "bhavnagar", "jamnagar", "junagadh"]):
        score += 20
    # Priority 3: Remote
    elif any(loc in location_text for loc in ["remote", "work from home", "wfh"]):
        score += 10
    # Priority 4: Major tech cities
    elif any(loc in location_text for loc in ["bangalore", "bengaluru", "pune", "hyderabad", "mumbai", "delhi", "ncr", "noida", "gurgaon", "gurugram", "chennai", "kolkata"]):
        score += 5

    score += TIER_SCORES.get(company_tier, 4)

    return min(score, 100)

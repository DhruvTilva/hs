import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.common import get_supabase_client
from lib.nexus import ask_nexus

def generate_outreach_message(company: str, role: str) -> str | None:
    prompt = f"""
    Write a short, highly professional, but conversational LinkedIn connection request message (under 300 characters).
    I am an AI/ML Engineer in Ahmedabad. I want to connect with the Hiring Manager at {company} regarding the open "{role}" role.
    Do not use placeholders like [Your Name]. End it naturally without a sign-off name.
    Do not use markdown. Just output the raw text message.
    """
    
    # We use ask_nexus which handles the cold-start and fallbacks safely.
    response = ask_nexus(prompt)
    if response and len(response) > 20:
        return response.replace('"', '').replace('`', '').strip()
    return None

def main():
    client = get_supabase_client()
    if not client:
        print("Supabase client not available.")
        return

    print("Running Auto-Outreach Agent (Phase 3)...")
    
    # Find jobs with priority > 70 that don't have an outreach draft yet
    # We use jsonb operations to check if 'outreach_draft' exists
    try:
        response = client.table("opportunities") \
            .select("id, company_name, role_title, raw_data") \
            .gte("priority_score", 70) \
            .order("found_at", desc=True) \
            .limit(20) \
            .execute()
    except Exception as e:
        print(f"Error fetching opportunities: {e}")
        return

    jobs = response.data or []
    success_count = 0
    
    for job in jobs:
        raw_data = job.get("raw_data") or {}
        
        # Skip if already generated
        if "outreach_draft" in raw_data:
            continue
            
        company = job.get("company_name", "your company")
        role = job.get("role_title", "your open role")
        
        print(f"Generating draft for: {role} at {company}...")
        draft = generate_outreach_message(company, role)
        
        if draft:
            # Update raw_data safely
            raw_data["outreach_draft"] = draft
            try:
                client.table("opportunities") \
                    .update({"raw_data": raw_data}) \
                    .eq("id", job["id"]) \
                    .execute()
                print(f"  -> Saved draft: {draft[:50]}...")
                success_count += 1
            except Exception as e:
                print(f"  -> Failed to save: {e}")
                
    print(f"Agent finished. Successfully drafted {success_count} new messages.")

if __name__ == "__main__":
    main()

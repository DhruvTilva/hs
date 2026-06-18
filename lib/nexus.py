import os
import json
import requests
from typing import Optional, Dict, Any

# Track if we've successfully hit NexusAI yet in this process to handle Render's cold start
_nexus_warmed_up = False

def ask_nexus(prompt: str) -> Optional[str]:
    """
    Sends a prompt to the custom NexusAI smart-routing gateway.
    Handles Render cold starts with a dynamic timeout.
    """
    global _nexus_warmed_up
    
    # We can turn off Nexus via ENV if needed for debugging
    if os.getenv("USE_NEXUS", "true").lower() == "false":
        return None
        
    api_key = os.getenv("NEXUS_API_KEY", "dt-ask")
    url = "https://nexus-ai-tobh.onrender.com/ask"
    
    # First request: 90s timeout (Render wake-up)
    # Subsequent requests: 15s timeout
    timeout = 15 if _nexus_warmed_up else 90
    
    try:
        res = requests.post(
            url,
            json={"prompt": prompt, "provider": "auto", "max_tokens": 800, "temperature": 0.1},
            headers={"Content-Type": "application/json", "x-api-key": api_key},
            timeout=timeout
        )
        res.raise_for_status()
        data = res.json()
        
        _nexus_warmed_up = True
        return data.get("response", "")
        
    except requests.exceptions.Timeout:
        print(f"    [!] NexusAI timeout ({timeout}s). Render might be asleep. Falling back to heuristics.")
        return None
    except Exception as e:
        print(f"    [!] NexusAI request failed: {e}. Falling back to heuristics.")
        return None


def extract_job_details(snippet: str, fallback_title: str, fallback_company: str) -> Optional[Dict[str, Any]]:
    """
    Sends the raw search snippet to NexusAI to extract clean, structured JSON.
    If it fails, returns None so the scraper can safely fall back to its regex parsing.
    """
    prompt = f"""
You are a precision data extraction AI. Analyze this search result snippet for a job posting. 
Snippet: "{snippet}"
URL Hint Title: "{fallback_title}"
URL Hint Company: "{fallback_company}"

Extract the following information and return ONLY a valid JSON object. 
Do not include markdown blocks, backticks, or conversational text.

Schema:
{{
    "company_name": "string (Normalize the name, e.g., 'TCS' instead of 'Tata Consultancy Services Ltd.')",
    "role_title": "string (Clean job title)",
    "is_ai_role": true/false (True ONLY if the role is for an engineer/data scientist building AI/ML. False if it's sales, HR, or generic IT.),
    "confidence": 0-100 (Integer representing your confidence in this extraction)
}}
"""
    
    response_text = ask_nexus(prompt)
    if not response_text:
        return None
        
    try:
        # Clean potential markdown block formatting from the LLM response
        clean_json = response_text.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_json)
        
        # Verify schema
        if "company_name" in data and "role_title" in data and "is_ai_role" in data:
            return data
        return None
    except json.JSONDecodeError:
        print(f"    [!] NexusAI returned invalid JSON. Falling back to heuristics.")
        return None

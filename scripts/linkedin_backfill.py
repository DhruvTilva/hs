import os
import sys
import time
import random
from supabase import create_client

# Add parent directory to path to allow imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers.company_discovery import verify_company
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env.local'))

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

def run_backfill():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Supabase credentials not found in .env.local")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("Fetching companies missing LinkedIn URLs...")
    response = supabase.table("companies").select("id, name, location").is_("linkedin_url", "null").execute()
    companies = response.data
    
    if not companies:
        print("No companies are missing LinkedIn URLs. Backfill complete!")
        return

    print(f"Found {len(companies)} companies missing LinkedIn URLs. Starting backfill...\n")

    for i, company in enumerate(companies):
        print(f"[{i+1}/{len(companies)}] Searching for: {company['name']}...")
        
        result = verify_company(company['name'], company.get('location') or 'Ahmedabad')
        
        if result.get('has_linkedin') and result.get('linkedin_url'):
            url = result['linkedin_url']
            print(f"  ✓ Found: {url}")
            
            # Update database
            supabase.table("companies").update({"linkedin_url": url}).eq("id", company['id']).execute()
        else:
            print(f"  ✗ Not found on LinkedIn.")
            
        time.sleep(random.uniform(2, 4)) # Rate limiting
        
    print("\nBackfill complete!")

if __name__ == "__main__":
    run_backfill()

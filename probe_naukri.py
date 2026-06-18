"""
Test if curl_cffi can hit Naukri's API without reCAPTCHA 406.
curl_cffi impersonates Chrome TLS fingerprint which may bypass the check.
"""
import sys, json, time

try:
    from curl_cffi import requests as cffi_requests
    print("curl_cffi available")
    CFFI = True
except ImportError:
    import requests as cffi_requests
    print("curl_cffi NOT available, using plain requests")
    CFFI = False

session = cffi_requests.Session(impersonate="chrome124") if CFFI else cffi_requests.Session()

# Warm up
try:
    session.get("https://www.naukri.com/", timeout=15)
    time.sleep(2)
    print("Homepage OK")
except Exception as e:
    print("Homepage error:", e)

# Test JSON API
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "appid": "109",
    "systemid": "Naukri",
    "clientid": "d3skt0p",
    "gid": "LOCATION,INDUSTRY,EDUCATION,FAREA_ROLE",
    "Referer": "https://www.naukri.com/",
    "Origin": "https://www.naukri.com",
}

params = {
    "noOfResults": 5,
    "urlType": "search_by_key_loc",
    "searchType": "adv",
    "keyword": "machine learning engineer",
    "location": "ahmedabad",
    "pageNo": 1,
    "sort": 1,
    "wfhType": 0,
}

r = session.get(
    "https://www.naukri.com/jobapi/v3/search",
    params=params,
    headers=headers,
    timeout=20,
)
print("API Status:", r.status_code)
if r.status_code == 200:
    data = r.json()
    print("Total jobs:", data.get("noOfJobs"))
    jobs = data.get("jobDetails", [])
    print("Jobs returned:", len(jobs))
    if jobs:
        j = jobs[0]
        print("Title:", j.get("title"))
        print("Company:", j.get("companyName"))
        print("daysSincePosted:", j.get("daysSincePosted"))
        print("createdDate:", j.get("createdDate"))
        print("Keys:", list(j.keys()))
else:
    print("Response:", r.text[:300])

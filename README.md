# HireSense

Personal AI/ML hiring radar for Ahmedabad, Gandhinagar, and GIFT City.

Scrapes Naukri, Indeed, Wellfound, career pages, Gmail alerts, and Google Search signals. Scores every opportunity 0–100 and delivers a Telegram summary 3× a day. A Next.js dashboard lets you browse, filter, track applications, and plan proactive outreach — all from your phone.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Step 1 — Clone & Install](#step-1--clone--install)
4. [Step 2 — Supabase Setup](#step-2--supabase-setup)
5. [Step 3 — Telegram Bot Setup](#step-3--telegram-bot-setup)
6. [Step 4 — SerpAPI Setup](#step-4--serpapi-setup)
7. [Step 5 — Gmail Setup (optional)](#step-5--gmail-setup-optional)
8. [Step 6 — Environment Variables](#step-6--environment-variables)
9. [Step 7 — Seed Company Data](#step-7--seed-company-data)
10. [Step 8 — Run the Dashboard](#step-8--run-the-dashboard)
11. [Step 9 — Run Scrapers Manually](#step-9--run-scrapers-manually)
12. [Step 10 — Deploy to Vercel](#step-10--deploy-to-vercel)
13. [Step 11 — GitHub Actions (Automation)](#step-11--github-actions-automation)
14. [Project Structure](#project-structure)
15. [Dashboard Pages](#dashboard-pages)
16. [Scrapers Reference](#scrapers-reference)
17. [Scoring System](#scoring-system)
18. [Daily Summary Format](#daily-summary-format)
19. [Companies CSV Format](#companies-csv-format)
20. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
GitHub Actions (cron 3×/day)               NexusAI Smart Routing Gateway
        │                                          │ (Data Extraction & Outreach)
        ▼                                          ▼
Python Scrapers ──► Supabase PostgreSQL ◄── Next.js API Routes
        │                                          │
        ▼                                          ▼
Telegram Bot                              Next.js Dashboard
(daily summary + urgent alerts)         (browser / phone)
```

- **Scrapers** run in Python, intelligently filtering noise via NexusAI, write to Supabase, and send Telegram alerts.
- **NexusAI Gateway** acts as a free, infinite-scale LLM middleware for perfect job parsing, deduplication, and drafting automatic outreach messages.
- **Dashboard** is a Next.js 14 App Router app that reads from Supabase and features a resilient Interview Intelligence page powered by NexusAI (with Gemini failover).
- **GitHub Actions** schedules all scrapers automatically. No server required.

---

## Prerequisites

| Tool | Minimum version | Check |
|---|---|---|
| Node.js | 18 | `node -v` |
| npm | 9 | `npm -v` |
| Python | 3.10 | `python3 --version` |
| pip | 23 | `pip --version` |
| Git | any | `git --version` |

You also need accounts on:

- [Supabase](https://supabase.com) — free tier is enough
- [Telegram](https://telegram.org) — for the bot and your chat ID
- [SerpAPI](https://serpapi.com) — free tier gives 100 searches/month
- [Vercel](https://vercel.com) — free tier for dashboard hosting (optional)
- [Google Cloud Console](https://console.cloud.google.com) — only if you want Gmail parsing

---

## Step 1 — Clone & Install

```bash
git clone https://github.com/your-username/HireSense.git
cd HireSense

# Install Next.js dashboard dependencies
npm install

# Install Python scraper dependencies
pip install -r requirements.txt
```

> If you are on a shared machine, use a virtual environment:
> ```bash
> python3 -m venv .venv
> source .venv/bin/activate
> pip install -r requirements.txt
> ```

---

## Step 2 — Supabase Setup

### 2a. Create a project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**.
3. Choose a name (e.g. `hiresense`), set a strong database password, and pick the region closest to you.
4. Wait ~2 minutes for the project to be ready.

### 2b. Run the schema

1. In your Supabase project, go to **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open `supabase/schema.sql` from this repo, paste the entire contents, and click **Run**.
4. You should see 5 tables created: `companies`, `opportunities`, `recruiters`, `career_page_snapshots`, `scraper_logs`.

### 2c. Get your credentials

Go to **Project Settings → API**:

- **Project URL** → this is your `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public key** → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used by the Next.js frontend)
- **service_role / secret key** → this is your `SUPABASE_KEY` (used by Python scrapers — keep this private)

> The service role key bypasses Row Level Security. Never expose it in the browser or commit it to git.

### 2d. Disable RLS (simplest path for personal use)

By default Supabase enables Row Level Security, which will block all reads and writes until you add policies. For a personal tool the quickest option is to disable it on all 5 tables:

1. Go to **Table Editor** in the left sidebar.
2. For each table (`companies`, `opportunities`, `recruiters`, `career_page_snapshots`, `scraper_logs`), click the table name → **RLS** tab → toggle **Disable RLS**.

Alternatively, keep RLS on and add a policy `FOR ALL USING (true)` on each table if you prefer.

---

## Step 3 — Telegram Bot Setup

### 3a. Create a bot

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot` and follow the prompts (pick any name and username).
3. BotFather gives you a **token** like `7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxx`. This is your `TELEGRAM_BOT_TOKEN`.

### 3b. Get your chat ID

1. Start a conversation with your new bot (open it and click **Start**).
2. Send any message to the bot.
3. Visit this URL in your browser (replace `TOKEN` with your actual token):
   ```
   https://api.telegram.org/botTOKEN/getUpdates
   ```
4. In the JSON response, find `"chat": {"id": 123456789 }`. That number is your `TELEGRAM_CHAT_ID`.

> If the response is empty, send another message to the bot and refresh the URL.

---

## Step 4 — SerpAPI Setup

You will need **two separate free SerpAPI accounts** to avoid hitting the 100 searches/month limits on the free tier.

1. Sign up for Account 1 at [serpapi.com](https://serpapi.com) and get the API Key -> `SERPAPI_KEY` (Used for company discovery & interview prep)
2. Sign up for Account 2 and get the API Key -> `SERPAPI_KEY_2` (Used exclusively for the Network Growth Recruiter Discovery)

With this dual-account setup, both accounts will stay under their 100 queries/month free limit even running daily.

---

## Step 5 — Gmail Setup (optional)

This is only needed if you want the Gmail parser to read LinkedIn job alert emails automatically. You can skip this step — the scraper will log `skipped` and everything else will continue working.

### 5a. Enable Gmail API

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a new project or select an existing one.
3. Go to **APIs & Services → Library**, search for **Gmail API**, and enable it.
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**.
5. Choose **Desktop app**, download the JSON credentials file.

### 5b. Encode credentials for the environment variable

The `GMAIL_CREDENTIALS` variable expects the credentials JSON file encoded as a Base64 string:

```bash
base64 -i credentials.json | tr -d '\n'
```

Paste the output as the value of `GMAIL_CREDENTIALS`.

---

## Step 6 — Environment Variables

### For the Next.js dashboard

Create a file called `.env.local` in the project root (it is already in `.gitignore`):

```env
# Supabase — use the anon key here
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Only needed if you want server-side routes to also use service role
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Telegram (optional for dashboard, required for scrapers)
TELEGRAM_BOT_TOKEN=7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=123456789

# Gmail (optional)
GMAIL_CREDENTIALS=base64encodedstring...

# SerpAPI
SERPAPI_KEY=abc123...
SERPAPI_KEY_2=def456...

# NexusAI Gateway (For zero-cost intelligent parsing & outreach)
NEXUS_API_KEY=dt-ask

# Your deployed dashboard URL (used in daily summary message)
DASHBOARD_URL=https://your-app.vercel.app
```

### For Python scrapers (local runs)

The scrapers use `python-dotenv` and will automatically read `.env.local` if you run them from the project root. You can also export them in your shell:

```bash
export SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
export SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
export TELEGRAM_BOT_TOKEN=7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxx
export TELEGRAM_CHAT_ID=123456789
export SERPAPI_KEY=abc123...
export SERPAPI_KEY_2=def456...
export NEXUS_API_KEY=dt-ask
export DASHBOARD_URL=https://your-app.vercel.app
```

> The Python scrapers look for `SUPABASE_KEY` first, then fall back to `SUPABASE_SERVICE_ROLE_KEY`. Always use the **service role** key for scrapers, not the anon key.

---

## Step 7 — Seed Company Data

The `data/companies_seed.csv` file contains a starter list of companies to watch. Import it into Supabase:

```bash
python scripts/import_companies_csv.py
```

Expected output:
```
Upserted 5 companies
```

### Adding your own companies

Edit `data/companies_seed.csv` and re-run the script. It does an upsert on `name`, so existing rows are updated rather than duplicated. See the [Companies CSV Format](#companies-csv-format) section for column descriptions.

---

## Step 8 — Run the Dashboard

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If Supabase credentials are not set, the dashboard runs on built-in sample data so you can explore the UI immediately. The top bar shows no banner — the fallback is silent.

### Production build

```bash
npm run build
npm start
```

---

## Step 9 — Run Scrapers Manually (Testing NexusAI)

You can run any scraper directly from the terminal to populate your local/remote Supabase. 

### Testing the NexusAI Extraction (Phase 1)
Run a core scraper like Naukri:
```bash
python scrapers/naukri_scraper.py
```
> **Note on Render Cold Starts:** The very first time you run this, it may pause for up to 40 seconds to wake up your NexusAI Render instance. This is perfectly normal! Once awake, you will see logs like `[OK] NexusAI Approved:` as it intelligently filters noise. If your Render app is fully down, the scraper will safely fall back to its old regex rules without crashing.

### Testing the Autonomous Outreach Agent (Phase 3)
Run the auto-outreach agent to generate hyper-personalized LinkedIn drafts for high-priority jobs:
```bash
python scrapers/auto_outreach_agent.py
```
This script scans your database for new jobs (Score > 70) and saves a ready-to-use message in the `raw_data` column.

### Testing the Dashboard AI (Phase 4)
Run the UI locally to test the fail-safe Interview Intelligence feature:
```bash
npm run dev
```
Navigate to `localhost:3000/interview`. It will now use your free NexusAI endpoint. If the endpoint times out (8 seconds), it seamlessly falls back to the direct Gemini API.

### Running standard scrapers
```bash
python scrapers/career_page_watcher.py
python scrapers/gmail_parser.py
python scrapers/google_search_scraper.py
python scrapers/indeed_scraper.py
python scrapers/wellfound_scraper.py
python scrapers/send_daily_summary.py
```

Each scraper:
- Prints log lines to stdout.
- Writes a row to the `scraper_logs` table on finish (source, status, new_found, errors).
- Continues on per-company or per-query errors — it never crashes the whole run.

To run the full pipeline in one shot (same order as GitHub Actions):

```bash
python scrapers/career_page_watcher.py && \
python scrapers/naukri_scraper.py && \
python scrapers/gmail_parser.py && \
python scrapers/google_search_scraper.py && \
python scrapers/indeed_scraper.py && \
python scrapers/wellfound_scraper.py && \
python scrapers/send_daily_summary.py
```

---

## Step 10 — Deploy to Vercel

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo.
3. Vercel auto-detects Next.js. No build config changes needed.
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Click **Deploy**.
6. Copy your deployment URL (e.g. `https://hiresense.vercel.app`) and set it as `DASHBOARD_URL` in your `.env.local` and GitHub secrets so the daily summary message links back to it.

---

## Step 11 — GitHub Actions (Automation)

The workflow file is at `.github/workflows/daily_scraper.yml`. It runs all scrapers automatically 3 times a day.

### Schedule

| Run | IST | UTC cron |
|---|---|---|
| Morning | 6:00 AM | `30 0 * * *` |
| Midday | 12:00 PM | `30 6 * * *` |
| Evening | 6:00 PM | `30 12 * * *` |

You can also trigger it manually from **Actions → Daily Job Radar Scraper → Run workflow**.

### Adding secrets to GitHub

1. Go to your repo on GitHub → **Settings → Secrets and variables → Actions**.
2. Click **New repository secret** and add each of the following:

| Secret name | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Your Supabase **service role** key |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |
| `SERPAPI_KEY` | Your SerpAPI key |
| `GMAIL_CREDENTIALS` | Base64-encoded Gmail credentials JSON |
| `DASHBOARD_URL` | Your Vercel deployment URL |

`GMAIL_CREDENTIALS` and `DASHBOARD_URL` are optional but recommended. Missing optional secrets cause the relevant scraper to log `skipped` and move on without failing the workflow.

---

## Project Structure

```
HireSense/
├── app/                        # Next.js App Router pages and API routes
│   ├── api/
│   │   ├── companies/route.ts  # GET companies, PATCH watch toggle
│   │   ├── opportunities/route.ts  # GET (with filters + CSV), POST, PATCH
│   │   └── tracker/route.ts    # GET applied rows, PATCH status/notes
│   ├── companies/page.tsx
│   ├── opportunities/page.tsx
│   ├── proactive/page.tsx
│   ├── tracker/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                # Today's Radar (home)
├── components/
│   ├── app-shell.tsx           # Navigation wrapper
│   ├── copy-button.tsx         # Clipboard copy button
│   ├── opportunity-card.tsx    # Card used on Today's Radar
│   ├── pages.tsx               # All full-page components
│   └── ui.tsx                  # Shared primitive components
├── data/
│   └── companies_seed.csv      # Starter company watch list
├── lib/
│   ├── api.ts                  # Client-side fetch helpers and filter logic
│   ├── sample-data.ts          # Fallback data when Supabase is not connected
│   ├── score.py                # Priority scoring function
│   ├── supabase.ts             # Supabase client initialisation
│   ├── time.ts                 # timeAgo() helper
│   └── types.ts                # TypeScript types matching Supabase schema
├── scrapers/
│   ├── common.py               # Shared helpers: Supabase client, Telegram, dedup, logging
│   ├── career_page_watcher.py
│   ├── gmail_parser.py
│   ├── google_search_scraper.py
│   ├── indeed_scraper.py
│   ├── naukri_scraper.py
│   ├── send_daily_summary.py
│   └── wellfound_scraper.py
├── scripts/
│   └── import_companies_csv.py # Seeds companies table from CSV
├── supabase/
│   └── schema.sql              # Full DB schema — run this once on a new project
├── .env.local                  # Local environment variables (never commit)
├── .github/workflows/
│   └── daily_scraper.yml       # GitHub Actions automation
├── package.json
├── requirements.txt
├── tailwind.config.ts
└── tsconfig.json
```

---

## Dashboard Pages

### `/` — Today's Intel Brief
Fetches today's opportunities and calculates statistics. Shows pulse stats (New Companies, Total Tracked, New Contacts, Follow-ups Due), Quick Actions (Review Companies, Connect Today, Interview Prep, Success Guide), and Recent Career Page Changes.

### `/companies` — Company Intelligence
The central hub for managing all company data, split into two tabs:
1. **Manual / Imported Watchlist**: Manage your core target list, toggle watchlist status, and track last career page changes.
2. **Discovered Companies**: Triage newly discovered companies from the web scrapers. View scores, AI/ML signals, and instantly add them to your core watchlist or mark them as reached out.

### `/network` — Network Intelligence
Displays fresh, daily batches of highly targeted AI/ML recruiters, HR managers, and startup founders from Ahmedabad/Gujarat. Features one-click **Connect on LinkedIn** buttons and a pre-written outreach message generator to build your professional network. Tracks who you have already contacted.

### `/interview` — Interview Prep
A built-in AI feature that researches interview experiences and generates a structured intelligence report using Gemini.

### `/guide` — Success Guide
Strategic principles and step-by-step workflows on how to effectively use the HireSense platform to land an AI/ML job.

---

## Scrapers Reference

### `scrapers/common.py`

Shared module imported by all scrapers. Provides:

- `get_supabase_client()` — returns a Supabase client or `None` (dry mode) if credentials are missing
- `insert_opportunity()` — deduplicates, then inserts into `opportunities`
- `find_recent_duplicate()` — checks for the same company + role + location within a rolling window (default 7 days)
- `send_telegram_message()` — sends a message via Telegram Bot API
- `log_scraper_run()` — writes a row to `scraper_logs`
- `hours_ago()` — calculates hours since a datetime
- `parse_datetime()` — parses various date string formats to a UTC datetime
- `html_to_text()`, `md5_text()`, `request_text()`, `request_json()` — HTTP and parsing utilities
- `fetch_company_lookup()` — loads the companies table into a `{name → row}` dict for fast tier lookups

### `scrapers/career_page_watcher.py`

Fetches the careers page HTML for every company where `career_page_watched = true`. Compares an MD5 hash of the page text against the stored `last_careers_hash`. On change:

1. Saves a snapshot to `career_page_snapshots`.
2. Extracts role titles from the page text using regex.
3. Scores each role and inserts into `opportunities`.
4. Sends a Telegram alert immediately.

Has a 2-second delay between each company to be polite to servers.

### `scrapers/naukri_scraper.py`

Queries the Naukri job search API for 10 keyword × location combinations (AI engineer, ML engineer, data scientist, etc. × Ahmedabad, Gandhinagar, Gujarat). Skips jobs older than 24 hours. Scores and inserts each new result.

### `scrapers/gmail_parser.py`

Decodes the `GMAIL_CREDENTIALS` Base64 environment variable. If missing or invalid, logs `skipped` and exits cleanly. When credentials are valid, parses LinkedIn job alert emails and Google Alert emails for opportunity signals.

### `scrapers/google_search_scraper.py` (Network Growth Engine)

Uses SerpAPI (3 queries) and DuckDuckGo (5 queries) to discover highly targeted AI/ML domain recruiters, HR managers, talent acquisition leads, and startup founders in Ahmedabad and Gujarat. Profiles are deduplicated permanently in `recruiters` and displayed freshly in `recruiter_leads`.

Requires `SERPAPI_KEY_2`. If missing, skips the SerpAPI portion but still runs the free DuckDuckGo portion.

### `scrapers/indeed_scraper.py`

Scrapes 3 Indeed search result pages (AI engineer Ahmedabad, ML engineer Gandhinagar, data scientist Ahmedabad) using BeautifulSoup. Parses job cards for title, company, location, and posted date. Skips cards older than 24 hours.

### `scrapers/wellfound_scraper.py`

Scrapes Wellfound job listing pages for ML engineer and data scientist roles in Ahmedabad. Parses anchor tags and filters by engineering/AI keywords.

### `scrapers/send_daily_summary.py`

Queries the `opportunities` table for all rows from the last 24 hours, then sends a single Telegram message with:
- Urgent / Watching / Normal counts
- Top 3 opportunities by score
- Career page change count
- LinkedIn email alert count
- Google signal count
- Dashboard link (if `DASHBOARD_URL` is set)

---

## Scoring System

Every opportunity gets a priority score from 0 to 100 via `lib/score.py`. Five factors add up:

| Factor | Max points | Logic |
|---|---|---|
| Freshness | 35 | ≤6h → 35, ≤24h → 25, ≤72h → 15, older → 5 |
| Signal type | 25 | `early` (career page change) → 25, `proactive` → 20, `normal` → 15 |
| Role match | 20 | AI/ML keyword in title → 20, data/engineer → 10, other → 0 |
| Location | 12 | GIFT City / Gandhinagar → 12, Ahmedabad → 10, Gujarat → 7, Remote → 5 |
| Company tier | 8 | Tier 1 → 8, Tier 2 → 7, Tier 3/4 → 6, Tier 5/7 → 5, Tier 6 → 7, other → 4 |

Scores are capped at 100. Displayed thresholds:
- **70+** → Urgent (apply today)
- **40–69** → Watching (apply this week)
- **< 40** → Normal (low priority)

---

## Daily Summary Format

Example Telegram message sent by `send_daily_summary.py`:

```
📊 Good Morning — AI Job Radar Daily Summary

🔴 Urgent (70+): 3 opportunities
🟡 Watching (40-69): 7 opportunities
🟢 Normal (<40): 12 opportunities

🎯 Top 3 to act on:
1. Pirimid Fintech — ML Engineer — Score: 88
2. Atlan — Data Scientist — Score: 79
3. HDFC Bank — AI Engineer — Score: 67

🏢 Career Pages Changed Today: 2
📧 LinkedIn Alert Emails Parsed: 5
🔍 Google Signals Found: 3

Open Dashboard → https://your-app.vercel.app
```

---

## Companies CSV Format

`data/companies_seed.csv` columns:

| Column | Type | Description |
|---|---|---|
| `name` | text | Company name — used as the upsert key |
| `tier` | integer | 1 = top-tier, higher = smaller/less known |
| `category` | text | Industry category (e.g. Fintech, SaaS) |
| `location` | text | Primary office location |
| `website` | text | Company homepage URL |
| `careers_url` | text | Direct URL to the careers / jobs page |
| `linkedin_url` | text | LinkedIn company page URL |
| `company_size` | text | Employee range (e.g. 51-200) |
| `ai_focus` | text | What AI/ML problem the company works on |
| `funding_stage` | text | Seed / Series A / Growth / etc. |
| `priority_base_score` | integer | Starting score used before live signals arrive (0–100) |
| `google_alert_set` | boolean | Whether you have a Google Alert set for this company |
| `li_alert_set` | boolean | Whether you have a LinkedIn job alert set |
| `career_page_watched` | boolean | Whether the career page watcher should monitor this URL |
| `notes` | text | Free-text notes shown on the dashboard |

Add as many rows as you want. Re-run `python scripts/import_companies_csv.py` to sync changes. The script upserts on `name` so no duplicates are created.

---

## Clean Dummy Data from Supabase

Before first use, delete any rows from the `opportunities` table that were inserted before scrapers were fixed or contain dummy text:

```sql
DELETE FROM opportunities
WHERE notes IN (
  'Career page changed this morning.',
  'Applied via link in alert.',
  'Worth monitoring.'
)
OR (
  role_title IN ('ML Engineer', 'Data Scientist', 'AI Engineer', 'Applied AI Developer')
  AND found_at < NOW() - INTERVAL '1 day'
);
```

Run this once in **Supabase → SQL Editor** after setting up for the first time.

---

## Troubleshooting

**Dashboard shows sample data instead of real data**
- Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in `.env.local`.
- Verify RLS is disabled (or correct policies exist) on all 5 tables in Supabase.
- Restart `npm run dev` after editing `.env.local`.

**Scraper logs `dry_run` instead of running**
- The scraper could not connect to Supabase. Check that `SUPABASE_URL` and `SUPABASE_KEY` are exported in your shell or present in `.env.local`.
- Confirm the service role key is used, not the anon key.

**Telegram messages are not arriving**
- Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are correct.
- Make sure you sent at least one message to your bot before running `getUpdates`.
- The chat ID must be a plain integer, not a string with quotes.

**Naukri / Indeed / Wellfound returns zero results**
- These sites change their HTML and API responses periodically. The scraper logs errors per-query and continues; check the `errors` column in `scraper_logs` for details.
- For Naukri, the API endpoint is unofficial and may require updated headers.

**Google Search scraper logs `skipped`**
- `SERPAPI_KEY` is missing from the environment. Set it and rerun.

**Gmail parser logs `skipped`**
- `GMAIL_CREDENTIALS` is missing or the Base64 decode failed. Re-encode the credentials JSON file.

**`npx next build` fails with a TypeScript error**
- Run `npx tsc --noEmit` first to see the exact error.
- Make sure you ran `npm install` and that `node_modules` exists.

**GitHub Actions workflow fails on a scraper step**
- Each scraper step is independent; a failure in one does not block the rest.
- Go to **Actions → the failed run → expand the failed step** to read the Python traceback.
- The most common cause is a missing or expired secret. Re-add it under **Settings → Secrets**.

---

## Interview Intelligence Setup

A built-in AI feature that researches interview experiences from Glassdoor, Reddit, and AmbitionBox, then generates a structured intelligence report using Gemini.

### Setup steps

1. **Get a free Gemini API key**: Go to [aistudio.google.com](https://aistudio.google.com), sign in, and create an API key.
2. **Add to `.env.local`**:
   ```env
   GEMINI_API_KEY=your_key_here
   ```
3. **Optional — Google Custom Search** (for richer results):
   - Create a Custom Search Engine at [programmablesearchengine.google.com](https://programmablesearchengine.google.com).
   - Get an API key from [console.cloud.google.com](https://console.cloud.google.com) → APIs → Custom Search JSON API.
   - Add to `.env.local`:
     ```env
     GOOGLE_SEARCH_KEY=your_google_key
     GOOGLE_SEARCH_CX=your_search_engine_id
     ```
   - If `GOOGLE_SEARCH_KEY` is not set, the feature falls back to `SERPAPI_KEY` (if configured), then to Gemini-only mode using just the job description.
4. **Visit `/interview`** in your dashboard to use the feature.

### How it works

1. Runs 8 searches in parallel across Glassdoor, Reddit, and AmbitionBox.
2. Combines all snippets into a context blob (max 8 000 chars).
3. Sends everything to `gemini-2.0-flash` with a structured prompt.
4. Returns a full intelligence report: interview rounds, most-asked questions (with category tabs), topics to prepare, candidate tips, smart questions to ask, and salary/red-flag signals.

The feature degrades gracefully — if no search APIs are configured, Gemini generates advice from general patterns and the job description alone.

---

## Database Setup — Supabase Updates (v2.0)

If you are upgrading or setting up for the first time with the v2.0 consolidated features, you must run the following SQL script in your Supabase project (**SQL Editor → New query**). 
This creates the tables needed for the Company Discovery tabs and the enhanced Network Growth tracking.

```sql
-- 1. Create the new Discovered Companies table
CREATE TABLE IF NOT EXISTS discovered_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  location TEXT,
  website TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  has_website BOOLEAN DEFAULT FALSE,
  has_linkedin BOOLEAN DEFAULT FALSE,
  has_github BOOLEAN DEFAULT FALSE,
  has_funding BOOLEAN DEFAULT FALSE,
  has_technical_founder BOOLEAN DEFAULT FALSE,
  news_mentions INTEGER DEFAULT 0,
  ai_ml_signals TEXT,
  source TEXT,
  source_url TEXT,
  potential_score INTEGER DEFAULT 0,
  potential_tier TEXT DEFAULT 'low',
  added_to_watchlist BOOLEAN DEFAULT FALSE,
  reached_out BOOLEAN DEFAULT FALSE,
  reached_out_date TIMESTAMPTZ,
  skip BOOLEAN DEFAULT FALSE,
  notes TEXT,
  raw_data JSONB,
  discovered_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add new tracking columns to the existing recruiters table
ALTER TABLE recruiters 
ADD COLUMN IF NOT EXISTS contacted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS contact_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Create a table to track scraper runs
CREATE TABLE IF NOT EXISTS scraper_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scraper_name TEXT NOT NULL,
  status TEXT NOT NULL,
  records_processed INTEGER DEFAULT 0,
  error_log TEXT,
  run_date TIMESTAMPTZ DEFAULT now()
);
```

### How to use Company Discovery

1. **Run the SQL above** in Supabase to create the table.
2. **Visit `/companies`** in your dashboard and click the **Discovered Companies** tab.
3. Click **⚡ Run Discovery Scan** to trigger the discovery scanner (or wait for the auto-run).
4. The scanner will search Google News, Startup India, and GIFT City for AI/ML companies in Ahmedabad/Gandhinagar.
5. Each discovered company is scored (0–100) and filtered — only medium+ potential companies are saved.

### Actions per company card

| Action | Effect |
|---|---|
| ➕ Add to Watch List | Adds to your `companies` table (career page watcher starts) |
| 📋 Copy Outreach Message | Copies a pre-written cold outreach message |
| 🔍 Find Contacts | Opens LinkedIn people search for the company |
| ✓ Mark Reached Out | Records outreach date |
| ✗ Skip | Hides the company from the list |


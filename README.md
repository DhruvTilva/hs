# HireSense v2.0

Personal AI/ML Company Intelligence & Networking Radar for Ahmedabad, Gandhinagar, and GIFT City.

Discovers hidden AI/ML startups through a **5-layer multi-source intelligence pipeline**, watches their career pages, tracks AI/ML recruiters via LinkedIn X-Ray, and prepares you for every interview. A Next.js dashboard lets you browse, filter, trigger automations, and manage everything from your browser.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Step 1 — Clone & Install](#step-1--clone--install)
4. [Step 2 — Supabase Setup](#step-2--supabase-setup)
5. [Step 3 — Telegram Bot Setup (Optional)](#step-3--telegram-bot-setup-optional)
6. [Step 4 — Serper.dev Setup (Company Discovery)](#step-4--serperdev-setup-company-discovery)
7. [Step 5 — SerpAPI Setup (Network Growth)](#step-5--serpapi-setup-network-growth)
8. [Step 6 — GitHub PAT Setup (Manual Triggers)](#step-6--github-pat-setup-manual-triggers)
9. [Step 7 — Gmail Setup (Optional)](#step-7--gmail-setup-optional)
10. [Step 8 — Environment Variables](#step-8--environment-variables)
11. [Step 9 — Seed Company Data](#step-9--seed-company-data)
12. [Step 10 — Run the Dashboard](#step-10--run-the-dashboard)
13. [Step 11 — Test Scrapers Locally](#step-11--test-scrapers-locally)
14. [Step 12 — Deploy to Vercel](#step-12--deploy-to-vercel)
15. [Step 13 — GitHub Actions (Automation)](#step-13--github-actions-automation)
16. [Project Structure](#project-structure)
17. [Dashboard Pages](#dashboard-pages)
18. [Scrapers Reference](#scrapers-reference)
19. [Scoring Systems](#scoring-systems)
20. [Database Schema (v2.0 Setup)](#database-schema-v20-setup)
21. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
GitHub Actions (manual trigger)          Next.js Dashboard
        │                                       │
        ▼                                       ▼
Python Scrapers ──► Supabase PostgreSQL ◄── Next.js API Routes
  Layer 1: Startup India API                    │
  Layer 2: RSS Feeds (YourStory, Inc42)         ▼
  Layer 3: Serper.dev LinkedIn X-Ray    Browser / Mobile
  Layer 4: Clutch.co + NASSCOM          (Companies, Network,
  Layer 5: i-Hub Gujarat                 Interview, Guide)
        │
        ▼
  Telegram Bot (optional alerts)
```

- **5-Layer Company Discovery** runs without relying on any single paid API. Most sources are completely free and unlimited.
- **Network Growth Scraper** uses SerpAPI (or Serper.dev) to find AI/ML recruiters and founders at your watchlist companies.
- **Career Page Watcher** monitors the career pages of your watched companies and alerts you the moment a new role appears.
- **Interview Intelligence** uses Gemini AI to generate a predicted question list and strategy for any company + role.
- **GitHub Actions** are all set to **manual-only** trigger — you control when to spend API credits.

---

## Prerequisites

| Tool | Minimum version | Check |
|---|---|---|
| Node.js | 18 | `node -v` |
| npm | 9 | `npm -v` |
| Python | 3.10 | `python --version` |
| pip | 23 | `pip --version` |
| Git | any | `git --version` |

Accounts needed:

- [Supabase](https://supabase.com) — free tier is enough
- [Serper.dev](https://serper.dev) — **2,500 free searches, no credit card required** (for Company Discovery)
- [SerpAPI](https://serpapi.com) — 250 searches/month free (for Network Growth Scraper)
- [GitHub](https://github.com) — for manual Action triggers from the dashboard
- [Vercel](https://vercel.com) — free tier for dashboard hosting (optional)
- [Telegram](https://telegram.org) — for optional alerts (optional)
- [Google Cloud Console](https://console.cloud.google.com) — only if you want Gmail parsing (optional)

---

## Step 1 — Clone & Install

```bash
git clone https://github.com/DhruvTilva/hs.git
cd hs

# Install Next.js dashboard dependencies
npm install

# Install Python scraper dependencies
pip install -r requirements.txt
```

> On a shared machine, use a virtual environment:
> ```bash
> python -m venv .venv
> source .venv/bin/activate   # Windows: .venv\Scripts\activate
> pip install -r requirements.txt
> ```

---

## Step 2 — Supabase Setup

### 2a. Create a project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**, choose a name (e.g. `hiresense`), set a database password, pick the closest region.
3. Wait ~2 minutes for the project to be ready.

### 2b. Run the schema

1. In your Supabase project, go to **SQL Editor → New query**.
2. Open `supabase/schema.sql` from this repo, paste the entire content, and click **Run**.
3. You should see these tables created: `companies`, `opportunities`, `recruiters`, `career_page_snapshots`, `scraper_logs`, `discovered_companies`.

> See the full [Database Schema (v2.0 Setup)](#database-schema-v20-setup) section for the exact SQL if upgrading from v1.

### 2c. Get your credentials

Go to **Project Settings → API**:

- **Project URL** → `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used by the Next.js frontend)
- **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY` (used by Python scrapers — keep this private!)

> The service role key bypasses Row Level Security. Never expose it in the browser or commit it to git.

### 2d. Disable RLS (recommended for personal use)

1. Go to **Table Editor** in the left sidebar.
2. For each table, click the table name → **RLS** tab → toggle **Disable RLS**.

---

## Step 3 — Telegram Bot Setup (Optional)

Only needed for automated daily summary alerts.

1. Open Telegram and message `@BotFather` → `/newbot`.
2. Follow the prompts. Copy the token (looks like `7123456789:AAFxxxxxxxx`). This is your `TELEGRAM_BOT_TOKEN`.
3. Send any message to your new bot, then visit `https://api.telegram.org/botTOKEN/getUpdates` — find `"chat": {"id": 123456789}`. This is your `TELEGRAM_CHAT_ID`.

---

## Step 4 — Serper.dev Setup (Company Discovery)

Serper.dev is a **drop-in replacement for SerpAPI** with a much more generous free tier.

1. Go to [serper.dev](https://serper.dev) and sign up (**no credit card required**).
2. You instantly receive **2,500 free search credits**.
3. Copy your API key.
4. Add to `.env.local`: `SERPER_KEY=your_key_here`
5. Add to GitHub Repository Secrets: `SERPER_KEY=your_key_here`

> At 10 searches per Company Discovery run, 2,500 credits covers approximately **250 runs** — that is years of weekly scans on the free tier.

---

## Step 5 — SerpAPI Setup (Network Growth)

The Network Growth Scraper uses SerpAPI to find AI/ML recruiters via LinkedIn X-Ray search.

1. Go to [serpapi.com](https://serpapi.com) and sign up.
2. The free tier gives you **250 searches/month**.
3. Copy your API key.
4. Add to `.env.local`: `SERPAPI_KEY=your_key_here`
5. Add to GitHub Repository Secrets: `SERPAPI_KEY=your_key_here`

> Each manual Network Growth run consumes approximately 15 searches. With 250 monthly credits, you can run it ~16 times per month (every 2 days) safely.

---

## Step 6 — GitHub PAT Setup (Manual Triggers)

The `/guide` dashboard Automations page has "Manual Run" buttons that trigger GitHub Actions directly. These need a GitHub Personal Access Token (PAT).

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token (classic)**.
2. Set a name (e.g. `HireSense Dashboard`), set expiry (90 days or no expiry).
3. Check the **`workflow`** scope checkbox.
4. Click **Generate token** and copy it.
5. Add to `.env.local`: `GITHUB_TOKEN=your_token_here`
6. Restart `npm run dev` to load the new token.

> The `GITHUB_TOKEN` is only used server-side (in the `/api/trigger-scraper` Next.js route). It is never sent to the browser.

---

## Step 7 — Gmail Setup (Optional)

Only needed if you want Gmail to automatically parse LinkedIn job alert emails.

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a project → **APIs & Services → Library** → enable **Gmail API**.
3. Go to **Credentials → Create Credentials → OAuth 2.0 Client ID** → choose **Desktop app**.
4. Download the JSON credentials file.
5. Encode it: `base64 -i credentials.json | tr -d '\n'`
6. Add the output as `GMAIL_CREDENTIALS` in `.env.local`.

---

## Step 8 — Environment Variables

Create `.env.local` in the project root (already in `.gitignore`):

```env
# ── Supabase ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ── Gemini AI (for Interview Intelligence) ────────────────────────────────────
GEMINI_API_KEY=your_gemini_api_key_here

# ── GitHub PAT (for Manual Run buttons in Guide dashboard) ───────────────────
GITHUB_TOKEN=ghp_your_personal_access_token

# ── Serper.dev (Company Discovery — 2,500 free searches, no card!) ────────────
SERPER_KEY=your_serper_key_here

# ── SerpAPI (Network Growth Scraper — 250 free/month) ────────────────────────
SERPAPI_KEY=your_serpapi_key_here

# ── Telegram (Optional — for automated alerts) ────────────────────────────────
TELEGRAM_BOT_TOKEN=7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=123456789

# ── Gmail (Optional — for parsing LinkedIn alert emails) ──────────────────────
GMAIL_CREDENTIALS=base64encodedstring...

# ── Dashboard URL (used in Telegram daily summary link) ──────────────────────
DASHBOARD_URL=https://your-app.vercel.app
```

> After editing `.env.local`, always restart your dev server (`Ctrl+C` then `npm run dev`) for changes to take effect.

---

## Step 9 — Seed Company Data

The `data/companies_seed.csv` file has a starter list of AI/ML companies to watch. Import it:

```bash
python scripts/import_companies_csv.py
```

### Adding your own companies

Edit `data/companies_seed.csv` and re-run the script. It upserts on `name`, so no duplicates are created.

### Marking companies as "Watched"

On the **Companies** page in the dashboard, switch to the **Manual / Imported Watchlist** tab. Click the ⭐ star icon on any company to mark it as Watched. The Career Page Watcher and the Home Dashboard KPI card will instantly reflect this.

---

## Step 10 — Run the Dashboard

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If Supabase is not connected, the dashboard runs silently on built-in sample data so you can explore the UI immediately.

### Production build

```bash
npm run build
npm start
```

---

## Step 11 — Test Scrapers Locally

### Company Discovery (safe dry run — no DB writes)

```bash
python scrapers/company_discovery.py --dry-run
```

This runs the full 5-layer pipeline and prints every discovered company without saving anything to the database. Use this to verify your setup before the first real run.

### Network Growth Scraper

```bash
python scrapers/network_growth.py
```

Discovers AI/ML recruiters, CTOs, and founders at your watchlist companies. Requires `SERPAPI_KEY`. Falls back to dry-mode output if the key is missing.

### Career Page Watcher

```bash
python scrapers/career_page_watcher.py
```

Checks the career pages of all companies where `career_page_watched = true`. Sends Telegram alert if a page changes.

### Interview Intelligence

1. Start the dashboard: `npm run dev`
2. Visit `http://localhost:3000/interview`
3. Enter a company name and role title → click **Analyze Interview**

---

## Step 12 — Deploy to Vercel

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo.
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
   - `GITHUB_TOKEN` *(for the Manual Run buttons to work on the deployed site)*
4. Click **Deploy**.
5. Copy your deployment URL and set it as `DASHBOARD_URL` in `.env.local` and GitHub secrets.

---

## Step 13 — GitHub Actions (Automation)

All three GitHub Actions are set to **manual-only trigger** to avoid wasting API credits. You control exactly when they run.

### How to manually trigger from the dashboard

1. Open your HireSense dashboard → click **Guide** in the navigation.
2. Go to the **Automations** section.
3. Click **▶ Manual Run** next to any automation.

### How to manually trigger from GitHub

1. Go to your GitHub repo → **Actions** tab.
2. Click the workflow name on the left sidebar.
3. Click the **"Run workflow"** button on the right.

### Available Workflows

| Workflow | File | What it does | Duration |
|---|---|---|---|
| Weekly Company Discovery | `company_discovery.yml` | 5-layer AI startup discovery pipeline | 5–12 min |
| Network Growth Scraper | `network_growth.yml` | LinkedIn X-Ray recruiter discovery | 2–4 min |
| Career Page Watcher | `career_page_watcher.yml` | Monitors watched company career pages | 1–3 min |

### Adding Secrets to GitHub

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value | Required for |
|---|---|---|
| `SUPABASE_URL` | Your Supabase project URL | All scrapers |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase **service role** key | All scrapers |
| `SERPER_KEY` | Your Serper.dev API key | Company Discovery |
| `SERPAPI_KEY` | Your SerpAPI key | Network Growth |
| `GITHUB_TOKEN` | Your GitHub PAT | Manual Run buttons |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token | Optional alerts |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID | Optional alerts |
| `GMAIL_CREDENTIALS` | Base64-encoded Gmail credentials JSON | Optional Gmail parsing |
| `DASHBOARD_URL` | Your Vercel deployment URL | Telegram summary link |

---

## Project Structure

```
hs/
├── app/                             # Next.js App Router pages and API routes
│   ├── api/
│   │   ├── companies/route.ts       # GET companies, PATCH watch/unwatch toggle
│   │   ├── network/route.ts         # GET recruiters from the recruiters table
│   │   ├── opportunities/route.ts   # GET (with filters), POST, PATCH
│   │   ├── scraper-status/route.ts  # GET latest scraper_logs run data
│   │   ├── trigger-scraper/route.ts # POST — triggers GitHub Actions via PAT
│   │   └── interview-intelligence/  # AI interview analysis endpoint
│   ├── companies/page.tsx
│   ├── network/page.tsx
│   ├── interview/page.tsx
│   ├── guide/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                     # Home Dashboard (KPI cards + career alerts)
├── components/
│   ├── app-shell.tsx                # Navigation wrapper
│   ├── companies.tsx                # Companies page (Watchlist + Discovered tabs)
│   ├── network-growth.tsx           # Network page (recruiter discovery)
│   ├── guide.tsx                    # Guide + Automations (with Manual Run buttons)
│   ├── copy-button.tsx
│   └── ui.tsx                       # Shared primitives (Panel, Badge, etc.)
├── data/
│   └── companies_seed.csv           # Starter company watch list
├── lib/
│   ├── api.ts                       # Client-side fetch helpers
│   ├── supabase.ts                  # Supabase client init
│   ├── types.ts                     # TypeScript types matching Supabase schema
│   └── time.ts                      # timeAgo() helper
├── scrapers/
│   ├── common.py                    # Shared helpers (Supabase, Telegram, dedup)
│   ├── company_discovery.py         # ★ God-Level 5-layer company discovery
│   ├── network_growth.py            # LinkedIn X-Ray recruiter discovery
│   ├── career_page_watcher.py       # Career page change monitor
│   ├── send_daily_summary.py        # Telegram daily summary
│   └── gmail_parser.py              # Gmail alert parser (optional)
├── scripts/
│   └── import_companies_csv.py      # Seeds companies table from CSV
├── supabase/
│   └── schema.sql                   # Full DB schema — run this once
├── .env.local                       # Local environment variables (never commit)
├── .github/workflows/
│   ├── company_discovery.yml        # Weekly company discovery action
│   ├── network_growth.yml           # Network growth scraper action
│   └── career_page_watcher.yml      # Career page watcher action
├── requirements.txt
├── package.json
└── tsconfig.json
```

---

## Dashboard Pages

### `/` — Home Dashboard
KPI cards: **New Companies (7D)**, **Total Tracked**, **New Contacts (24H)**, **Watched Companies** (count of companies you've starred). Shows a Career Alerts section listing all recent changes to watched company career pages.

### `/companies` — Company Intelligence
Two tabs:
1. **Manual / Imported Watchlist**: Your core target companies. Toggle ⭐ Watch, see last career page changes, click 💼 LinkedIn to find employees.
2. **Discovered Companies**: Newly discovered AI/ML startups from the 5-layer scanner. View their potential score, AI signals, and add them to your watchlist with one click.

### `/network` — Network Intelligence
Displays batches of AI/ML recruiters, CTOs, and founders discovered by the Network Growth Scraper. One-click **Connect on LinkedIn** buttons and a pre-written connection message template.

### `/interview` — Interview Intelligence
Enter a company name + job description → the AI generates a structured intelligence report with:
- 🔥 **Insider Gold Mine**: Specific questions extracted from real interview discussions
- 🔮 **Top 5–6 Guaranteed Questions** with simple answers (based on company data + role)
- Interview round breakdown, topics to prepare, salary signals

### `/guide` — Success Guide & Automations
Strategic playbook for AI/ML job hunting. The **Automations** section shows all three GitHub Actions with **▶ Manual Run** buttons that trigger them directly without going to GitHub.

---

## Scrapers Reference

### `company_discovery.py` — God-Level 5-Layer Pipeline

| Layer | Source | Cost | Notes |
|---|---|---|---|
| L1 | **Startup India DPIIT API** | 🆓 Free, no key | Govt-verified AI startups in Gujarat |
| L1 | **IndiaAI.gov.in** | 🆓 Free, no key | MeitY-listed AI companies |
| L2 | **RSS Feeds** (YourStory, Inc42, ET, AIM) | 🆓 Free, real-time | Extracts company names from news articles |
| L3 | **Serper.dev LinkedIn X-Ray** | 🆓 2,500 free credits | Searches LinkedIn for AI companies in Gujarat |
| L4 | **Clutch.co + NASSCOM** | 🆓 Free scraping | Pre-verified directory listings |
| L5 | **i-Hub Gujarat** | 🆓 Free, no key | State-government curated startups |

**Smart Verification** (zero search API calls): Website (direct HTTP check), GitHub (free public API, 60 req/hr), Funding & Founder signals (extracted from RSS article text).

**Dry-run mode** — safe local testing without writing to the database:
```bash
python scrapers/company_discovery.py --dry-run
```

### `network_growth.py` — LinkedIn X-Ray Recruiter Discovery

Uses SerpAPI to search Google for LinkedIn profiles of recruiters, CTOs, and Engineering Managers at AI companies in Ahmedabad/Gujarat. Also searches for employees at your specific watchlist companies.

- Falls back to dry-mode output if `SERPAPI_KEY` is missing (no crash).
- Each profile is de-duplicated by `linkedin_url` before inserting.
- ~15 SerpAPI searches per run.

### `career_page_watcher.py`

Fetches the careers page HTML for every company where `career_page_watched = true` in your database. Compares an MD5 hash of the page text against the stored `last_careers_hash`. On change:
1. Saves a snapshot to `career_page_snapshots`.
2. Extracts role titles using regex.
3. Inserts into `opportunities`.
4. Sends an immediate Telegram alert.

### `send_daily_summary.py`

Queries `opportunities` for the last 24 hours and sends a Telegram summary with urgent/watching/normal counts and top 3 opportunities.

### `gmail_parser.py` (Optional)

Parses LinkedIn job alert emails and Google Alert emails from Gmail. Logs `skipped` and exits cleanly if `GMAIL_CREDENTIALS` is missing.

---

## Scoring Systems

### Company Discovery Score (0–100)

| Signal | Points |
|---|---|
| Has funding news | +30 |
| Government verified (i-Hub / Startup India) | +25 |
| Has LinkedIn page | +15 |
| Has website | +15 |
| Has technical founder | +15 |
| Has GitHub | +10 |
| Has news mentions | +10 |
| Has AI/ML keyword signals | +5 |

Companies scoring below 25 are filtered out entirely. Score ≥ 70 → High tier, ≥ 40 → Medium tier.

### Opportunity Score (0–100)

| Factor | Max | Logic |
|---|---|---|
| Freshness | 35 | ≤6h → 35, ≤24h → 25, ≤72h → 15, older → 5 |
| Signal type | 25 | Career page change → 25, proactive → 20, normal → 15 |
| Role match | 20 | AI/ML keyword in title → 20, data/engineer → 10, other → 0 |
| Location | 12 | GIFT City/Gandhinagar → 12, Ahmedabad → 10, Gujarat → 7 |
| Company tier | 8 | Tier 1 → 8, Tier 2 → 7, Tier 3/4 → 6, other → 4 |

Thresholds:
- **70+** → 🔴 Urgent (apply today)
- **40–69** → 🟡 Watching (apply this week)
- **< 40** → 🟢 Normal

---

## Database Schema (v2.0 Setup)

If setting up for the first time **or** upgrading from v1, run this SQL in **Supabase → SQL Editor**:

```sql
-- Discovered companies (from 5-layer company discovery pipeline)
CREATE TABLE IF NOT EXISTS discovered_companies (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                 TEXT NOT NULL,
  location             TEXT,
  website              TEXT,
  linkedin_url         TEXT,
  github_url           TEXT,
  has_website          BOOLEAN DEFAULT FALSE,
  has_linkedin         BOOLEAN DEFAULT FALSE,
  has_github           BOOLEAN DEFAULT FALSE,
  has_funding          BOOLEAN DEFAULT FALSE,
  has_technical_founder BOOLEAN DEFAULT FALSE,
  news_mentions        INTEGER DEFAULT 0,
  ai_ml_signals        TEXT,
  source               TEXT,
  source_url           TEXT,
  potential_score      INTEGER DEFAULT 0,
  potential_tier       TEXT DEFAULT 'low',
  added_to_watchlist   BOOLEAN DEFAULT FALSE,
  reached_out          BOOLEAN DEFAULT FALSE,
  reached_out_date     TIMESTAMPTZ,
  skip                 BOOLEAN DEFAULT FALSE,
  notes                TEXT,
  raw_data             JSONB,
  discovered_at        TIMESTAMPTZ DEFAULT now()
);

-- Extra columns for recruiters table
ALTER TABLE recruiters
  ADD COLUMN IF NOT EXISTS contacted    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS contact_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes        TEXT;

-- Scraper run logs (if not already exists from v1)
CREATE TABLE IF NOT EXISTS scraper_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source     TEXT NOT NULL,
  status     TEXT NOT NULL,
  new_found  INTEGER DEFAULT 0,
  errors     TEXT,
  run_at     TIMESTAMPTZ DEFAULT now()
);
```

---

## Troubleshooting

**Dashboard shows 0 for "Watched Companies"**
- Click the ⭐ star button on any company in the Companies → Watchlist tab.
- The dashboard fetches this count dynamically (no caching issues).

**Manual Run button shows "Failed"**
- Check that `GITHUB_TOKEN` is set in `.env.local` and that you restarted `npm run dev`.
- The PAT needs the `workflow` scope permission.
- Your GitHub repo name in `app/api/trigger-scraper/route.ts` must match your actual repo (`owner: 'DhruvTilva'`, `repo: 'hs'`).

**Company Discovery finds 0 companies**
- Run `python scrapers/company_discovery.py --dry-run` locally to see what each layer returns.
- The Startup India API may be temporarily down — the other 4 layers will still work.
- Check if `SERPER_KEY` is set for Layer 3 (LinkedIn X-Ray). If missing, it skips gracefully.

**Network Growth Scraper shows "dry mode"**
- `SERPAPI_KEY` is missing from your GitHub Secrets. Add it and re-run the action.

**Scraper logs `dry_run` instead of running**
- The Python scraper could not connect to Supabase. Check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in your GitHub Secrets (not just `.env.local`).

**Interview Intelligence shows generic answers**
- Check that `GEMINI_API_KEY` is set in `.env.local`.
- Serper.dev key helps the interview tool find real interview discussions online. Without it, Gemini generates predictions from general knowledge.

**Telegram messages not arriving**
- Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are correct.
- The chat ID must be a plain integer with no quotes.

**`npm run build` fails with TypeScript errors**
- Run `npx tsc --noEmit` to see the exact error line.
- Make sure `npm install` has been run and `node_modules` exists.

**GitHub Action fails immediately**
- Expand the failed step in Actions logs to read the Python traceback.
- Most common cause: missing or misnamed secret. Check **Settings → Secrets** on GitHub.

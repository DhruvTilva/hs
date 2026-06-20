# HireSense Codebase Guide: How to Make Changes

This document serves as a "cheat sheet" so you can easily return to this project months from now and know exactly which files to edit to change logic, update UI, or tweak the AI discovery engine.

---

## 1. Changing the AI/ML Discovery Logic

If you want to change what kind of companies HireSense looks for, how it scores them, or what cities it targets, you need to edit the Python backend.

**Target File:** `scrapers/company_discovery.py`

*   **Change Target Cities:** Search for `SEARCH_LOCATIONS`. You can add or remove cities (e.g., adding `["Pune", "Bangalore"]`).
*   **Change Discovery Keywords:** Search for `AI_ML_KEYWORDS` or `TECH_FOUNDER_SIGNALS`. Add new tech stacks (like "Agents", "LangChain") to increase their score.
*   **Change Scoring Weights:** Search for the `calculate_score` function. Here you can tweak how many points a company gets for having AI keywords (+40) vs Marketing keywords (-20).
*   **Disable/Enable Website Guessing:** Search for `GUESS_WEBSITES = False`. Turn this to `True` if you want the scraper to guess URLs (though this reduces data accuracy).

## 2. Changing the Frontend UI (Dashboard)

If you want to modify how the list of companies is displayed on your screen.

**Target File:** `components/pages.tsx`

*   **Change the Desktop Table:** Search for `<table`. You can add new columns inside the `<thead>` and update the mapping loop inside `<tbody>` to display new data fields.
*   **Change the Mobile Card View:** Search for `className="mobile-view"`. Here you will find the layout specifically designed for phones. If you add a new piece of data (like an email address), make sure you add it to the mobile cards here too.
*   **Modify Filter/Sort Logic:** Search for `filteredAndSortedCompanies`. This `useMemo` block handles exactly how the raw data from Supabase is sorted and filtered before it reaches the screen.

## 3. Changing Global Styles & Colors

If you want to tweak the colors, spacing, or mobile breakpoints.

**Target File:** `app/globals.css`

*   **Change Theme Colors:** Look at the `:root` variables at the top of the file (e.g., `--bg-primary`, `--accent`).
*   **Change Mobile Layout Breakpoint:** Scroll to the bottom of the file and look for `@media (max-width: 768px)`. You can adjust how the app switches between `.desktop-view` and `.mobile-view`.

## 4. Changing Database APIs

If you add a new column in Supabase and need the frontend to fetch it or update it.

**Target File:** `app/api/discover/company/route.ts` (for saving/upserting data)
**Target File:** `app/api/companies/route.ts` (for fetching data)
**Target File:** `lib/api.ts` (for the frontend fetch wrappers)

*   **Fixing Duplicates:** If you notice duplicate companies showing up, check the `route.ts` file's upsert logic to ensure it is matching on the correct unique identifier (usually the domain/URL).

## 5. Adding New Features

*   **To add a new background scraper:** Create a new Python file in the `scrapers/` directory, model it after `company_discovery.py`, and set up a cron job or scheduled task to run it.
*   **To add a new page:** Create a new folder inside `app/` (e.g., `app/analytics/`) and place a `page.tsx` file inside it. Next.js will automatically route to `/analytics`.

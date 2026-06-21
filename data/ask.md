# HireSense Comprehensive Interview Preparation

If you list HireSense on your resume, interviewers will drill down into the architecture, the scraping logic, and the scale. Here are the guaranteed, highest-probability questions covering every specific layer of your application.

## 1. The 11-Layer Discovery Engine (Core Technical Questions)

**Q: Walk me through your "Company Discovery" logic. How does it work so intelligently?**
- "It uses an 11-Layer Multi-Source Pipeline to discover companies that traditional job boards miss. It doesn't rely on just one search. 
  1. **Gov APIs:** It queries official databases like Startup India.
  2. **RSS + AI:** It reads tech news RSS feeds and uses the Gemini AI API to extract company names from articles.
  3. **LinkedIn X-Ray:** It uses Serper.dev to find LinkedIn profiles of AI startups in Gujarat using 22 specific AI sub-domain queries.
  4. **Public Directories:** It scrapes GoodFirms and TechBehemoths for AI companies.
  5. **NASSCOM X-Ray:** It bypasses login walls using Serper to find NASSCOM members.
  6. **State Portals:** It pulls from state-funded incubation lists like i-Hub Gujarat.
  7. **GitHub:** It uses the GitHub API to find active organizations based in Ahmedabad and Gandhinagar.
  8. **Incubators:** It scrapes portfolios of top incubators like IIMA Ventures and IIT-GN.
  9. **HuggingFace:** It tracks companies publishing open-source models.
  10. **Naukri X-Ray (High Intent):** It finds companies actively paying to hire AI engineers right now.
  11. **News Intelligence:** It tracks funding news in Inc42 and YourStory."

**Q: That's a lot of data. How do you verify the companies and filter out the noise?**
- "I built a **Smart Verification Engine** that uses ZERO paid search API calls. It validates the company by making direct HTTP checks to their website. If a company is found in multiple independent layers (e.g., an Incubator list AND Hacker News), it gets a massive 'Confidence Bonus'. Companies with low scores are automatically dropped."

## 2. Network Growth & Smart Scraping

**Q: Tell me about the 'Network Growth' feature. How do you smartly find CTOs and Recruiters?**
- "I wrote a script that automatically finds people working at the companies on my watchlist. It uses a **3-Engine Cascading Search**."

**Q: What is a 3-Engine Cascading Search?**
- "To guarantee results while saving money, the scraper tries multiple search engines in a specific order. First, it tries SerpAPI (highest quality, but expensive). If that fails or hits rate limits, it falls back to Serper.dev. If that fails, it falls back to DuckDuckGo (completely free). This guarantees stability with zero downtime while minimizing costs."

**Q: How do you extract and classify the profiles?**
- "Once it finds a LinkedIn profile via Google X-Ray, it uses regular expressions (regex) to parse the title and snippet. It automatically classifies the person into three categories: 'Founder', 'Hiring Manager', or 'Recruiter' based on keywords, and saves them to the database."

## 3. Real-Time Tracking

**Q: How does your 'Career Page Watcher' work without an API?**
- "The script visits the career pages of companies on my watchlist and generates an MD5 hash of the raw text. It stores this hash in Supabase. The next day, it hashes the page again. If the hashes don't match, the page changed! It then parses the HTML for `<h2>` or `<li>` tags containing keywords like 'Engineer' and immediately sends me an alert via Telegram."

## 4. System Architecture & Data Flow

**Q: Walk me through the overall architecture.**
- **Trigger:** A GitHub Action cron job runs the Python scripts daily.
- **Scrape & Parse:** The 8-layer engine extracts URLs, visits sites, and parses raw text.
- **Score & Verify:** It calculates a 'Priority Score' based on deep-tech keywords (+40 for 'Neural Networks', negative for 'Marketing') and verifies GitHub/LinkedIn links.
- **Store:** It uses an `upsert` in Supabase (PostgreSQL) matching on the URL to guarantee no duplicate records.
- **Display:** The Next.js frontend fetches the data via serverless API routes and displays it.

**Q: Why use Python for the backend but Next.js/React for the frontend?**
- "Python has the strongest ecosystem for web scraping, parsing (BeautifulSoup), and data manipulation. Next.js is the best for building fast, responsive dashboards and API routes. I decoupled them by using Supabase as the central data store."

## 5. Frontend Challenges

**Q: What was the hardest React bug you fixed?**
- "I had a bug where opening a filter dropdown on mobile caused the entire screen to jump and scroll unexpectedly. The root cause was a React `autoFocus` prop on an input field inside an absolutely positioned menu. The browser was auto-scrolling to bring the input into view. I fixed it by replacing `autoFocus` with a custom `useRef` hook calling `.focus({ preventScroll: true })`."

## 6. Future Improvements (Always asked at the end)

**Q: What would you improve if you had more time or a budget?**
- "I would deploy residential proxy rotators for the Python scrapers to bypass advanced bot protection, and I would route the raw scraped website text entirely through an LLM (like Claude or Gemini) for flawless summarization and technical grading, rather than relying on regex keywords."

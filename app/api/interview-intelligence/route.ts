import { type NextRequest, NextResponse } from 'next/server';
import { askGemini } from '@/lib/gemini';

/* ── Types ──────────────────────────────────────────────────── */
interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

interface GoogleSearchResponse {
  items?: { title: string; snippet: string; link: string }[];
}

interface SerpApiResponse {
  organic_results?: { title: string; snippet: string; link: string }[];
}

/* ── Helpers ─────────────────────────────────────────────────── */
function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function googleCustomSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.GOOGLE_SEARCH_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;
  if (!key || !cx) return [];
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}&num=5`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = (await res.json()) as GoogleSearchResponse;
    return (data.items ?? []).map((i) => ({ title: i.title, snippet: i.snippet, link: i.link }));
  } catch {
    return [];
  }
}

async function serpApiSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  try {
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${key}&num=5`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = (await res.json()) as SerpApiResponse;
    return (data.organic_results ?? []).map((i) => ({
      title: i.title,
      snippet: i.snippet,
      link: i.link,
    }));
  } catch {
    return [];
  }
}

async function runSearch(query: string): Promise<SearchResult[]> {
  // Try Google Custom Search first, fall back to SerpAPI
  const gcse = await googleCustomSearch(query);
  if (gcse.length > 0) return gcse;
  return serpApiSearch(query);
}

/* ── POST handler ────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      company_name?: string;
      role_title?: string;
      job_description?: string;
    };

    const { company_name, role_title, job_description = '' } = body;
    if (!company_name || !role_title) {
      return NextResponse.json(
        { success: false, error: 'company_name and role_title are required' },
        { status: 400 },
      );
    }

    const slug = slugify(company_name);

    // ── STEP 1: Run all searches in parallel ─────────────────
    const queries: string[] = [
      `${company_name} interview experience`,
      `${company_name} ${role_title} interview questions`,
      `${company_name} interview experience Glassdoor`,
      `${company_name} interview experience Reddit`,
      `${company_name} interview experience AmbitionBox`,
      `site:reddit.com ${company_name} interview`,
      `${company_name} ${role_title} hiring process`,
      `${company_name} technical interview machine learning`,
    ];

    const fallbackUrls: string[] = [
      `https://www.ambitionbox.com/interviews/${slug}-interview-questions`,
      `https://www.glassdoor.co.in/Interview/${slug}-Interview-Questions`,
      `https://www.reddit.com/search/?q=${encodeURIComponent(company_name)}+interview&type=link`,
    ];

    const settled = await Promise.allSettled(queries.map((q) => runSearch(q)));

    const allResults: SearchResult[] = [];
    const rawSources: string[] = [...fallbackUrls];

    settled.forEach((result) => {
      if (result.status === 'fulfilled') {
        result.value.forEach((r) => {
          allResults.push(r);
          if (r.link && !rawSources.includes(r.link)) rawSources.push(r.link);
        });
      }
    });

    // ── STEP 2: Build snippet blob (max 8000 chars) ──────────
    let snippetBlob = allResults
      .map((r) => `SOURCE: ${r.link}\nTITLE: ${r.title}\nSNIPPET: ${r.snippet}`)
      .join('\n\n---\n\n');

    if (snippetBlob.length > 8000) snippetBlob = snippetBlob.slice(0, 8000);

    const noDataFound = snippetBlob.trim().length === 0;

    // ── STEP 3: Build Gemini prompt ──────────────────────────
    const prompt = `You are an expert interview coach.
I have collected the following information from the internet about interviews at ${company_name} for the role of ${role_title}.

COLLECTED INFORMATION:
${noDataFound ? 'No specific interview data was found online for this company.' : snippetBlob}

JOB DESCRIPTION (if provided):
${job_description || 'Not provided'}

Based on this information, provide a structured interview intelligence report.
${noDataFound ? 'Since no specific data was found, base your response on general industry patterns for this role type and company type.' : ''}

Respond ONLY with valid JSON — no markdown, no code fences, no explanation. The JSON must match this exact schema:

{
  "company_summary": "2-3 sentences about the company and their AI/tech focus",
  "interview_rounds": [
    {
      "round_number": 1,
      "round_name": "Technical Screening",
      "description": "What happens in this round",
      "duration": "30-45 minutes"
    }
  ],
  "repeated_questions": [
    {
      "question": "Actual question asked",
      "category": "ML Theory",
      "frequency": "Very Common",
      "tip": "How to answer this well"
    }
  ],
  "topics_to_prepare": [
    {
      "topic": "Topic name",
      "priority": "High",
      "reason": "Why this topic matters for this company"
    }
  ],
  "interview_tips": ["Tip from actual candidates"],
  "difficulty_level": "Medium",
  "typical_duration": "Total interview process duration",
  "offer_rate_signal": "Moderate",
  "salary_signals": "Any salary info found from reports",
  "red_flags": ["Any negative patterns reported"],
  "smart_questions_to_ask": ["Question you can ask the interviewer"],
  "data_sources_found": ["glassdoor", "reddit", "ambitionbox"],
  "confidence_level": "${noDataFound ? 'Low' : 'Medium'}"
}

Valid values:
- difficulty_level: "Easy" | "Medium" | "Hard"
- frequency: "Very Common" | "Common" | "Reported Once"
- priority: "High" | "Medium" | "Low"
- offer_rate_signal: "Competitive" | "Moderate" | "Easy"
- confidence_level: "High" | "Medium" | "Low"
- category: "ML Theory" | "DSA" | "System Design" | "Behavioral" | "HR"`;

    // ── STEP 4: Call Gemini ──────────────────────────────────
    const geminiRaw = await askGemini(prompt);

    // Check if Gemini returned an error (not configured etc.)
    if (geminiRaw.startsWith('GEMINI_API_KEY not configured')) {
      return NextResponse.json({ success: false, error: geminiRaw }, { status: 503 });
    }

    // ── STEP 5: Parse Gemini JSON ────────────────────────────
    // Strip markdown code fences if present
    const cleanJson = geminiRaw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    let intelligence: unknown;
    let parseError = false;

    try {
      intelligence = JSON.parse(cleanJson);
    } catch {
      parseError = true;
      intelligence = { raw_text: geminiRaw };
    }

    return NextResponse.json({
      success: true,
      company_name,
      role_title,
      intelligence,
      parse_error: parseError,
      no_data_found: noDataFound,
      raw_sources: rawSources.slice(0, 20),
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `Internal error: ${String(error)}` },
      { status: 500 },
    );
  }
}

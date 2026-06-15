import { NextResponse, NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO;

  if (!token || !repo) {
    return NextResponse.json(
      { success: false, error: 'GITHUB_TOKEN or GITHUB_REPO not configured.' },
      { status: 503 },
    );
  }

  let workflow = 'daily_scraper.yml';
  try {
    const body = await req.json();
    if (body.workflow) workflow = body.workflow;
  } catch {}

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'master' }),
      },
    );

    if (res.ok || res.status === 204) {
      return NextResponse.json({ success: true });
    }

    const text = await res.text().catch(() => res.statusText);
    return NextResponse.json({ success: false, error: text }, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

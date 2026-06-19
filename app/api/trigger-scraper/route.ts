import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { workflow } = await request.json();

    if (!workflow) {
      return NextResponse.json({ success: false, error: 'Missing workflow ID' }, { status: 400 });
    }

    const githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
    if (!githubToken) {
      return NextResponse.json({ success: false, error: 'Missing GITHUB_TOKEN in environment variables' }, { status: 500 });
    }

    // HireSense repository details
    const owner = 'DhruvTilva';
    const repo = 'hs';
    const ref = 'master';

    // GitHub API to trigger workflow dispatch
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GitHub API Error (${response.status}):`, errorText);
      return NextResponse.json({ success: false, error: `GitHub API failed: ${response.statusText}` }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to trigger workflow:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

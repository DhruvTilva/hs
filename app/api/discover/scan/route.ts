import { NextResponse } from 'next/server'

export async function POST() {
  const token = process.env.GITHUB_TOKEN
  const repo  = process.env.GITHUB_REPO

  if (!token || !repo) {
    return NextResponse.json(
      { success: false, error: 'GITHUB_TOKEN or GITHUB_REPO not configured' },
      { status: 500 },
    )
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/company_discovery.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      },
    )

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ success: false, error: text }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

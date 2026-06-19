// lib/discovery.ts
// Helper functions for the Company Discovery feature

export function calculatePotentialScore(company: Record<string, unknown>): number {
  let score = 0

  if (company.has_funding)           score += 30
  if (company.has_linkedin)          score += 20
  if (company.has_website)           score += 15
  if (company.has_technical_founder) score += 15
  if (company.has_github)            score += 10
  if ((company.news_mentions as number) > 0) score += 10
  if (company.team_size && parseInt(company.team_size as string) >= 3) score += 10
  if (company.government_grant)      score += 5

  return Math.min(score, 100)
}

export function getPotentialTier(score: number): string {
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

export function getPotentialLabel(tier: string): string {
  if (tier === 'high')   return '🔴 High Potential'
  if (tier === 'medium') return '🟡 Monitor'
  return '🟢 Too Early'
}

export function getRedFlags(company: Record<string, unknown>): string[] {
  const flags: string[] = []
  if (!company.has_website)           flags.push('No website found')
  if (!company.has_linkedin)          flags.push('No LinkedIn presence')
  if (!company.has_technical_founder) flags.push('No technical founder detected')
  if (!company.has_funding && !company.has_github && (company.news_mentions as number) === 0)
    flags.push('Zero online footprint')
  return flags
}

export function buildLinkedInSearchUrl(companyName: string): string {
  const query = encodeURIComponent(
    `"${companyName}" CTO OR "VP Engineering" OR "Engineering Manager" OR "AI Lead"`,
  )
  return `https://www.linkedin.com/search/results/people/?keywords=${query}`
}

export function buildOutreachMessage(companyName: string): string {
  return `Hi [Name],

I noticed ${companyName} is working in the AI/ML space in Ahmedabad. 
I am an AI/ML engineer based in Ahmedabad with experience in building 
ML models, GenAI applications, and data pipelines.

Would love to connect and explore if there is a fit as you grow the team.

Best regards,
Dhruv Tilva
GitHub: github.com/DhruvTilva`
}

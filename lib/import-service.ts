import type { Company } from '@/lib/types';

export function parseCsv(csvText: string): Record<string, string>[] {
  const result: string[][] = [];
  let row: string[] = [];
  let currentVal = '';
  let inQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentVal += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentVal);
        currentVal = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        if (char === '\r') i++;
        row.push(currentVal);
        result.push(row);
        row = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }
  
  if (currentVal || row.length > 0) {
    row.push(currentVal);
    result.push(row);
  }
  
  if (result.length < 2) return [];
  
  const headers = result[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  
  const dictRows: Record<string, string>[] = [];
  for (let i = 1; i < result.length; i++) {
    const r = result[i];
    if (r.length === 1 && !r[0].trim()) continue;
    
    const dict: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        dict[headers[j]] = (r[j] || '').trim();
      }
    }
    dictRows.push(dict);
  }
  return dictRows;
}

export function validateRow(row: Record<string, string>): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const name = row.company_name || row.name || '';
  if (!name) errors.push('Company Name');
  
  const location = row.location || '';
  if (!location) errors.push('Location');
  
  const linkedin = row.linkedin_url || row.linkedin || '';
  if (!linkedin) errors.push('LinkedIn URL');
  
  return { ok: errors.length === 0, errors };
}

function toBool(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'y'].includes(lower);
}

export function mapRowToCompany(row: Record<string, string>): Partial<Company> {
  const name = row.company_name || row.name || '';
  const tier = row.tier ? parseInt(row.tier, 10) : null;
  const category = row.category || null;
  const location = row.location || null;
  const website = row.website_url || row.website || null;
  const careers_url = row.careers_url || row.careers || null;
  const linkedin_url = row.linkedin_url || row.linkedin || null;
  const company_size = row.company_size || null;
  const ai_focus = row.ai_focus || null;
  const funding_stage = row.funding_stage || null;
  const priority_base_score = row.score ? parseInt(row.score, 10) : (row.priority_base_score ? parseInt(row.priority_base_score, 10) : 50);
  const notes = row.notes || null;
  
  return {
    name,
    tier: Number.isNaN(tier) ? null : tier,
    category,
    location,
    website,
    careers_url,
    linkedin_url,
    company_size,
    ai_focus,
    funding_stage,
    priority_base_score: Number.isNaN(priority_base_score) ? 50 : priority_base_score,
    google_alert_set: toBool(row.google_alert_set),
    li_alert_set: toBool(row.li_alert_set),
    career_page_watched: toBool(row.career_page_watched),
    notes
  };
}

export function deduplicateRows(parsedRows: Partial<Company>[], existingCompanies: Company[]): { newRows: Partial<Company>[], skipped: number } {
  let skippedCount = 0;
  const validNewRows: Partial<Company>[] = [];
  
  for (const row of parsedRows) {
    const isDuplicate = existingCompanies.some(existing => {
      if (row.linkedin_url && existing.linkedin_url && row.linkedin_url.toLowerCase() === existing.linkedin_url.toLowerCase()) return true;
      if (row.name && existing.name && row.name.toLowerCase() === existing.name.toLowerCase()) return true;
      return false;
    });
    
    const isDuplicateInBatch = validNewRows.some(validRow => {
      if (row.linkedin_url && validRow.linkedin_url && row.linkedin_url.toLowerCase() === validRow.linkedin_url.toLowerCase()) return true;
      if (row.name && validRow.name && row.name.toLowerCase() === validRow.name.toLowerCase()) return true;
      return false;
    });
    
    if (isDuplicate || isDuplicateInBatch) {
      skippedCount++;
    } else {
      validNewRows.push(row);
    }
  }
  
  return { newRows: validNewRows, skipped: skippedCount };
}

export function extractSheetId(url: string): string | null {
  try {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

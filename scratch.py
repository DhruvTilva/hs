with open('components/pages.tsx', 'r') as f:
    content = f.read()

styles = """
const TH_STYLE: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  color: 'var(--text-muted)',
  backgroundColor: 'var(--bg-secondary)',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600,
  textAlign: 'left',
};

const TD_STYLE: React.CSSProperties = {
  padding: '0.65rem 0.75rem',
  fontSize: '0.82rem',
  color: 'var(--text-secondary)',
  verticalAlign: 'top',
  borderBottom: '1px solid var(--border)',
};
"""

content = content.replace("export function CompaniesPage()", styles + "\nexport function CompaniesPage()")

with open('components/pages.tsx', 'w') as f:
    f.write(content)


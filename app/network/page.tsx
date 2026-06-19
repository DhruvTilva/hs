import { NetworkGrowth } from '@/components/network-growth'
import { AppShell } from '@/components/app-shell'

export const metadata = {
  title: 'Network Growth — HireSense',
  description: 'Discover AI/ML recruiters, HR managers, and hiring decision makers to grow your LinkedIn network.',
}

export default function NetworkPage() {
  return (
    <AppShell title="🔗 Network Growth" subtitle="AI/ML recruiters, hiring managers, and decision makers discovered today. Connect with them to grow your LinkedIn network.">
      <NetworkGrowth />
    </AppShell>
  )
}

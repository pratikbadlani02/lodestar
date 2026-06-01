import { useNavigate } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { PageShell, PageHeader } from '../components/ui/primitives'
import CoachTrade from '../components/CoachTrade'

// Standalone route for Coach Mode (also embedded as ladder Rung 8 in Learn).
export default function Coach() {
  const navigate = useNavigate()
  return (
    <PageShell>
      <PageHeader
        icon={GraduationCap}
        title="Guided Trade — Coach Mode"
        subtitle="Read a stock’s real analysis in plain English, check yourself, and place a safe practice trade."
      />
      <CoachTrade onBack={() => navigate('/learn')} />
    </PageShell>
  )
}

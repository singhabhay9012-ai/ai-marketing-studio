import { ComingSoon } from '@/components/coming-soon';

export default function Page() {
  return <ComingSoon title="Publishing" sprint="the publishing phase (after downloadable kits are stable)" items={['OAuth connections per platform, encrypted token storage', 'Scheduling queue with retries and status reconciliation', 'Rolled out channel by channel as each platform approves the app']} />;
}

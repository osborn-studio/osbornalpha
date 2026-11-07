// spec §6.2 tracking inbox page (protected (app) group; the API answers 401 without a session).
import { Disclaimer } from '@/components/Disclaimer';
import { TrackingInbox } from '@/components/company/tracking/TrackingInbox';

export const dynamic = 'force-dynamic';

export default function TrackingPage() {
  return (
    <>
      <TrackingInbox />
      <Disclaimer />
    </>
  );
}

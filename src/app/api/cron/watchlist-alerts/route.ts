import { handleWatchlistAlertCron } from '@/lib/watchlist/alert-cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleWatchlistAlertCron(request, 'all');
}

import { runWatchlistDeliveryCanary } from '../src/lib/watchlist/delivery-canary';

void runWatchlistDeliveryCanary()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'watchlist_delivery_canary_failed');
    process.exitCode = 1;
  });

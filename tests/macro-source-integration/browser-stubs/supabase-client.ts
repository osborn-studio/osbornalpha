// The fixture harness has no real auth client, session storage, or auth network.
// Keep useStrategyFetch itself real; auth transitions belong to its production tests.
export function getBrowserSupabase() {
  return { auth: { onAuthStateChange() {
    return { data: { subscription: { unsubscribe() {} } } };
  } } };
}

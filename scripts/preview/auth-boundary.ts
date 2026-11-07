/** Local integration harness only: the real overview hook and fetch paths still execute. No session is present. */
export const getBrowserSupabase = () => ({
  auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
});

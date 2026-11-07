// Harness-only navigation: real components, ordinary browser history, no Next runtime.
export class FixtureNotFound extends Error { readonly status = 404; }
export function notFound(): never { throw new FixtureNotFound('Fixture page not found'); }
export function useRouter() {
  return {
    replace(href: string) { window.history.replaceState(null, '', href.replace(/^\/intel\/macro(?=\/|\?|$)/, '/macro')); },
    push(href: string) { window.location.assign(href); },
    refresh() { window.location.reload(); },
    back() { window.history.back(); },
    prefetch() {},
  };
}

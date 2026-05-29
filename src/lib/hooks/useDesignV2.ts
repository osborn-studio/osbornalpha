'use client';

import { useEffect, useState } from 'react';

/**
 * Reads the active design version from <html data-design>. The attribute is
 * set pre-hydration by the inline script in layout.tsx (from ?design query
 * or localStorage), so by the time a client component mounts it's authoritative.
 *
 * Returns `true` when v2 (Stitch "quiet-luxury trader terminal") is active.
 * Components use this to swap emoji chrome → line-art icons, etc. Pure
 * token-driven styling (colors/fonts) does NOT need this hook — those flip
 * automatically via the CSS `[data-design="v2"]` selectors.
 */
export function useDesignV2(): boolean {
  const [v2, setV2] = useState(false);

  useEffect(() => {
    const read = () =>
      setV2(document.documentElement.getAttribute('data-design') === 'v2');
    read();
    // Re-read if the Settings page flips it live (attribute mutation)
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-design'],
    });
    return () => obs.disconnect();
  }, []);

  return v2;
}

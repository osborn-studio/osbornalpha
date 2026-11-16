import { hydrateRoot } from 'react-dom/client';
import { fixturePage, type FixturePageInput } from './browser-stubs/pages';

declare global { interface Window { __MACRO_FIXTURE__: FixturePageInput } }
async function start() {
  const root = document.getElementById('root');
  if (!root) throw new Error('Fixture root missing');
  const page = await fixturePage(window.__MACRO_FIXTURE__);
  hydrateRoot(root, page);
}
void start();

export type Theme = 'dark' | 'light';
export function readTheme(): Theme {
  return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
}
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('theme-dark', 'theme-light');
  root.classList.add(`theme-${theme}`);
}
export function saveTheme(theme: Theme) {
  localStorage.setItem('theme', theme);
  applyTheme(theme);
  window.dispatchEvent(new Event('theme-change'));
}

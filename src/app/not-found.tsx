import Link from 'next/link';

// App-wide 404. Replaces Next's default bare page with a branded, navigable one.
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="text-5xl font-bold text-accent">404</div>
      <h1 className="mt-3 text-lg font-bold">页面不存在</h1>
      <p className="mt-1 text-sm text-text-dim">你访问的页面已移动或从未存在。</p>
      <div className="mt-5 flex items-center gap-2">
        <Link href="/dashboard" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white">
          返回首页
        </Link>
        <Link href="/watchlist" className="rounded-md bg-bg-card px-4 py-2 text-sm text-text-dim hover:text-text">
          股票池
        </Link>
      </div>
    </div>
  );
}

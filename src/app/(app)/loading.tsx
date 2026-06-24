// Route-transition loading UI for the (app) group. Shown while a server
// component segment streams. Subtle skeleton matching the workbench layout.
export default function AppLoading() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="加载中">
      <div className="h-7 w-40 rounded bg-bg-card" />
      <div className="card-base">
        <div className="mb-3 h-4 w-24 rounded bg-bg-elevated" />
        <div className="space-y-2">
          <div className="h-10 rounded bg-bg-elevated" />
          <div className="h-10 rounded bg-bg-elevated" />
          <div className="h-10 rounded bg-bg-elevated" />
        </div>
      </div>
    </div>
  );
}

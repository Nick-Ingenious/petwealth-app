export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-64 rounded-lg bg-line/60" />
      <div className="h-96 rounded-card bg-line/40" />
    </div>
  );
}

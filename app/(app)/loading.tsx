export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-1/3 animate-pulse rounded bg-neutral-200" />
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-lg bg-neutral-100" />
        <div className="h-20 animate-pulse rounded-lg bg-neutral-100" />
        <div className="h-20 animate-pulse rounded-lg bg-neutral-100" />
      </div>
    </div>
  );
}

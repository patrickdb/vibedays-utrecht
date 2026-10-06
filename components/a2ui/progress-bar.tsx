// The ProgressBar of Lissie's A2UI catalog. Styled like the rest of the app
// (zinc palette with dark variants, see components/todo-sidebar.tsx); the
// numbers arrive already resolved from the A2UI data model.
export function ProgressBar({
  value,
  max,
  remaining,
}: {
  value: number;
  max: number;
  remaining?: number;
}) {
  // An empty list is 0%, not NaN; a value past max cannot overflow the track.
  const percent =
    max > 0 ? Math.round(Math.min(Math.max(value / max, 0), 1) * 100) : 0;
  return (
    <div className="flex w-full min-w-48 flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm text-zinc-900 dark:text-zinc-100">
        <span>
          {value} of {max} done
        </span>
        {remaining === undefined ? null : (
          <span className="text-xs text-zinc-500">{remaining} open</span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Todos done"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
      >
        <div
          className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

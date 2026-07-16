type WeatherResultLoaderProps = {
  title: string
  bullets: [string, string]
  routeLabel?: string
}

export function WeatherResultLoader({ title, bullets, routeLabel }: WeatherResultLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4"
    >
      <div className="flex items-center gap-3">
        <span
          className="h-8 w-8 shrink-0 rounded-full border-2 border-primary/25 border-t-primary animate-spin"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {routeLabel && (
            <p className="text-xs text-muted-foreground truncate">{routeLabel}</p>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-2 pl-1">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/40 shrink-0 mt-1.5" aria-hidden />
            <span className="text-xs text-muted-foreground">{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

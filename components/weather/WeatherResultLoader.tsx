type WeatherResultLoaderProps = {
  title: string
  subtitle: string
  steps: [string, string, string]
  routeLabel?: string
}

export function WeatherResultLoader({ title, subtitle, steps, routeLabel }: WeatherResultLoaderProps) {
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
          <p className={routeLabel ? 'sr-only' : 'text-xs text-muted-foreground'}>{subtitle}</p>
        </div>
      </div>

      <ul className="flex flex-col gap-2 pl-1" aria-hidden>
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/40 shrink-0 animate-pulse" style={{ animationDelay: `${i * 300}ms` }} />
            <span className="text-xs text-muted-foreground">{step}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

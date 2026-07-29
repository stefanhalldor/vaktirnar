import { clsx } from 'clsx'
import { ExternalLink } from 'lucide-react'

import type {
  RouteWeatherCoverage,
  RouteWeatherCoverageBoundary,
} from '@/lib/iceland-routes/trustedRouteCoverage'
import {
  buildGoogleMapsDirectionsUrl,
  type GoogleMapsDirectionsPoint,
} from '@/lib/iceland-routes/googleMapsDirectionsUrl'

export type RouteNavigationHandoffLabels = Readonly<{
  assessmentTitle: string
  routeTitle: string
  navigationTitle: string
  boundaryFallback: string
  settlementBoundary: string
  officialRoadBoundary: string
  openDirections: string
}>

export type RouteNavigationHandoffProps = Readonly<{
  coverage: RouteWeatherCoverage
  origin: GoogleMapsDirectionsPoint
  destination: GoogleMapsDirectionsPoint
  originName: string
  destinationName: string
  originAreaName: string
  destinationAreaName: string
  labels: RouteNavigationHandoffLabels
  className?: string
}>

type NavigationLink = {
  href: string
  label: string
}

export function formatRouteCoverageBoundaryLabel(
  boundary: RouteWeatherCoverageBoundary,
  labels: Pick<
    RouteNavigationHandoffLabels,
    'boundaryFallback' | 'settlementBoundary' | 'officialRoadBoundary'
  >,
): string {
  const fallback = boundary.label.trim() || labels.boundaryFallback
  if (boundary.kind === 'exact') return fallback
  if (boundary.kind === 'settlement_gateway') {
    return `${labels.settlementBoundary}: ${fallback}`
  }

  const roadParts = [boundary.roadName?.trim(), boundary.roadNumber?.trim()]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, values) => values.indexOf(part) === index)
  const road = roadParts.join(' ') || fallback
  return `${labels.officialRoadBoundary}: ${road}`
}

const LINK_CLASS_NAME = [
  'inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 rounded-xl px-3 py-2',
  'text-center text-sm font-medium transition-colors',
  'border border-border bg-background text-foreground hover:bg-muted/70',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
].join(' ')

function directionsLink(
  origin: GoogleMapsDirectionsPoint,
  destination: GoogleMapsDirectionsPoint,
  label: string,
): NavigationLink | null {
  const href = buildGoogleMapsDirectionsUrl({ origin, destination })
  return href ? { href, label } : null
}

function ExternalDirectionsLink({ link }: { link: NavigationLink }) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      className={LINK_CLASS_NAME}
    >
      <span className="min-w-0 break-words">{link.label}</span>
      <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" />
    </a>
  )
}

export function RouteNavigationHandoff({
  coverage,
  origin,
  destination,
  originName,
  destinationName,
  originAreaName,
  destinationAreaName,
  labels,
  className,
}: RouteNavigationHandoffProps) {
  if (coverage.status === 'full') return null

  const fullTripLink = directionsLink(origin, destination, labels.openDirections)
  if (!fullTripLink) return null
  const preciseOrigin = originName.trim() || originAreaName.trim()
  const preciseDestination = destinationName.trim() || destinationAreaName.trim()
  const fallbackOriginArea = originAreaName.trim() || preciseOrigin
  const fallbackDestinationArea = destinationAreaName.trim() || preciseDestination
  const assessmentOrigin = coverage.status === 'partial'
    ? coverage.start.label.trim() || fallbackOriginArea
    : coverage.status === 'same_urban_area'
      ? coverage.settlementName
      : fallbackOriginArea
  const assessmentDestination = coverage.status === 'partial'
    ? coverage.end.label.trim() || fallbackDestinationArea
    : coverage.status === 'same_urban_area'
      ? coverage.settlementName
      : fallbackDestinationArea

  if (!preciseOrigin || !preciseDestination || !assessmentOrigin || !assessmentDestination) return null

  return (
    <section
      aria-label={labels.navigationTitle}
      className={clsx(
        'w-full min-w-0 border-t border-border/70 pt-3 text-xs text-foreground',
        className,
      )}
    >
      <dl className="grid min-w-0 gap-3">
        <div className="min-w-0">
          <dt className="leading-snug text-muted-foreground">
            {coverage.status === 'partial' ? labels.assessmentTitle : labels.routeTitle}
          </dt>
          <dd className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 font-medium">
            <span className="min-w-0 break-words">{assessmentOrigin}</span>
            <span aria-hidden="true" className="text-muted-foreground">→</span>
            <span className="min-w-0 break-words text-right">{assessmentDestination}</span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="leading-snug text-muted-foreground">{labels.navigationTitle}</dt>
          <dd className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 font-medium">
            <span className="min-w-0 break-words">{preciseOrigin}</span>
            <span aria-hidden="true" className="text-muted-foreground">→</span>
            <span className="min-w-0 break-words text-right">{preciseDestination}</span>
          </dd>
        </div>
      </dl>
      <div className="mt-3">
        <ExternalDirectionsLink link={fullTripLink} />
      </div>
    </section>
  )
}

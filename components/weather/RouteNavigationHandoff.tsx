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
  partialTitle: string
  sameUrbanTitle: string
  unavailableTitle: string
  coverageStart: string
  coverageEnd: string
  boundaryFallback: string
  settlementBoundary: string
  officialRoadBoundary: string
  beforeCoverageAction: string
  afterCoverageAction: string
  fullTripAction: string
}>

export type RouteNavigationHandoffProps = Readonly<{
  coverage: RouteWeatherCoverage
  origin: GoogleMapsDirectionsPoint
  destination: GoogleMapsDirectionsPoint
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

function ExternalDirectionsLink({ link, primary = false }: {
  link: NavigationLink
  primary?: boolean
}) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      className={clsx(
        LINK_CLASS_NAME,
        primary
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border border-primary/30 bg-background text-primary hover:bg-primary/5',
      )}
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
  labels,
  className,
}: RouteNavigationHandoffProps) {
  if (coverage.status === 'full') return null

  const fullTripLink = directionsLink(origin, destination, labels.fullTripAction)

  if (coverage.status === 'same_urban_area' || coverage.status === 'unavailable') {
    const title = coverage.status === 'same_urban_area'
      ? labels.sameUrbanTitle
      : labels.unavailableTitle
    return fullTripLink ? (
      <section
        aria-label={title}
        className={clsx(
          'w-full min-w-0 rounded-xl border border-border bg-muted/35 p-3 text-sm text-foreground',
          className,
        )}
      >
        <p className="mb-3 leading-snug">{title}</p>
        <ExternalDirectionsLink link={fullTripLink} primary />
      </section>
    ) : null
  }

  const beforeCoverageLink = (coverage.unassessedBeforeM ?? 0) > 0
    ? directionsLink(origin, coverage.start.point, labels.beforeCoverageAction)
    : null
  const afterCoverageLink = (coverage.unassessedAfterM ?? 0) > 0
    ? directionsLink(coverage.end.point, destination, labels.afterCoverageAction)
    : null
  const segmentLinks = [beforeCoverageLink, afterCoverageLink]
    .filter((link): link is NavigationLink => link !== null)
  const actionLinks = segmentLinks.length > 0
    ? segmentLinks
    : fullTripLink
      ? [fullTripLink]
      : []

  return (
    <section
      aria-label={labels.partialTitle}
      className={clsx(
        'w-full min-w-0 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950',
        'dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100',
        className,
      )}
    >
      <h3 className="font-medium">{labels.partialTitle}</h3>
      <dl className="mt-2 grid min-w-0 gap-1.5 text-xs">
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2">
          <dt className="text-amber-800 dark:text-amber-300">{labels.coverageStart}</dt>
          <dd className="min-w-0 break-words font-medium">
            {formatRouteCoverageBoundaryLabel(coverage.start, labels)}
          </dd>
        </div>
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2">
          <dt className="text-amber-800 dark:text-amber-300">{labels.coverageEnd}</dt>
          <dd className="min-w-0 break-words font-medium">
            {formatRouteCoverageBoundaryLabel(coverage.end, labels)}
          </dd>
        </div>
      </dl>
      {actionLinks.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {actionLinks.map(link => (
            <ExternalDirectionsLink key={`${link.label}:${link.href}`} link={link} />
          ))}
        </div>
      )}
    </section>
  )
}

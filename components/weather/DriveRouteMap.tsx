'use client'

import { useEffect, useMemo, useRef } from 'react'
import { OPENSTREETMAP_ATTRIBUTION } from '@/lib/iceland-routes/openDataSources'

export const DRIVE_MAP_ROUTE_COLOR = '#14532d'
export const DRIVE_MAP_CARTO_TILES = [
  'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
]
export const DRIVE_MAP_CARTO_ATTRIBUTION = `${OPENSTREETMAP_ATTRIBUTION} | © CARTO`
export const DRIVE_MAP_ROAD_NETWORK_TILES = [
  '/api/teskeid/road-intelligence/map-proxy?source=vegakerfi&bbox={bbox-epsg-3857}',
]

export const DRIVE_MAP_SEGMENT_COLOR_EXPRESSION = [
  'case',
  ['has', 'teskeidRoadStatusColor'],
  ['to-color', ['get', 'teskeidRoadStatusColor']],
  '#64748b',
]

export const DRIVE_MAP_SEGMENT_WIDTH_EXPRESSION = [
  'interpolate',
  ['linear'],
  ['zoom'],
  5, 1.4,
  8, 2.4,
  11, 4,
]

export type DriveRouteMapStation = {
  id: string
  name: string
  lat: number
  lon: number
  color: string
  driveTimeLabel?: string | null
}

export type DriveRouteMapRoute = {
  id: string
  points: Array<{ lat: number; lon: number }>
  color: string
  offset?: number
  opacity?: number
  width?: number
  dashArray?: number[]
  /** Overlay lines can select their owning route without exposing an internal overlay id. */
  selectRouteId?: string
}

export type DriveRouteMapAnnotation = {
  id: string
  kind: 'gravel'
  label: string
  point: { lat: number; lon: number }
  focusPoints: Array<{ lat: number; lon: number }>
  distanceKm: number
  /** Only one callout is shown at a time so nearby short sections cannot overlap. */
  showLabel?: boolean
}

type DriveRouteMapStationMarkerVisual = {
  id: string
  element: HTMLButtonElement
  dot: HTMLSpanElement
}

function applyStationMarkerSelection(
  visuals: DriveRouteMapStationMarkerVisual[],
  selectedStationId: string | null,
) {
  for (const visual of visuals) {
    const selected = visual.id === selectedStationId
    const size = selected ? 18 : 14
    visual.element.setAttribute('aria-pressed', String(selected))
    visual.element.style.zIndex = selected ? '2' : '1'
    visual.dot.style.left = `${-size / 2}px`
    visual.dot.style.top = `${-size / 2}px`
    visual.dot.style.width = `${size}px`
    visual.dot.style.height = `${size}px`
    visual.dot.style.borderWidth = selected ? '4px' : '3px'
    visual.dot.style.boxShadow = selected
      ? '0 0 0 2px rgba(20,83,45,0.32),0 2px 6px rgba(15,23,42,0.32)'
      : '0 1px 4px rgba(15,23,42,0.3)'
  }
}

const EMPTY_ROUTE_POINTS: Array<{ lat: number; lon: number }> = []
const EMPTY_ROUTES: DriveRouteMapRoute[] = []
const EMPTY_STATIONS: DriveRouteMapStation[] = []
const EMPTY_ANNOTATIONS: DriveRouteMapAnnotation[] = []

export function driveRouteMapAnnotationLabel(
  annotation: Pick<DriveRouteMapAnnotation, 'distanceKm' | 'label'>,
  locale = 'is-IS',
) {
  const formattedDistance = new Intl.NumberFormat(locale, {
    minimumFractionDigits: annotation.distanceKm < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(annotation.distanceKm)
  return `${formattedDistance} km · ${annotation.label}`
}

function routeGeoJson(points: Array<{ lat: number; lon: number }>) {
  return {
    type: 'FeatureCollection' as const,
    features: points.length >= 2
      ? [{
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'LineString' as const,
            coordinates: points.map(point => [point.lon, point.lat]),
          },
        }]
      : [],
  }
}

export function DriveRouteMap({
  routePoints = EMPTY_ROUTE_POINTS,
  routes = EMPTY_ROUTES,
  stations = EMPTY_STATIONS,
  annotations = EMPTY_ANNOTATIONS,
  selectedStationId = null,
  onSelectStation,
  onSelectRoute,
  ariaLabel,
  className = 'h-[190px] w-full',
  externalContainer,
  interactive = true,
}: {
  routePoints?: Array<{ lat: number; lon: number }>
  routes?: DriveRouteMapRoute[]
  stations?: DriveRouteMapStation[]
  annotations?: DriveRouteMapAnnotation[]
  selectedStationId?: string | null
  onSelectStation?: (stationId: string) => void
  onSelectRoute?: (routeId: string) => void
  ariaLabel?: string
  className?: string
  externalContainer?: (node: HTMLDivElement | null) => void
  interactive?: boolean
}) {
  const localContainerRef = useRef<HTMLDivElement | null>(null)
  const onSelectStationRef = useRef(onSelectStation)
  const onSelectRouteRef = useRef(onSelectRoute)
  const selectedStationIdRef = useRef(selectedStationId)
  const stationMarkerVisualsRef = useRef<DriveRouteMapStationMarkerVisual[]>([])
  const mapRef = useRef<import('maplibre-gl').Map | null>(null)
  const currentDrawableRoutes = useMemo<DriveRouteMapRoute[]>(() => (
    routes.length > 0
      ? routes.filter(route => route.points.length >= 2)
      : routePoints.length >= 2
        ? [{ id: 'primary', points: routePoints, color: DRIVE_MAP_ROUTE_COLOR }]
        : []
  ), [routePoints, routes])
  const routeStructureKey = currentDrawableRoutes.map(route => (
    `${route.id}:${route.selectRouteId ?? ''}:${route.dashArray?.join(',') ?? ''}`
  )).join('\u0000')
  const stationStructureKey = stations.map(station => (
    `${station.id}:${station.lat}:${station.lon}:${station.color}:${station.driveTimeLabel ?? ''}`
  )).join('\u0000')
  const annotationStructureKey = annotations.map(annotation => (
    `${annotation.id}:${annotation.point.lat}:${annotation.point.lon}:${annotation.distanceKm}:${annotation.label}:${annotation.showLabel ? 1 : 0}:${annotation.focusPoints.map(point => `${point.lat},${point.lon}`).join('|')}`
  )).join('\u0000')
  const drawableRoutesRef = useRef(currentDrawableRoutes)
  const stationsRef = useRef(stations)
  const annotationsRef = useRef(annotations)
  drawableRoutesRef.current = currentDrawableRoutes
  stationsRef.current = stations
  annotationsRef.current = annotations
  selectedStationIdRef.current = selectedStationId

  useEffect(() => {
    onSelectStationRef.current = onSelectStation
  }, [onSelectStation])

  useEffect(() => {
    onSelectRouteRef.current = onSelectRoute
  }, [onSelectRoute])

  useEffect(() => {
    applyStationMarkerSelection(stationMarkerVisualsRef.current, selectedStationId)
  }, [selectedStationId])

  useEffect(() => {
    const drawableRoutes = drawableRoutesRef.current
    const initialStations = stationsRef.current
    const initialAnnotations = annotationsRef.current
    if (externalContainer || !localContainerRef.current || drawableRoutes.length === 0) return
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null
    const markers: import('maplibre-gl').Marker[] = []
    const stationMarkerVisuals: DriveRouteMapStationMarkerVisual[] = []
    let map: import('maplibre-gl').Map | null = null

    void (async () => {
      const maplibregl = await import('maplibre-gl')
      if (cancelled || !localContainerRef.current) return

      map = new maplibregl.Map({
        container: localContainerRef.current,
        style: {
          version: 8,
          sources: {
            'drive-basemap': {
              type: 'raster',
              tiles: DRIVE_MAP_CARTO_TILES,
              tileSize: 256,
              attribution: DRIVE_MAP_CARTO_ATTRIBUTION,
            },
          },
          layers: [{ id: 'drive-basemap', type: 'raster', source: 'drive-basemap' }],
        },
        center: [drawableRoutes[0].points[0].lon, drawableRoutes[0].points[0].lat],
        zoom: 6,
        attributionControl: false,
        interactive,
      })
      mapRef.current = map

      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: 'Veðurstofa Íslands',
        }),
        'bottom-left',
      )
      map.on('error', () => {
        // Keep the compact route map usable if a basemap tile is temporarily unavailable.
      })

      map.on('load', () => {
        if (!map || cancelled) return
        drawableRoutes.forEach((route, index) => {
          const sourceId = `drive-route-${index}`
          map!.addSource(sourceId, { type: 'geojson', data: routeGeoJson(route.points) })
          map!.addLayer({
            id: `drive-route-line-${index}`,
            type: 'line',
            source: sourceId,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': route.color,
              'line-width': route.width ?? 4,
              'line-opacity': route.opacity ?? 0.88,
              'line-offset': route.offset ?? 0,
              ...(route.dashArray ? { 'line-dasharray': route.dashArray } : {}),
            },
          })
          const hitLayerId = `drive-route-hit-${index}`
          map!.addLayer({
            id: hitLayerId,
            type: 'line',
            source: sourceId,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': route.color,
              'line-width': Math.max(16, (route.width ?? 4) + 10),
              'line-opacity': 0,
              'line-offset': route.offset ?? 0,
            },
          })
          map!.on('click', hitLayerId, () => (
            onSelectRouteRef.current?.(route.selectRouteId ?? route.id)
          ))
          map!.on('mouseenter', hitLayerId, () => {
            if (map) map.getCanvas().style.cursor = 'pointer'
          })
          map!.on('mouseleave', hitLayerId, () => {
            if (map) map.getCanvas().style.cursor = ''
          })
        })

        for (const station of initialStations) {
          const element = document.createElement('button')
          element.type = 'button'
          element.title = station.name
          element.setAttribute('aria-label', station.name)
          element.style.cssText = [
            'display:block',
            'width:0',
            'height:0',
            'border:0',
            'padding:0',
            'background:transparent',
            'position:relative',
            'overflow:visible',
            'cursor:pointer',
          ].join(';')
          const dot = document.createElement('span')
          dot.style.cssText = [
            'position:absolute',
            'border-style:solid',
            'border-color:white',
            'border-radius:999px',
            `background:${station.color}`,
            'transition:left 120ms ease,top 120ms ease,width 120ms ease,height 120ms ease,box-shadow 120ms ease',
          ].join(';')
          element.appendChild(dot)
          const pill = document.createElement('span')
          pill.textContent = `🚗 ${station.driveTimeLabel ?? '–'}`
          pill.style.cssText = [
            'position:absolute',
            'left:50%',
            'bottom:10px',
            'max-width:120px',
            'overflow:hidden',
            'text-overflow:ellipsis',
            'white-space:nowrap',
            'transform:translateX(-50%)',
            'border:1px solid rgba(21,66,18,0.18)',
            'border-radius:999px',
            'background:rgba(255,255,255,0.94)',
            'color:#334155',
            'box-shadow:0 1px 3px rgba(15,23,42,0.12)',
            'padding:2px 5px',
            'font:600 9px/1.15 Inter,system-ui,sans-serif',
          ].join(';')
          element.appendChild(pill)
          element.addEventListener('click', () => onSelectStationRef.current?.(station.id))
          const markerVisual = { id: station.id, element, dot }
          stationMarkerVisuals.push(markerVisual)
          applyStationMarkerSelection([markerVisual], selectedStationIdRef.current)
          markers.push(
            new maplibregl.Marker({ element, anchor: 'center' })
              .setLngLat([station.lon, station.lat])
              .addTo(map!),
          )
        }
        stationMarkerVisualsRef.current = stationMarkerVisuals

        const annotationCallouts = new Map<string, HTMLSpanElement>()
        const showAnnotationCallout = (annotationId: string) => {
          for (const [id, callout] of annotationCallouts) {
            callout.style.display = id === annotationId ? 'block' : 'none'
          }
        }
        const routeLatitudes = drawableRoutes.flatMap(route => route.points.map(point => point.lat))
        const routeLongitudes = drawableRoutes.flatMap(route => route.points.map(point => point.lon))
        const routeCenter = {
          lat: (Math.min(...routeLatitudes) + Math.max(...routeLatitudes)) / 2,
          lon: (Math.min(...routeLongitudes) + Math.max(...routeLongitudes)) / 2,
        }

        for (const annotation of initialAnnotations) {
          if (annotation.focusPoints.length < 2) continue
          const label = driveRouteMapAnnotationLabel(
            annotation,
            document.documentElement.lang || 'is-IS',
          )
          const element = document.createElement('button')
          element.type = 'button'
          element.title = label
          element.setAttribute('aria-label', label)
          Object.assign(element.style, {
            display: 'block',
            width: '40px',
            height: '40px',
            border: '0',
            padding: '0',
            background: 'transparent',
            position: 'relative',
            overflow: 'visible',
            cursor: 'pointer',
            borderRadius: '999px',
          })

          const stonePattern = document.createElement('span')
          stonePattern.setAttribute('aria-hidden', 'true')
          Object.assign(stonePattern.style, {
            position: 'absolute',
            left: '8px',
            top: '9px',
            width: '24px',
            height: '22px',
            border: '2px solid white',
            borderRadius: '8px',
            background: '#fef3c7',
            boxShadow: '0 0 0 1px #92400e,0 2px 5px rgba(15,23,42,0.3)',
          })
          for (const [left, top, size] of [[4, 8, 6], [10, 4, 7], [16, 10, 5]] as const) {
            const stone = document.createElement('span')
            Object.assign(stone.style, {
              position: 'absolute',
              left: `${left}px`,
              top: `${top}px`,
              width: `${size}px`,
              height: `${Math.max(4, size - 1)}px`,
              border: '1px solid #78350f',
              borderRadius: '45% 55% 50% 45%',
              background: '#d97706',
              transform: `rotate(${left * 7}deg)`,
            })
            stonePattern.appendChild(stone)
          }
          element.appendChild(stonePattern)

          const callout = document.createElement('span')
          callout.textContent = label
          const placeRight = annotation.point.lon <= routeCenter.lon
          const placeBelow = annotation.point.lat >= routeCenter.lat
          Object.assign(callout.style, {
            position: 'absolute',
            ...(placeRight ? { left: '30px' } : { right: '30px' }),
            ...(placeBelow ? { top: '27px' } : { bottom: '27px' }),
            display: 'none',
            maxWidth: '150px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            border: '1px solid #92400e',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.97)',
            color: '#451a03',
            boxShadow: '0 2px 6px rgba(15,23,42,0.2)',
            padding: '4px 8px',
            font: '700 11px/1.2 Inter,system-ui,sans-serif',
            pointerEvents: 'none',
          })
          const leader = document.createElement('span')
          leader.setAttribute('aria-hidden', 'true')
          Object.assign(leader.style, {
            position: 'absolute',
            ...(placeRight ? { left: '-13px' } : { right: '-13px' }),
            ...(placeBelow ? { top: '-3px' } : { bottom: '-3px' }),
            width: '14px',
            height: '2px',
            background: '#92400e',
            transformOrigin: 'center',
            transform: `rotate(${placeRight === placeBelow ? 24 : -24}deg)`,
          })
          callout.appendChild(leader)
          element.appendChild(callout)
          annotationCallouts.set(annotation.id, callout)

          const focusSection = () => {
            if (!map) return
            showAnnotationCallout(annotation.id)
            const sectionBounds = new maplibregl.LngLatBounds()
            annotation.focusPoints.forEach(point => sectionBounds.extend([point.lon, point.lat]))
            map.fitBounds(sectionBounds, { padding: 48, duration: 280, maxZoom: 13 })
          }
          element.addEventListener('focus', () => {
            element.style.outline = '2px solid #14532d'
            element.style.outlineOffset = '2px'
            focusSection()
          })
          element.addEventListener('blur', () => {
            element.style.outline = 'none'
          })
          element.addEventListener('click', event => {
            event.stopPropagation()
            focusSection()
          })
          markers.push(
            new maplibregl.Marker({ element, anchor: 'center' })
              .setLngLat([annotation.point.lon, annotation.point.lat])
              .addTo(map),
          )
        }
        const initialCallout = initialAnnotations.find(annotation => annotation.showLabel)
        if (initialCallout) showAnnotationCallout(initialCallout.id)

        const bounds = new maplibregl.LngLatBounds()
        drawableRoutes.forEach(route => {
          route.points.forEach(point => bounds.extend([point.lon, point.lat]))
        })
        map.fitBounds(bounds, {
          padding: initialAnnotations.length > 0 ? 40 : 18,
          duration: 0,
          maxZoom: 9,
        })
      })

      resizeObserver = new ResizeObserver(() => map?.resize())
      resizeObserver.observe(localContainerRef.current)
    })()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      markers.forEach(marker => marker.remove())
      if (stationMarkerVisualsRef.current === stationMarkerVisuals) {
        stationMarkerVisualsRef.current = []
      }
      map?.remove()
      if (mapRef.current === map) mapRef.current = null
    }
  }, [annotationStructureKey, externalContainer, interactive, routeStructureKey, stationStructureKey])

  // Selection/style changes update existing layers in place. This keeps route
  // switching instant instead of destroying and rebuilding MapLibre.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const updateRoutes = () => {
      if (!mapRef.current || !map.isStyleLoaded()) return
      currentDrawableRoutes.forEach((route, index) => {
        const source = map.getSource(`drive-route-${index}`) as import('maplibre-gl').GeoJSONSource | undefined
        source?.setData(routeGeoJson(route.points) as never)
        const lineId = `drive-route-line-${index}`
        const hitId = `drive-route-hit-${index}`
        if (map.getLayer(lineId)) {
          map.setPaintProperty(lineId, 'line-color', route.color)
          map.setPaintProperty(lineId, 'line-width', route.width ?? 4)
          map.setPaintProperty(lineId, 'line-opacity', route.opacity ?? 0.88)
          map.setPaintProperty(lineId, 'line-offset', route.offset ?? 0)
          map.setPaintProperty(lineId, 'line-dasharray', route.dashArray ?? null)
        }
        if (map.getLayer(hitId)) {
          map.setPaintProperty(hitId, 'line-width', Math.max(16, (route.width ?? 4) + 10))
          map.setPaintProperty(hitId, 'line-offset', route.offset ?? 0)
        }
      })
    }
    if (map.isStyleLoaded()) updateRoutes()
    else map.once('load', updateRoutes)
  }, [currentDrawableRoutes])

  const setContainer = (node: HTMLDivElement | null) => {
    localContainerRef.current = node
    externalContainer?.(node)
  }

  return (
    <div
      ref={setContainer}
      className={className}
      role={externalContainer ? undefined : 'group'}
      aria-label={externalContainer ? undefined : ariaLabel}
    />
  )
}

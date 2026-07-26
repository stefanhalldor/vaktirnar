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
}

const EMPTY_ROUTE_POINTS: Array<{ lat: number; lon: number }> = []
const EMPTY_ROUTES: DriveRouteMapRoute[] = []
const EMPTY_STATIONS: DriveRouteMapStation[] = []

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
  const mapRef = useRef<import('maplibre-gl').Map | null>(null)
  const currentDrawableRoutes = useMemo<DriveRouteMapRoute[]>(() => (
    routes.length > 0
      ? routes.filter(route => route.points.length >= 2)
      : routePoints.length >= 2
        ? [{ id: 'primary', points: routePoints, color: DRIVE_MAP_ROUTE_COLOR }]
        : []
  ), [routePoints, routes])
  const routeStructureKey = currentDrawableRoutes.map(route => route.id).join('\u0000')
  const stationStructureKey = stations.map(station => (
    `${station.id}:${station.lat}:${station.lon}:${station.color}:${station.driveTimeLabel ?? ''}`
  )).join('\u0000')
  const drawableRoutesRef = useRef(currentDrawableRoutes)
  const stationsRef = useRef(stations)
  drawableRoutesRef.current = currentDrawableRoutes
  stationsRef.current = stations

  useEffect(() => {
    onSelectStationRef.current = onSelectStation
  }, [onSelectStation])

  useEffect(() => {
    onSelectRouteRef.current = onSelectRoute
  }, [onSelectRoute])

  useEffect(() => {
    const drawableRoutes = drawableRoutesRef.current
    const initialStations = stationsRef.current
    if (externalContainer || !localContainerRef.current || drawableRoutes.length === 0) return
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null
    const markers: import('maplibre-gl').Marker[] = []
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
          map!.on('click', hitLayerId, () => onSelectRouteRef.current?.(route.id))
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
            'left:-7px',
            'top:-7px',
            'width:14px',
            'height:14px',
            'border:3px solid white',
            'border-radius:999px',
            `background:${station.color}`,
            'box-shadow:0 1px 4px rgba(15,23,42,0.3)',
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
          markers.push(
            new maplibregl.Marker({ element, anchor: 'center' })
              .setLngLat([station.lon, station.lat])
              .addTo(map!),
          )
        }

        const bounds = new maplibregl.LngLatBounds()
        drawableRoutes.forEach(route => {
          route.points.forEach(point => bounds.extend([point.lon, point.lat]))
        })
        map.fitBounds(bounds, { padding: 18, duration: 0, maxZoom: 9 })
      })

      resizeObserver = new ResizeObserver(() => map?.resize())
      resizeObserver.observe(localContainerRef.current)
    })()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      markers.forEach(marker => marker.remove())
      map?.remove()
      if (mapRef.current === map) mapRef.current = null
    }
  }, [externalContainer, interactive, routeStructureKey, stationStructureKey])

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

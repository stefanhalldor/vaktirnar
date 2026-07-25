'use client'

import { useEffect, useRef } from 'react'
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
  routePoints = [],
  stations = [],
  onSelectStation,
  ariaLabel,
  className = 'h-[190px] w-full',
  externalContainer,
}: {
  routePoints?: Array<{ lat: number; lon: number }>
  stations?: DriveRouteMapStation[]
  onSelectStation?: (stationId: string) => void
  ariaLabel?: string
  className?: string
  externalContainer?: (node: HTMLDivElement | null) => void
}) {
  const localContainerRef = useRef<HTMLDivElement | null>(null)
  const onSelectStationRef = useRef(onSelectStation)

  useEffect(() => {
    onSelectStationRef.current = onSelectStation
  }, [onSelectStation])

  useEffect(() => {
    if (externalContainer || !localContainerRef.current || routePoints.length < 2) return
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
        center: [routePoints[0].lon, routePoints[0].lat],
        zoom: 6,
        attributionControl: false,
      })

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
        map.addSource('drive-route', { type: 'geojson', data: routeGeoJson(routePoints) })
        map.addLayer({
          id: 'drive-route',
          type: 'line',
          source: 'drive-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': DRIVE_MAP_ROUTE_COLOR,
            'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 8, 5, 11, 7] as unknown as number,
            'line-opacity': 0.86,
          },
        })

        for (const station of stations) {
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
        routePoints.forEach(point => bounds.extend([point.lon, point.lat]))
        map.fitBounds(bounds, { padding: 24, duration: 0, maxZoom: 9 })
      })

      resizeObserver = new ResizeObserver(() => map?.resize())
      resizeObserver.observe(localContainerRef.current)
    })()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      markers.forEach(marker => marker.remove())
      map?.remove()
    }
  }, [externalContainer, routePoints, stations])

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

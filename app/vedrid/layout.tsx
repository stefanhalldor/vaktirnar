// Loads MapLibre CSS for all public weather routes (/vedrid/*).
// viewportFit: cover ensures the map fills edge-to-edge on mobile devices
// with notches/home indicators.
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Viewport } from 'next'

export const viewport: Viewport = {
  viewportFit: 'cover',
}

export default function VedridLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

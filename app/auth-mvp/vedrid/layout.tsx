// Loads MapLibre CSS for all authenticated weather routes (/auth-mvp/vedrid/*),
// including road-map-prototype. viewportFit: cover ensures the map fills
// edge-to-edge on mobile devices with notches/home indicators.
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Viewport } from 'next'

export const viewport: Viewport = {
  viewportFit: 'cover',
}

export default function AuthVedridLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

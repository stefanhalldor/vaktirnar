// Route-level layout to load MapLibre CSS early, before the client component
// initializes the map. This ensures the CSS is applied when new Map() runs,
// preventing any potential canvas sizing issues from late CSS injection.
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Viewport } from 'next'

export const viewport: Viewport = {
  viewportFit: 'cover',
}

export default function RoadMapPrototypeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

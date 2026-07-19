'use client'

import { WeatherPulseInline } from '@/components/weather/WeatherPulseInline'

interface VedurstofanPulseInlineProps {
  stationId: string
  returnTo?: string
}

/** Thin Veðurstofan wrapper around the provider-neutral WeatherPulseInline. */
export function VedurstofanPulseInline({ stationId, returnTo }: VedurstofanPulseInlineProps) {
  return <WeatherPulseInline provider="vedurstofan" stationId={stationId} returnTo={returnTo} />
}

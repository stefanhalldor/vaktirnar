import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PublicWeatherMapCta } from '@/components/weather/RoadMapPrototypeMap'

describe('PublicWeatherMapCta', () => {
  it('renders the public forecast-data sign-in action with its return URL', () => {
    render(
      <PublicWeatherMapCta
        href="/innskraning?next=%2Fauth-mvp%2Fvedrid%3Fcontext%3Dweather%26view%3Dinformation"
        label="Skráðu þig inn til að búa til þitt veðurkort"
      />,
    )

    expect(screen.getByRole('link', {
      name: 'Skráðu þig inn til að búa til þitt veðurkort',
    })).toHaveAttribute(
      'href',
      '/innskraning?next=%2Fauth-mvp%2Fvedrid%3Fcontext%3Dweather%26view%3Dinformation',
    )
  })
})

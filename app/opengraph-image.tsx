import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Teskeið | Allt í Teskeið'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#fbf9f4',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        padding: '80px',
      }}
    >
      <div
        style={{
          fontSize: 80,
          fontWeight: 700,
          color: '#154212',
          letterSpacing: '-0.02em',
          marginBottom: 24,
        }}
      >
        Allt í Teskeið
      </div>
      <div
        style={{
          fontSize: 36,
          color: '#42493e',
          letterSpacing: '-0.01em',
        }}
      >
        Litlar lausnir fyrir lífið, á einum stað.
      </div>
    </div>,
    size,
  )
}

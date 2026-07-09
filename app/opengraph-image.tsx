import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Allt í Teskeið'
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
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <svg
        width={980}
        height={490}
        viewBox="0 -10 420 210"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Allt í Teskeið"
      >
        <g transform="rotate(7 210 95)">
          <path
            d="M 42 84 C 72 76, 128 78, 184 83 C 213 32, 280 15, 345 35 C 407 54, 420 105, 382 143 C 340 185, 260 184, 204 142 C 149 147, 89 143, 42 133 C 11 127, 11 91, 42 84 Z"
            fill="none"
            stroke="#154212"
            strokeWidth={14}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text
            x={112}
            y={111}
            fill="#154212"
            fontFamily="Inter, Geist, Arial, sans-serif"
            fontSize={16}
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            Allt í
          </text>
        </g>
        <text
          x={296}
          y={110}
          fill="#154212"
          fontFamily="Inter, Geist, Arial, sans-serif"
          fontSize={38}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          Teskeið.is
        </text>
      </svg>
    </div>,
    size,
  )
}

'use client'

import { useId } from 'react'
import {
  TESKEID_CREAM_DETAILS_PATH,
  TESKEID_GREEN_PATH,
  TESKEID_VIEWBOX,
} from './teskeidLogoPaths'

export interface TeskeidLogoProps {
  size?: number
  className?: string
  showBackground?: boolean
  decorative?: boolean
}

const WIDTH = 1200
const HEIGHT = 1223
const GREEN = '#245a31'
const CREAM = '#fbf8f1'

export function TeskeidLogo({
  size = 160,
  className,
  showBackground = true,
  decorative = false,
}: TeskeidLogoProps) {
  const titleId = `teskeid-title-${useId().replace(/:/g, '')}`
  const height = size * (HEIGHT / WIDTH)

  return (
    <svg
      width={size}
      height={height}
      viewBox={TESKEID_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-labelledby={decorative ? undefined : titleId}
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      {!decorative && <title id={titleId}>Teskeið.is logo</title>}
      {showBackground && <rect width={WIDTH} height={HEIGHT} fill={CREAM} />}
      <path d={TESKEID_GREEN_PATH} fill={GREEN} fillRule="evenodd" />
      <path d={TESKEID_CREAM_DETAILS_PATH} fill={CREAM} fillRule="evenodd" />
      {/* Erase A&10 vector holes; replace with Allt (small label) over 10 (dominant) */}
      {showBackground && <rect x={514} y={224} width={188} height={66} fill={CREAM} />}
      <text
        x={608}
        y={233}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Arial Black, Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontSize={18}
        fill={GREEN}
      >
        Allt
      </text>
      <text
        x={608}
        y={267}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Arial Black, Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontSize={44}
        fill={GREEN}
        letterSpacing="-1"
      >
        10
      </text>
    </svg>
  )
}

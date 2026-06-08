'use client'

import { useState } from 'react'
import Image, { type StaticImageData } from 'next/image'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'

interface CodexLogoOverlayProps {
  reference: StaticImageData
}

export function CodexLogoOverlay({ reference }: CodexLogoOverlayProps) {
  const [opacity, setOpacity] = useState(50)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-[#42493e]">1:1 overlay</h2>
        <label className="flex items-center gap-3 text-sm text-[#42493e]">
          Viðmið
          <input
            type="range"
            min="0"
            max="100"
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
            className="w-32 accent-[#154212]"
          />
          <span className="w-10 tabular-nums">{opacity}%</span>
        </label>
      </div>

      <div className="relative w-full max-w-[600px] aspect-[1200/1223] bg-white border border-black/10">
        <TeskeidLogo
          size={600}
          className="absolute inset-0 h-full w-full"
          decorative
        />
        <Image
          src={reference}
          alt="Endanleg viðmiðsmynd Teskeið lógós"
          fill
          sizes="(max-width: 640px) 100vw, 600px"
          className="object-contain"
          style={{ opacity: opacity / 100 }}
          priority
        />
      </div>
    </section>
  )
}

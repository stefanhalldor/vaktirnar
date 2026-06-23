import type { Metadata } from 'next'
import Image from 'next/image'
import { PreviewBanner } from '@/components/landing/PreviewBanner'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'
import referenceImg from '../../../../feedback/images/teskeid-final-logo-reference.png'
import { CodexLogoOverlay } from './CodexLogoOverlay'

export const metadata: Metadata = {
  title: 'Codex logo preview',
  robots: 'noindex',
}

const SIZES = [32, 48, 80, 160, 320] as const

export default function CodexTeskeidLogoPreviewPage() {
  return (
    <main className="min-h-screen bg-[#fbf9f4]">
      <PreviewBanner />

      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8">
        <div>
          <h1 className="text-xl font-semibold text-[#154212]">TeskeidLogo — Canonical production-component</h1>
          <p className="mt-1 text-sm text-[#72796e]">
            Samþykkt útgáfa. Byggt beint á 1200x1223 PNG-viðmiðinu.
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-[#42493e]">Stærðir</h2>
          <div className="flex flex-wrap items-end gap-6 border border-black/5 bg-white p-6">
            {SIZES.map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <TeskeidLogo size={size} />
                <span className="text-xs text-[#72796e]">{size}px</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-[#42493e]">Samanburður í sömu stærð</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <figure className="m-0 flex flex-col gap-2">
              <TeskeidLogo size={480} className="h-auto w-full" />
              <figcaption className="text-center text-xs text-[#72796e]">TeskeidLogo (canonical SVG)</figcaption>
            </figure>
            <figure className="m-0 flex flex-col gap-2">
              <Image
                src={referenceImg}
                alt="Endanleg viðmiðsmynd Teskeið lógós"
                width={1200}
                height={1223}
                className="h-auto w-full"
                priority
              />
              <figcaption className="text-center text-xs text-[#72796e]">Viðmiðsmynd</figcaption>
            </figure>
          </div>
        </section>

        <CodexLogoOverlay reference={referenceImg} />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-[#42493e]">Allt/10 — canonical derhúfa</h2>
          <p className="text-xs text-[#72796e]">
            TeskeidLogo sýnir Allt (hóflegt) yfir 10 (stórt, ríkjandi). Þetta er production-útgáfan.
          </p>
          <div className="flex flex-wrap items-end gap-6 border border-black/5 bg-white p-6">
            {([32, 48, 80, 160, 320] as const).map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <TeskeidLogo size={size} />
                <span className="text-xs text-[#72796e]">{size}px</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-[#42493e]">Transparent bakgrunnur</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex min-h-64 items-center justify-center bg-white p-6">
              <TeskeidLogo size={220} showBackground={false} />
            </div>
            <div className="flex min-h-64 items-center justify-center bg-[#58704f] p-6">
              <TeskeidLogo size={220} showBackground={false} />
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

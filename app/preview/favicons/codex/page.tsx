import type { Metadata } from 'next'
import Image from 'next/image'
import { PreviewBanner } from '@/components/landing/PreviewBanner'

export const metadata: Metadata = {
  title: 'Favicon preview',
  robots: 'noindex',
}

const options = [
  {
    name: 'Heilt lógó',
    file: 'full-badge.svg',
    note: 'Nákvæmasta vörumerkið, best frá 48 px og upp.',
  },
  {
    name: 'Andlit',
    file: 'face-badge.svg',
    note: 'Sterkasta almenna favicon-tillagan fyrir 24-64 px.',
  },
  {
    name: 'A&10 derhúfa (núverandi)',
    file: 'cap-mark.svg',
    note: 'Skýr merking í meðalstærð, en smáatriði tapast við 16 px.',
  },
  {
    name: '10,5 derhúfa (forskoðun — leturstafur)',
    file: 'cap-mark-10-5-preview.svg',
    note: 'Forskoðun á 10,5 merkingu með leturstaf. Þarf samþykki Stebba áður en framleiðsluleiðir eru uppfærðar með nýrri tilvísunarMynd.',
  },
  {
    name: 'Allt/10 derhúfa — stærra lógó/brand mark',
    file: 'cap-mark-allt-10-preview.svg',
    note: 'Canonical production lógó. Allt (hóflegt) yfir 10 (stórt, ríkjandi). Ekki ætlað sem favicon.',
  },
  {
    name: '10 derhúfa — favicon/app-icon (app/icon.svg)',
    file: 'cap-mark-10-only-preview.svg',
    note: 'Favicon-útgáfa. Bara 10, stórt og miðjað. Ekkert Allt — besta læsileiki í litlum stærðum.',
  },
  {
    name: 'Gleraugu og bros',
    file: 'glasses-smile.svg',
    note: 'Einfaldasta merkið og læsilegasta útgáfan við 16 px.',
  },
] as const

const sizes = [16, 24, 32, 48, 64] as const

export default function FaviconPreviewPage() {
  return (
    <main className="min-h-screen bg-[#fbf9f4]">
      <PreviewBanner />

      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8">
        <header>
          <h1 className="text-xl font-semibold text-[#154212]">
            Favicon-tilraunir
          </h1>
          <p className="mt-1 text-sm text-[#72796e]">
            Allar útgáfur eru klipptar beint úr samþykkta Teskeið-lógóinu.
          </p>
        </header>

        <div className="grid gap-5 md:grid-cols-2">
          {options.map((option) => (
            <section
              key={option.file}
              className="border border-black/10 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-[#154212]">{option.name}</h2>
                  <p className="mt-1 text-sm leading-5 text-[#72796e]">
                    {option.note}
                  </p>
                </div>
                <Image
                  src={`/favicon-options/${option.file}`}
                  alt=""
                  width={80}
                  height={80}
                  className="h-20 w-20 shrink-0"
                />
              </div>

              <div className="mt-6 flex min-h-20 items-end gap-5 border-t border-black/5 pt-4">
                {sizes.map((size) => (
                  <figure key={size} className="m-0 flex flex-col items-center gap-2">
                    <Image
                      src={`/favicon-options/${option.file}`}
                      alt={`${option.name}, ${size} pixlar`}
                      width={size}
                      height={size}
                      style={{ width: size, height: size }}
                    />
                    <figcaption className="text-[10px] text-[#72796e]">
                      {size}
                    </figcaption>
                  </figure>
                ))}
              </div>

              <p className="mt-4 font-mono text-xs text-[#72796e]">
                /favicon-options/{option.file}
              </p>
            </section>
          ))}
        </div>

        <section className="border border-black/10 bg-[#245a31] p-5 text-[#fbf8f1]">
          <h2 className="text-sm font-semibold">Vafraflipi, nálgun</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {options.map((option) => (
              <div
                key={option.file}
                className="flex h-9 min-w-40 items-center gap-2 bg-[#fbf8f1] px-3 text-xs text-[#42493e]"
              >
                <Image
                  src={`/favicon-options/${option.file}`}
                  alt=""
                  width={16}
                  height={16}
                  className="h-4 w-4"
                />
                Teskeið
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

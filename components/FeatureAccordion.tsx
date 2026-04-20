'use client'

import { useState, useRef } from 'react'
import { ChevronDown } from 'lucide-react'

interface Feature {
  title: string
  desc: string
}

interface FeatureAccordionProps {
  features: Feature[]
}

export function FeatureAccordion({ features }: FeatureAccordionProps) {
  const [openIndex, setOpenIndex] = useState(0)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  function toggle(index: number) {
    if (openIndex === index) return
    setOpenIndex(index)
    setTimeout(() => {
      itemRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  return (
    <div className="flex flex-col divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden bg-white">
      {features.map((feature, i) => {
        const isOpen = openIndex === i
        return (
          <div
            key={feature.title}
            ref={(el) => { itemRefs.current[i] = el }}
          >
            <button
              onClick={() => toggle(i)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            >
              <span className={`text-sm font-semibold ${isOpen ? 'text-gray-900' : 'text-gray-500'}`}>
                {feature.title}
              </span>
              <ChevronDown
                size={16}
                className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div className="px-5 pb-5">
                <p className="text-sm text-gray-500 leading-relaxed">{feature.desc}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

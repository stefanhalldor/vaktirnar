'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Lock, ArrowRight } from 'lucide-react'

interface VaktCardProps {
  name: string
  description: string
  status: 'available' | 'coming-soon'
  href?: string
  cta?: string
  index?: number
}

export function VaktCard({
  name,
  description,
  status,
  href,
  cta,
  index = 0,
}: VaktCardProps) {
  const isAvailable = status === 'available'

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 + index * 0.1, ease: 'easeOut' }}
      className={`relative rounded-2xl p-6 shadow-sm border transition-shadow ${
        isAvailable
          ? 'bg-white border-violet-100 hover:shadow-md'
          : 'bg-gray-50 border-gray-100 opacity-70'
      }`}
    >
      {/* Status badge */}
      <div className="flex items-center justify-between mb-4">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
            isAvailable
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-200 text-gray-500'
          }`}
        >
          {!isAvailable && <Lock size={10} />}
          {isAvailable ? '✓' : ''}
          {isAvailable ? 'Tilbúin' : 'Kemur fljótlega'}
        </span>
      </div>

      <h3
        className={`text-xl font-bold mb-2 ${
          isAvailable ? 'text-gray-900' : 'text-gray-500'
        }`}
      >
        {name}
      </h3>
      <p className="text-gray-500 text-sm leading-relaxed mb-4">
        {description}
      </p>

      {isAvailable && href && cta && (
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-600 hover:text-violet-800 transition-colors group"
        >
          {cta}
          <ArrowRight
            size={14}
            className="group-hover:translate-x-0.5 transition-transform"
          />
        </Link>
      )}
    </motion.div>
  )
}

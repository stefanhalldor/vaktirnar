'use client'

import { motion } from 'framer-motion'

interface HeroProps {
  title: string
  tagline: string
  description: string
}

export function Hero({ title, tagline, description }: HeroProps) {
  return (
    <section className="flex flex-col items-center text-center py-24 px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <h1 className="text-6xl md:text-8xl font-bold tracking-tight bg-gradient-to-r from-violet-600 via-purple-500 to-rose-500 bg-clip-text text-transparent mb-4">
          {title}
        </h1>
        <p className="text-2xl md:text-3xl font-semibold text-gray-700 mb-6">
          {tagline}
        </p>
        <p className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
          {description}
        </p>
      </motion.div>
    </section>
  )
}

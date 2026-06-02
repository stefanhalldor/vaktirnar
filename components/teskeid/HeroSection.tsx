interface HeroSectionProps {
  tagline: string
  description: string
  supportingLine: string
}

export function HeroSection({ tagline, description, supportingLine }: HeroSectionProps) {
  return (
    <section className="max-w-4xl mx-auto px-6 pt-12 pb-10">
      <h1 className="text-3xl font-medium text-gray-900 max-w-lg leading-snug mb-3">
        {tagline}
      </h1>
      <p className="text-sm text-gray-500 leading-relaxed max-w-md mb-4">{description}</p>
      <p className="text-sm font-medium text-gray-700 max-w-md">{supportingLine}</p>
    </section>
  )
}

interface HeroSectionProps {
  tagline: string
  description: string
  supportingLine: string
}

export function HeroSection({ tagline, description, supportingLine }: HeroSectionProps) {
  return (
    <section className="max-w-[768px] mx-auto px-5 pt-8 pb-8 text-center">
      <h2 className="text-[32px] leading-[40px] font-semibold tracking-[-0.02em] text-[#154212] mb-3 max-w-[500px] mx-auto">
        {tagline}
      </h2>
      <p className="text-lg leading-[28px] text-[#42493e] max-w-[500px] mx-auto">
        {description.split('\n').map((line, i) => (
          <span key={i}>{i > 0 && <br />}{line}</span>
        ))}
        <br />
        <br />
        <span className="text-xl font-medium text-[#1b1c19]">{supportingLine}</span>
      </p>
    </section>
  )
}

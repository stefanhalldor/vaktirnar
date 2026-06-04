import { HeroExpandableText } from './HeroExpandableText'

interface HeroSectionProps {
  tagline: string
  shortIntro: string
  supportingLine: string
  expandLabel: string
  collapseLabel: string
  expandedDescription: string
}

export function HeroSection({
  tagline,
  shortIntro,
  supportingLine,
  expandLabel,
  collapseLabel,
  expandedDescription,
}: HeroSectionProps) {
  return (
    <section className="max-w-[768px] mx-auto px-5 pt-8 pb-6 text-center">
      <h2 className="text-[32px] leading-[40px] font-semibold tracking-[-0.02em] text-[#154212] mb-3 max-w-[500px] mx-auto">
        {tagline}
      </h2>
      <p className="text-lg leading-[28px] text-[#42493e] max-w-[500px] mx-auto">
        {shortIntro}
      </p>
      <p className="text-lg font-medium text-[#1b1c19] max-w-[500px] mx-auto mt-3">
        {supportingLine}
      </p>
      <div className="flex justify-center mt-4">
        <HeroExpandableText
          expandLabel={expandLabel}
          collapseLabel={collapseLabel}
          expandedDescription={expandedDescription}
        />
      </div>
    </section>
  )
}

import { HeroExpandableText } from './HeroExpandableText'

interface HeroSectionProps {
  supportingLine: string
  expandLabel: string
  collapseLabel: string
  expandedDescription: string
}

export function HeroSection({
  supportingLine,
  expandLabel,
  collapseLabel,
  expandedDescription,
}: HeroSectionProps) {
  return (
    <section className="max-w-[768px] mx-auto px-5 pt-8 pb-6 text-center">
      <h2 className="text-[32px] leading-[40px] font-semibold tracking-[-0.02em] text-[#154212] mb-4 max-w-[500px] mx-auto">
        {supportingLine}
      </h2>
      <div className="flex justify-center mt-0">
        <HeroExpandableText
          expandLabel={expandLabel}
          collapseLabel={collapseLabel}
          expandedDescription={expandedDescription}
        />
      </div>
    </section>
  )
}

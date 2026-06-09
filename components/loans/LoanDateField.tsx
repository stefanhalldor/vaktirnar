'use client'

import { useId } from 'react'
import { Calendar } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'

interface LoanDateFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  min?: string
  required?: boolean
}

export function LoanDateField({
  label,
  value,
  onChange,
  min,
  required,
}: LoanDateFieldProps) {
  const id = useId()
  const t = useTranslations('teskeid.loans')
  const locale = useLocale()

  function formatDate(iso: string): string {
    const [year, month, day] = iso.split('-').map(Number)
    if (locale === 'en') {
      return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    }
    return `${day}. ${t(`months.${month - 1}`)} ${year}`
  }

  function showPicker() {
    const el = document.getElementById(id) as HTMLInputElement | null
    if (el?.showPicker) try { el.showPicker() } catch {}
  }

  const hasValue = !!value

  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-[#42493e]">{label}</span>
      <div
        onClick={showPicker}
        className="relative h-10 w-full cursor-pointer rounded-xl border border-gray-200 px-3 flex items-center justify-between focus-within:border-[#2d5a27] focus-within:ring-2 focus-within:ring-[#2d5a27]/10"
      >
        <span className={`text-sm select-none ${hasValue ? 'text-[#1b1c19]' : 'text-[#72796e]'}`}>
          {hasValue ? formatDate(value) : t('datePlaceholder')}
        </span>
        <Calendar size={14} className="text-[#72796e] shrink-0" aria-hidden />
        <input
          id={id}
          type="date"
          value={value}
          min={min}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ fontSize: '16px' }}
        />
      </div>
    </label>
  )
}

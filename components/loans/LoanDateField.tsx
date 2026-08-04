'use client'

import { useTranslations } from 'next-intl'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'

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
  const t = useTranslations('teskeid.loans')

  return (
    <TeskeidDateField
      label={label}
      value={value}
      onChange={onChange}
      placeholder={t('datePlaceholder')}
      min={min}
      required={required}
    />
  )
}

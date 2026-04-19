'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Copy, Check } from 'lucide-react'

interface InviteCodeDisplayProps {
  code: string
  childName: string
}

export function InviteCodeDisplay({ code, childName }: InviteCodeDisplayProps) {
  const t = useTranslations('contacts')
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-2xl bg-violet-50 border border-violet-100 p-4">
      <p className="text-xs font-medium text-violet-600 mb-1">{childName} · {t('yourCode')}</p>
      <div className="flex items-center gap-3">
        <span className="flex-1 font-mono text-2xl font-bold tracking-widest text-gray-900">
          {code}
        </span>
        <button
          onClick={copyCode}
          className="rounded-xl p-2 text-violet-600 hover:bg-violet-100 transition-colors"
          title={t('copyCode')}
        >
          {copied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
        </button>
      </div>
      {copied && <p className="text-xs text-green-600 mt-1">{t('copied')}</p>}
    </div>
  )
}

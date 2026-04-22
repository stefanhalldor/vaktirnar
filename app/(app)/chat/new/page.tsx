'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'

interface Child {
  id: string
  name: string
  avatar_emoji?: string
}

interface ContactOption {
  contactId: string
  child: Child
  myChild: Child
}

export default function NewChatPage() {
  const t = useTranslations('chat')
  const router = useRouter()
  const [options, setOptions] = useState<ContactOption[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/contacts?accepted=true')
      .then((r) => r.json())
      .then(setOptions)
  }, [])

  async function startChat() {
    if (!selected) return
    setLoading(true)
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: selected }),
    })
    if (res.ok) {
      const { id } = await res.json()
      router.push(`/chat/${id}`)
    }
    setLoading(false)
  }

  return (
    <>
      <Header title={t('newChat')} backHref="/" />
      <div className="p-4 flex flex-col gap-4">
        <p className="text-sm text-gray-500">{t('selectContact')}</p>
        <div className="flex flex-col gap-2">
          {options.map((opt) => (
            <button
              key={opt.contactId}
              onClick={() => setSelected(opt.contactId)}
              className={`flex items-center gap-3 rounded-2xl p-3 border-2 text-left transition-colors ${
                selected === opt.contactId
                  ? 'border-violet-500 bg-violet-50'
                  : 'border-gray-100 bg-white hover:border-gray-200'
              }`}
            >
              <div className="flex -space-x-2">
                <Avatar emoji={opt.myChild?.avatar_emoji} name={opt.myChild?.name} size="sm" />
                <Avatar emoji={opt.child?.avatar_emoji} name={opt.child?.name} size="sm" className="ring-2 ring-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{opt.myChild?.name} & {opt.child?.name}</p>
              </div>
            </button>
          ))}
        </div>
        <Button onClick={startChat} loading={loading} disabled={!selected} size="lg">
          {t('startChat')}
        </Button>
      </div>
    </>
  )
}

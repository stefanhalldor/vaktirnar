'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export default function SettingsPage() {
  const t = useTranslations('settings')
  const tAuth = useTranslations('auth')
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [locale, setLocale] = useState('is')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
  const [canNotify, setCanNotify] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setDisplayName(user.user_metadata?.display_name ?? '')
        setPhone(user.user_metadata?.phone ?? '')
      }
    })
    const cookieLocale = document.cookie.split(';').find(c => c.trim().startsWith('locale='))?.split('=')?.[1]
    if (cookieLocale) setLocale(cookieLocale)

    // Check current push subscription state
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setCanNotify(true)
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription()
        setNotificationsEnabled(!!sub)
      })
    }
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.auth.updateUser({ data: { display_name: displayName, phone } })
    document.cookie = `locale=${locale};path=/;max-age=31536000`
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleToggleNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setNotifLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      if (notificationsEnabled) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          })
          await sub.unsubscribe()
        }
        setNotificationsEnabled(false)
      } else {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub),
        })
        setNotificationsEnabled(true)
      }
    } finally {
      setNotifLoading(false)
    }
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      <Header title={t('title')} />
      <div className="p-4 flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('profile')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <Input
                label={t('displayName')}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <Input
                label={t('phone')}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">{t('language')}</label>
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-base outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                >
                  <option value="is">Íslenska</option>
                  <option value="en">English</option>
                </select>
              </div>
              <Button type="submit" loading={saving} className="mt-2">
                {saved ? t('saved') : t('save')}
              </Button>
            </form>
          </CardContent>
        </Card>

        {canNotify && (
          <Card>
            <CardHeader>
              <CardTitle>{t('notifications')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant={notificationsEnabled ? 'secondary' : 'primary'}
                loading={notifLoading}
                onClick={handleToggleNotifications}
                className="w-full"
              >
                {notificationsEnabled ? '🔔 ' : '🔕 '}
                {t('enableNotifications')}
              </Button>
            </CardContent>
          </Card>
        )}

        <Button variant="ghost" onClick={handleLogout} className="text-red-600 hover:text-red-700 hover:bg-red-50">
          {tAuth('logout')}
        </Button>
      </div>
    </>
  )
}

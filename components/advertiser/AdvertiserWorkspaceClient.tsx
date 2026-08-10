'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type {
  AdvertiserBusinessProfileView,
  AdvertiserCreativeView,
  AdvertiserWorkspaceView,
} from '@/lib/advertiser/contracts'

export function AdvertiserWorkspaceClient() {
  const t = useTranslations('advertiser')
  const [profiles, setProfiles] = useState<AdvertiserBusinessProfileView[]>([])
  const [creatives, setCreatives] = useState<AdvertiserCreativeView[]>([])
  const [pending, setPending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileId, setProfileId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [placement, setPlacement] = useState<'public_quiz_lobby' | 'public_quiz_results'>('public_quiz_lobby')
  const [headline, setHeadline] = useState('')
  const [body, setBody] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [destinationUrl, setDestinationUrl] = useState('')
  const [editingProfile, setEditingProfile] = useState<AdvertiserBusinessProfileView | null>(null)
  const [editingCreative, setEditingCreative] = useState<AdvertiserCreativeView | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/auth-mvp/advertiser', { cache: 'no-store' })
      if (!response.ok) throw new Error('load')
      const data = await response.json() as AdvertiserWorkspaceView
      setProfiles(data.profiles); setCreatives(data.creatives)
      setProfileId(current => current || String(data.profiles[0]?.id ?? ''))
      setError(null)
    } catch { setError(t('loadError')) }
    finally { setLoaded(true) }
  }, [t])
  useEffect(() => { void load() }, [load])

  const mutate = async (payload: unknown) => {
    const response = await fetch('/api/auth-mvp/advertiser', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(response.status === 409 ? 'conflict' : 'invalid')
    await load()
  }

  const submitProfile = async (event: React.FormEvent) => {
    event.preventDefault(); if (pending) return
    setPending(true); setError(null)
    try {
      await mutate({
        action: 'upsertProfile', id: editingProfile?.id ?? null,
        expectedRevision: editingProfile?.revision ?? null,
        slug, displayName, description, websiteUrl,
      })
      setDisplayName(''); setSlug(''); setDescription(''); setWebsiteUrl('')
      setEditingProfile(null)
    } catch { setError(t('saveError')) } finally { setPending(false) }
  }
  const submitCreative = async (event: React.FormEvent) => {
    event.preventDefault(); if (pending || !profileId) return
    setPending(true); setError(null)
    try {
      await mutate({
        action: 'upsertCreative', profileId, id: editingCreative?.id ?? null,
        expectedRevision: editingCreative?.revision ?? null,
        placement, headline, body, ctaLabel, destinationUrl,
      })
      setHeadline(''); setBody(''); setCtaLabel(''); setDestinationUrl('')
      setEditingCreative(null)
    } catch { setError(t('unsafeOrInvalid')) } finally { setPending(false) }
  }

  if (!loaded) return <p role="status" className="text-sm text-muted-foreground">{t('loading')}</p>

  return <div className="grid gap-6">
    {error ? <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
    <section className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold text-primary">{t('businessProfiles')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('businessDescription')}</p><form onSubmit={submitProfile} className="mt-4 grid gap-3"><label className="grid gap-1 text-sm font-medium">{t('displayName')}<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={120} className="min-h-11 rounded-lg border border-border bg-background px-3 text-base" /></label><label className="grid gap-1 text-sm font-medium">{t('slug')}<input value={slug} onChange={event => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} maxLength={80} className="min-h-11 rounded-lg border border-border bg-background px-3 text-base" /></label><label className="grid gap-1 text-sm font-medium">{t('website')}<input type="url" value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="https://" className="min-h-11 rounded-lg border border-border bg-background px-3 text-base" /></label><label className="grid gap-1 text-sm font-medium">{t('description')}<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} className="min-h-24 rounded-lg border border-border bg-background p-3 text-base" /></label><div className="flex flex-wrap gap-2"><button disabled={pending || !displayName.trim() || !slug.trim()} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-45">{t(editingProfile ? 'saveChanges' : 'createProfile')}</button>{editingProfile ? <button type="button" onClick={() => { setEditingProfile(null); setDisplayName(''); setSlug(''); setDescription(''); setWebsiteUrl('') }} className="min-h-11 rounded-lg border border-border px-4 text-sm">{t('cancel')}</button> : null}</div></form>{profiles.length > 0 ? <ul className="mt-4 divide-y divide-border">{profiles.map(profile => <li key={profile.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span><strong>{profile.displayName}</strong><span className="ml-2 text-muted-foreground">/{profile.slug}</span></span><button type="button" onClick={() => { setEditingProfile(profile); setDisplayName(profile.displayName); setSlug(profile.slug); setDescription(profile.description ?? ''); setWebsiteUrl(profile.websiteUrl ?? '') }} className="min-h-10 rounded-lg border border-border px-3">{t('edit')}</button></li>)}</ul> : null}</section>
    <section className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold text-primary">{t(editingCreative ? 'editCreative' : 'newCreative')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('creativeDescription')}</p>{profiles.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">{t('profileFirst')}</p> : <form onSubmit={submitCreative} className="mt-4 grid gap-3"><label className="grid gap-1 text-sm font-medium">{t('profile')}<select value={profileId} onChange={event => setProfileId(event.target.value)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-base">{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">{t('placement')}<select value={placement} onChange={event => setPlacement(event.target.value as typeof placement)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-base"><option value="public_quiz_lobby">{t('lobby')}</option><option value="public_quiz_results">{t('results')}</option></select></label><label className="grid gap-1 text-sm font-medium">{t('headline')}<input value={headline} onChange={event => setHeadline(event.target.value)} maxLength={100} className="min-h-11 rounded-lg border border-border bg-background px-3 text-base" /></label><label className="grid gap-1 text-sm font-medium">{t('body')}<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={300} className="min-h-24 rounded-lg border border-border bg-background p-3 text-base" /></label><label className="grid gap-1 text-sm font-medium">{t('cta')}<input value={ctaLabel} onChange={event => setCtaLabel(event.target.value)} maxLength={40} className="min-h-11 rounded-lg border border-border bg-background px-3 text-base" /></label><label className="grid gap-1 text-sm font-medium">{t('destination')}<input type="url" value={destinationUrl} onChange={event => setDestinationUrl(event.target.value)} placeholder="https://" className="min-h-11 rounded-lg border border-border bg-background px-3 text-base" /></label><div className="flex flex-wrap gap-2"><button disabled={pending || !headline.trim() || !body.trim() || !ctaLabel.trim() || !destinationUrl.trim()} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-45">{t(editingCreative ? 'saveChanges' : 'saveDraft')}</button>{editingCreative ? <button type="button" onClick={() => { setEditingCreative(null); setHeadline(''); setBody(''); setCtaLabel(''); setDestinationUrl('') }} className="min-h-11 rounded-lg border border-border px-4 text-sm">{t('cancel')}</button> : null}</div></form>}</section>
    <section className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold text-primary">{t('creatives')}</h2>{creatives.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('noCreatives')}</p> : <ul className="mt-3 grid gap-3">{creatives.map(creative => <li key={creative.id} className="rounded-lg border border-border bg-background p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">{creative.headline}</h3><p className="text-xs text-muted-foreground">{t('creativeState', { review: t(`reviewStatus_${creative.reviewStatus}`), delivery: t(`deliveryStatus_${creative.deliveryStatus}`), revision: creative.revision })}</p></div><span className="rounded-full border border-border px-2 py-1 text-xs">{t(creative.placement === 'public_quiz_lobby' ? 'lobby' : 'results')}</span></div><p className="mt-2 text-sm">{creative.body}</p><div className="mt-3 flex flex-wrap gap-2">{creative.reviewStatus !== 'pending' ? <button type="button" disabled={pending} onClick={() => { setEditingCreative(creative); setProfileId(creative.businessProfileId); setPlacement(creative.placement); setHeadline(creative.headline); setBody(creative.body); setCtaLabel(creative.ctaLabel); setDestinationUrl(creative.destinationUrl); window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }} className="min-h-10 rounded-lg border border-border px-3 text-sm">{t('edit')}</button> : null}{['draft', 'changes_requested', 'rejected'].includes(creative.reviewStatus) ? <button disabled={pending} onClick={() => { setPending(true); void mutate({ action: 'transition', creativeId: creative.id, expectedRevision: creative.revision, transition: 'submit', idempotencyKey: crypto.randomUUID() }).catch(() => setError(t('saveError'))).finally(() => setPending(false)) }} className="min-h-10 rounded-lg bg-primary px-3 text-sm text-primary-foreground">{t('submitReview')}</button> : null}{creative.reviewStatus === 'approved' && creative.deliveryStatus === 'paused' ? <button disabled={pending} onClick={() => { setPending(true); void mutate({ action: 'transition', creativeId: creative.id, expectedRevision: creative.revision, transition: 'activate', idempotencyKey: crypto.randomUUID() }).catch(() => setError(t('saveError'))).finally(() => setPending(false)) }} className="min-h-10 rounded-lg bg-primary px-3 text-sm text-primary-foreground">{t('activate')}</button> : null}{creative.deliveryStatus === 'active' ? <button disabled={pending} onClick={() => { setPending(true); void mutate({ action: 'transition', creativeId: creative.id, expectedRevision: creative.revision, transition: 'pause', idempotencyKey: crypto.randomUUID() }).catch(() => setError(t('saveError'))).finally(() => setPending(false)) }} className="min-h-10 rounded-lg border border-border px-3 text-sm">{t('pause')}</button> : null}</div></li>)}</ul>}</section>
  </div>
}

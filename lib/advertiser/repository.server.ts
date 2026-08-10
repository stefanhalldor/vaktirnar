import 'server-only'

import { getAdmin } from '@/lib/supabase/admin'
import {
  AD_PLACEMENTS,
  type AdPlacement,
  type AdvertiserBusinessProfileView,
  type AdvertiserCreativeView,
  type AdvertiserDeliveryStatus,
  type AdvertiserReviewStatus,
  type AdvertiserReviewView,
  type AdvertiserSnapshot,
  type AdvertiserWorkspaceView,
  type PublicQuizAd,
} from './contracts'
import { advertiserDomain, normalizeSafeHttpsUrl } from './url'

type UnknownRow = Record<string, unknown>

const REVIEW_STATUSES = new Set<AdvertiserReviewStatus>([
  'draft',
  'pending',
  'approved',
  'changes_requested',
  'rejected',
])
const DELIVERY_STATUSES = new Set<AdvertiserDeliveryStatus>(['paused', 'active'])

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && text.length <= max ? text : null
}

function nullableText(value: unknown, max: number): string | null {
  if (value === null || value === undefined || value === '') return null
  return boundedText(value, max)
}

function parseSnapshot(value: unknown): AdvertiserSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as UnknownRow
  const placement = row.placement
  const destinationUrl = typeof row.destinationUrl === 'string'
    ? normalizeSafeHttpsUrl(row.destinationUrl)
    : null
  const advertiserName = boundedText(row.advertiserName, 120)
  const headline = boundedText(row.headline, 100)
  const body = boundedText(row.body, 300)
  const ctaLabel = boundedText(row.ctaLabel, 40)
  if (
    !AD_PLACEMENTS.includes(placement as AdPlacement)
    || !destinationUrl
    || !advertiserName
    || !headline
    || !body
    || !ctaLabel
  ) return null
  return {
    advertiserName,
    advertiserDomain: advertiserDomain(destinationUrl),
    placement: placement as AdPlacement,
    headline,
    body,
    ctaLabel,
    destinationUrl,
  }
}

function mapProfile(row: UnknownRow): AdvertiserBusinessProfileView | null {
  const id = boundedText(row.id, 64)
  const revision = Number(row.revision)
  const slug = boundedText(row.slug, 80)
  const displayName = boundedText(row.display_name, 120)
  const updatedAt = boundedText(row.updated_at, 64)
  const websiteUrl = row.website_url === null
    ? null
    : typeof row.website_url === 'string'
      ? normalizeSafeHttpsUrl(row.website_url)
      : null
  if (!id || !Number.isSafeInteger(revision) || revision < 1 || !slug || !displayName || !updatedAt) return null
  if (row.website_url !== null && !websiteUrl) return null
  return {
    id,
    revision,
    slug,
    displayName,
    description: nullableText(row.description, 500),
    websiteUrl,
    updatedAt,
  }
}

function mapCreative(row: UnknownRow): AdvertiserCreativeView | null {
  const id = boundedText(row.id, 64)
  const businessProfileId = boundedText(row.business_profile_id, 64)
  const revision = Number(row.revision)
  const placement = row.placement as AdPlacement
  const headline = boundedText(row.headline, 100)
  const body = boundedText(row.body, 300)
  const ctaLabel = boundedText(row.cta_label, 40)
  const destinationUrl = typeof row.destination_url === 'string'
    ? normalizeSafeHttpsUrl(row.destination_url)
    : null
  const reviewStatus = row.review_status as AdvertiserReviewStatus
  const deliveryStatus = row.delivery_status as AdvertiserDeliveryStatus
  const updatedAt = boundedText(row.updated_at, 64)
  if (
    !id
    || !businessProfileId
    || !Number.isSafeInteger(revision)
    || revision < 1
    || !AD_PLACEMENTS.includes(placement)
    || !headline
    || !body
    || !ctaLabel
    || !destinationUrl
    || !REVIEW_STATUSES.has(reviewStatus)
    || !DELIVERY_STATUSES.has(deliveryStatus)
    || !updatedAt
  ) return null
  return {
    id,
    businessProfileId,
    revision,
    placement,
    headline,
    body,
    ctaLabel,
    destinationUrl,
    reviewStatus,
    deliveryStatus,
    submittedAt: nullableText(row.submitted_at, 64),
    reviewNote: nullableText(row.review_note, 500),
    updatedAt,
  }
}

export async function loadAdvertiserWorkspace(spaceId: string): Promise<AdvertiserWorkspaceView> {
  const admin = getAdmin()
  const [profiles, creatives] = await Promise.all([
    admin
      .from('business_profiles')
      .select('id,revision,slug,display_name,description,website_url,updated_at')
      .eq('space_id', spaceId)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(200),
    admin
      .from('advertiser_creatives')
      .select('id,business_profile_id,revision,placement,headline,body,cta_label,destination_url,review_status,delivery_status,submitted_at,review_note,updated_at')
      .eq('space_id', spaceId)
      .order('updated_at', { ascending: false })
      .limit(200),
  ])
  if (profiles.error || creatives.error) throw new Error('advertiser_load_failed')
  return {
    profiles: ((profiles.data ?? []) as UnknownRow[]).flatMap(row => {
      const profile = mapProfile(row)
      return profile ? [profile] : []
    }),
    creatives: ((creatives.data ?? []) as UnknownRow[]).flatMap(row => {
      const creative = mapCreative(row)
      return creative ? [creative] : []
    }),
  }
}

export async function upsertBusinessProfile(actorId: string, spaceId: string, input: {
  id?: string | null
  expectedRevision?: number | null
  slug: string
  displayName: string
  description: string
  websiteUrl: string | null
}): Promise<void> {
  const { error } = await getAdmin().rpc('advertiser_upsert_business_profile', {
    p_actor_id: actorId,
    p_space_id: spaceId,
    p_profile_id: input.id ?? null,
    p_expected_revision: input.expectedRevision ?? null,
    p_slug: input.slug,
    p_display_name: input.displayName,
    p_description: input.description,
    p_website_url: input.websiteUrl,
  })
  if (error) throw new Error(error.message)
}

export async function upsertAdvertiserCreative(actorId: string, spaceId: string, input: {
  profileId: string
  id?: string | null
  expectedRevision?: number | null
  placement: AdPlacement
  headline: string
  body: string
  ctaLabel: string
  destinationUrl: string
}): Promise<void> {
  const { error } = await getAdmin().rpc('advertiser_upsert_creative', {
    p_actor_id: actorId,
    p_space_id: spaceId,
    p_profile_id: input.profileId,
    p_creative_id: input.id ?? null,
    p_expected_revision: input.expectedRevision ?? null,
    p_placement: input.placement,
    p_headline: input.headline,
    p_body: input.body,
    p_cta_label: input.ctaLabel,
    p_destination_url: input.destinationUrl,
  })
  if (error) throw new Error(error.message)
}

export async function transitionAdvertiserCreative(actorId: string, spaceId: string, input: {
  creativeId: string
  expectedRevision: number
  transition: 'submit' | 'activate' | 'pause'
  idempotencyKey: string
}): Promise<void> {
  const { error } = await getAdmin().rpc('advertiser_owner_transition', {
    p_actor_id: actorId,
    p_space_id: spaceId,
    p_creative_id: input.creativeId,
    p_expected_revision: input.expectedRevision,
    p_action: input.transition,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) throw new Error(error.message)
}

export async function loadPendingAdvertiserReviews(): Promise<AdvertiserReviewView[]> {
  const { data, error } = await getAdmin()
    .from('advertiser_creatives')
    .select('id,revision,review_status,delivery_status,submitted_at,submitted_snapshot,approved_snapshot')
    .or('review_status.eq.pending,delivery_status.eq.active')
    .order('submitted_at')
    .limit(200)
  if (error) throw new Error('advertiser_review_load_failed')
  return ((data ?? []) as UnknownRow[]).flatMap(row => {
    const reviewStatus = row.review_status as AdvertiserReviewStatus
    const deliveryStatus = row.delivery_status as AdvertiserDeliveryStatus
    const snapshot = parseSnapshot(reviewStatus === 'pending' ? row.submitted_snapshot : row.approved_snapshot)
    const id = boundedText(row.id, 64)
    const revision = Number(row.revision)
    if (
      !id
      || !Number.isSafeInteger(revision)
      || revision < 1
      || !REVIEW_STATUSES.has(reviewStatus)
      || !DELIVERY_STATUSES.has(deliveryStatus)
      || !snapshot
    ) return []
    return [{
      id,
      revision,
      reviewStatus,
      deliveryStatus,
      submittedAt: nullableText(row.submitted_at, 64),
      snapshot,
    }]
  })
}

export async function reviewAdvertiserCreative(reviewerId: string, input: {
  creativeId: string
  expectedRevision: number
  decision: 'approved' | 'changes_requested' | 'rejected' | 'pause'
  note: string
  idempotencyKey: string
}): Promise<void> {
  const { error } = await getAdmin().rpc('advertiser_admin_review', {
    p_reviewer_id: reviewerId,
    p_creative_id: input.creativeId,
    p_expected_revision: input.expectedRevision,
    p_decision: input.decision,
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) throw new Error(error.message)
}

export async function resolvePublicQuizAd(placement: AdPlacement): Promise<PublicQuizAd | null> {
  if (process.env.PUBLIC_QUIZ_ADS_ENABLED !== 'true') return null
  try {
    const { data, error } = await getAdmin().rpc('advertiser_resolve_public', { p_placement: placement })
    if (error) return null
    const snapshot = parseSnapshot(data)
    if (!snapshot || snapshot.placement !== placement) return null
    return { disclosure: 'Auglýsing', ...snapshot }
  } catch {
    // Advertising must remain fail-soft: a quiz never waits for or depends on it.
    return null
  }
}

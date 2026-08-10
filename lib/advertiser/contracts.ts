export const AD_PLACEMENTS = ['public_quiz_lobby', 'public_quiz_results'] as const
export type AdPlacement = (typeof AD_PLACEMENTS)[number]

export type AdvertiserReviewStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'changes_requested'
  | 'rejected'

export type AdvertiserDeliveryStatus = 'paused' | 'active'

export interface AdvertiserBusinessProfileView {
  id: string
  revision: number
  slug: string
  displayName: string
  description: string | null
  websiteUrl: string | null
  updatedAt: string
}

export interface AdvertiserCreativeView {
  id: string
  businessProfileId: string
  revision: number
  placement: AdPlacement
  headline: string
  body: string
  ctaLabel: string
  destinationUrl: string
  reviewStatus: AdvertiserReviewStatus
  deliveryStatus: AdvertiserDeliveryStatus
  submittedAt: string | null
  reviewNote: string | null
  updatedAt: string
}

export interface AdvertiserWorkspaceView {
  profiles: AdvertiserBusinessProfileView[]
  creatives: AdvertiserCreativeView[]
}

export interface AdvertiserSnapshot {
  advertiserName: string
  advertiserDomain: string
  placement: AdPlacement
  headline: string
  body: string
  ctaLabel: string
  destinationUrl: string
}

export interface AdvertiserReviewView {
  id: string
  revision: number
  reviewStatus: AdvertiserReviewStatus
  deliveryStatus: AdvertiserDeliveryStatus
  submittedAt: string | null
  snapshot: AdvertiserSnapshot
}

export interface PublicQuizAd extends AdvertiserSnapshot {
  disclosure: string
}

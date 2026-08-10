import { guardAdvertiserOwner } from '@/lib/advertiser/access.server'
export default async function AdvertiserLayout({ children }: { children: React.ReactNode }) { await guardAdvertiserOwner(); return children }

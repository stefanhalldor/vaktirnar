import { guardKvissCreator } from '@/lib/kviss/access.server'
export default async function KvissLayout({ children }: { children: React.ReactNode }) { await guardKvissCreator(); return children }

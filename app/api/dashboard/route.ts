import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server'
import { store } from '@/lib/store';
import { legacyGuard } from '@/lib/legacy/guard'
import { guardLegacyAccess } from '@/lib/legacy/access'

export async function GET() {
  const g = legacyGuard()
  if (g) return g

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ag = await guardLegacyAccess(user.id)
  if (ag) return ag

  try {
    const stats = await store.getDashboardStats();

    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch {
    console.error('[legacy/dashboard] fetch failed');
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 }
    );
  }
}

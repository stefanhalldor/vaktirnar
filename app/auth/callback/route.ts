import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Only relative paths are allowed to prevent open redirect.
function safeNext(raw: string | null): string {
  if (!raw) return '/'
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('://')) {
    return raw
  }
  return '/'
}

// Handles OAuth callbacks (email confirmation, password reset, Facebook linking).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  // Facebook linking callbacks have next pointing at minn-profill.
  // On failure, return there with an error param instead of /login.
  const isFacebookCallback = next.startsWith('/auth-mvp/minn-profill')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  if (isFacebookCallback) {
    return NextResponse.redirect(`${origin}/auth-mvp/minn-profill?facebook=error`)
  }
  return NextResponse.redirect(`${origin}/login`)
}

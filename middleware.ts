import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/s/',
  '/krakkavaktin',
  '/preview',
  '/hugmyndir',
  '/senda-hugmynd',
  '/innskraning',
  '/auth-mvp/innskraning',
  '/auth-mvp/nyr-adgangur',
  '/api/auth-mvp/request-code',
  '/api/auth-mvp/verify-code',
  '/api/votes',
  '/api/followers',
  '/api/submissions',
  '/api/analytics',
  '/api/teskeid/profile',
  '/admin/login',
  '/api/auth',
  '/api/sessions/',
]

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Feature flag: guard all /auth-mvp/* pages and /api/auth-mvp/* endpoints.
  // Must be checked before any auth logic — AUTH_MVP_ENABLED is server-only (no NEXT_PUBLIC_).
  const isAuthMvpPath = pathname.startsWith('/auth-mvp') || pathname.startsWith('/api/auth-mvp')
  if (isAuthMvpPath && process.env.AUTH_MVP_ENABLED !== 'true') {
    if (pathname.startsWith('/api/auth-mvp')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Feature flag: guard /auth-mvp/lanad-og-skilad and all sub-paths.
  // LOANS_ENABLED must be 'true' in addition to AUTH_MVP_ENABLED.
  // Redirects to / without revealing whether the feature exists.
  if (
    pathname.startsWith('/auth-mvp/lanad-og-skilad') &&
    process.env.LOANS_ENABLED !== 'true'
  ) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Feature flag: guard /stillingar/tengsl and all sub-paths.
  // TENGSL_ENABLED must be 'true'. Per-user gating is enforced in server guards.
  if (
    pathname.startsWith('/stillingar/tengsl') &&
    process.env.TENGSL_ENABLED !== 'true'
  ) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Feature flag: block all legacy Krakkavaktin routes when LEGACY_ENABLED is not 'true'.
  // Default-deny: the flag must be explicitly set to 'true' to allow legacy routes.
  // Segment-safe matching: /chat blocks /chat/new but not /chatty.
  if (process.env.LEGACY_ENABLED !== 'true') {
    const matchesLegacy = (prefixes: string[]) =>
      prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))

    const LEGACY_API_PREFIXES = [
      '/api/chats', '/api/children', '/api/contacts',
      '/api/dashboard', '/api/push', '/api/cron/cleanup-chats',
      '/api/sessions',
    ]
    if (matchesLegacy(LEGACY_API_PREFIXES)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const LEGACY_UI_PREFIXES = [
      '/home', '/children', '/chat', '/contacts', '/settings',
      '/login', '/signup', '/forgot-password', '/reset-password',
      '/dashboard',
      '/s',
    ]
    if (matchesLegacy(LEGACY_UI_PREFIXES)) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  // Canonicalize Teskeið login aliases → /innskraning.
  // Placed after feature-flag checks so a disabled AUTH_MVP flag takes priority
  // over the /auth-mvp/* aliases. decodeURIComponent covers percent-encoded
  // variants (/auth-mvp/innskr%C3%A1ning → /auth-mvp/innskráning).
  const decodedPathname = (() => {
    try { return decodeURIComponent(pathname) } catch { return pathname }
  })()
  if (
    decodedPathname === '/auth-mvp/innskraning' ||
    decodedPathname === '/auth-mvp/innskráning' ||
    decodedPathname === '/innskráning'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/innskraning'
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isRoot = pathname === '/'
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const isAuthCallback = pathname.startsWith('/auth/callback')

  // Landing page (/): public for guests, but authenticated users go to Teskeiðar.
  if (isRoot) {
    if (user && process.env.AUTH_MVP_ENABLED === 'true') {
      const url = request.nextUrl.clone()
      url.pathname = '/auth-mvp/heim'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Teskeið auth MVP hidden routes (only reachable when flag is on)
  if (!user && pathname.startsWith('/stillingar')) {
    const url = request.nextUrl.clone()
    url.pathname = '/innskraning'
    return NextResponse.redirect(url)
  }

  if (!user && pathname.startsWith('/auth-mvp/heim')) {
    const url = request.nextUrl.clone()
    url.pathname = '/innskraning'
    return NextResponse.redirect(url)
  }
  if (!user && pathname.startsWith('/auth-mvp/minn-profill')) {
    const url = request.nextUrl.clone()
    url.pathname = '/innskraning'
    return NextResponse.redirect(url)
  }
  if (!user && pathname.startsWith('/auth-mvp/lanad-og-skilad')) {
    const url = request.nextUrl.clone()
    url.pathname = '/innskraning'
    return NextResponse.redirect(url)
  }
  if (!user && !isPublic && !isAuthCallback) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isPublic && !isRoot) {
    // Redirect authenticated users away from auth pages to /home
    // Do NOT redirect away from /admin/login — user may need to sign out and re-login
    const authPaths = ['/login', '/signup', '/forgot-password', '/reset-password']
    if (authPaths.some((p) => pathname.startsWith(p))) {
      const url = request.nextUrl.clone()
      url.pathname = '/home'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

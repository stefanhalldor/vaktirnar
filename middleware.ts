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
  // Public Veðrið and Umönnun — handlers enforce their own flag and auth checks
  '/vedrid',
  '/umonnun',
  '/api/teskeid/weather/travel',
  '/api/teskeid/weather/saved-places',
]

// Dynamic preview routes — only the exact .../stations/{id}/preview suffix is public.
// Using regex instead of startsWith to prevent accidentally opening sub-paths or sibling routes
// added under the same prefix in the future.
const PREVIEW_PATH_PATTERNS = [
  // Public Veðurstofan station pulse preview — read-only, no thread creation, no auth required.
  /^\/api\/teskeid\/weather\/vedurpuls\/stations\/[^/]+\/preview$/,
  // Public Vegagerðin station pulse preview — same semantics.
  /^\/api\/teskeid\/weather\/vedurpuls\/vegagerdin\/stations\/[^/]+\/preview$/,
]

// Exact-match public paths — no prefix semantics.
// Use for routes where startsWith would unintentionally open sub-paths or variants.
const EXACT_PUBLIC_PATHS = new Set([
  // Cron — no browser session; route handler enforces CRON_SECRET bearer auth
  '/api/cron/warm-vedurstofan',
  '/api/cron/warm-vegagerdin',
  // Public Veðurstofan station overview — read-only cache; handler enforces own flag and access checks.
  // Exact-match only: /stations/foo and /stations-extra must not become public.
  '/api/teskeid/weather/vedurstofan/stations',
  // Public Vegagerðin current-measurements overview — read-only cache; handler enforces own flag and access checks.
  // Exact-match only: /current/foo must not become public.
  '/api/teskeid/weather/vegagerdin/current',
  // Public conditions feed preview — latest visible message per target, no auth, no write.
  // Exact-match only: sub-paths under /feed-preview must not become public without explicit review.
  '/api/teskeid/weather/vedurpuls/feed-preview',
  // Public route-scoped conditions preview — batch station messages for a given route.
  // Exact-match only. Route handler enforces WEATHER_ENABLED access and station validation.
  '/api/teskeid/weather/vedurpuls/route-preview',
  // Route-memory lookup — public read; provider station IDs are not individually sensitive.
  // Route handler strips restricted provider IDs when WEATHER_PROVIDER_*_ACCESS_REQUIRED is set.
  // Exact-match only: sub-paths under /route-memory must not become public without review.
  '/api/teskeid/weather/route-memory/lookup',
  // Route-memory place lists — public read; city labels are not sensitive.
  // Exact-match only: sub-paths must not become public without review.
  '/api/teskeid/weather/route-memory/places',
  '/api/teskeid/weather/route-memory/destinations',
  // Route-memory place-focus — returns endpoint station IDs for a place key; no coords required.
  '/api/teskeid/weather/route-memory/place-focus',
])

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
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || EXACT_PUBLIC_PATHS.has(pathname) || PREVIEW_PATH_PATTERNS.some(r => r.test(pathname))
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

  // Helper: redirect to /innskraning preserving the original path+query as ?next=.
  // resolveSafeLoginNext in the login page validates the value before use.
  function redirectToInnskraningWithNext(): NextResponse {
    const url = request.nextUrl.clone()
    const originalPathWithQuery = url.pathname + url.search
    url.pathname = '/innskraning'
    url.search = ''
    url.searchParams.set('next', originalPathWithQuery)
    return NextResponse.redirect(url)
  }

  // Teskeið auth MVP hidden routes (only reachable when flag is on)
  if (!user && pathname.startsWith('/stillingar')) {
    return redirectToInnskraningWithNext()
  }

  if (!user && (
    pathname.startsWith('/auth-mvp/heim') ||
    pathname.startsWith('/auth-mvp/minn-profill') ||
    pathname.startsWith('/auth-mvp/lanad-og-skilad')
  )) {
    return redirectToInnskraningWithNext()
  }

  if (!user && !isPublic && !isAuthCallback) {
    // API routes must return JSON — never redirect to a login page.
    // The route handlers enforce their own auth and feature access.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (pathname.startsWith('/auth-mvp/')) {
      // Preserve the original path+query as ?next= so the login page can redirect
      // back after authentication.
      return redirectToInnskraningWithNext()
    }
    // Teskeið legacy pages use /login (no next param threading needed).
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
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

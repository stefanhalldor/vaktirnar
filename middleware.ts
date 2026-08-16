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

// Public Kviss routes are segment-exact. Route handlers still enforce the
// feature switch, bounded input, rate limits and session capabilities.
const PUBLIC_KVISS_PATH_PATTERNS = [
  /^\/kviss(?:\/[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6})?$/i,
  /^\/api\/kviss\/public\/(?:lookup|join|session|answer|chat|ad)$/,
]

const BOOKING_ID_SEGMENT = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const BOOKING_SLUG_SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*'

// Only these exact customer-facing booking pages and handlers are public.
// Every booking-scoped handler still validates either the current capability
// session or an authenticated membership on every request.
const PUBLIC_BOOKING_PAGE_PATTERNS = [
  new RegExp(`^/bokanir/${BOOKING_SLUG_SEGMENT}$`, 'i'),
  new RegExp(`^/bokanir/${BOOKING_SLUG_SEGMENT}/fyrirspurn/${BOOKING_ID_SEGMENT}$`, 'i'),
]
const PUBLIC_BOOKING_API_PATTERNS = [
  /^\/api\/bookings\/public\/requests$/,
  new RegExp(`^/api/bookings/public/requests/${BOOKING_ID_SEGMENT}/exchange$`, 'i'),
  new RegExp(`^/api/bookings/requests/${BOOKING_ID_SEGMENT}$`, 'i'),
  new RegExp(`^/api/bookings/requests/${BOOKING_ID_SEGMENT}/actions$`, 'i'),
  new RegExp(`^/api/bookings/requests/${BOOKING_ID_SEGMENT}/messages$`, 'i'),
  new RegExp(`^/api/bookings/requests/${BOOKING_ID_SEGMENT}/read$`, 'i'),
]

const AGENT_BRIDGE_PATHS = new Set([
  // Provider-neutral local agent bridge. These exact routes do not use a
  // browser session; each handler enforces one-time pairing or a scoped bearer
  // token. Sibling paths remain private.
  '/api/agent-bridge/v1/pair',
  '/api/agent-bridge/v1/claim',
  '/api/agent-bridge/v1/heartbeat',
  '/api/agent-bridge/v1/complete',
  '/api/agent-bridge/v1/fail',
])

// Exact-match public paths — no prefix semantics.
// Use for routes where startsWith would unintentionally open sub-paths or variants.
const EXACT_PUBLIC_PATHS = new Set([
  ...AGENT_BRIDGE_PATHS,
  // Cron — no browser session; route handler enforces CRON_SECRET bearer auth
  '/api/cron/warm-vedurstofan',
  '/api/cron/warm-vegagerdin',
  '/api/cron/warm-metno-points',
  '/api/cron/refresh-road-graph',
  '/api/cron/refresh-hms-places',
  // Public Veðurstofan station overview — read-only cache; handler enforces own flag and access checks.
  // Exact-match only: /stations/foo and /stations-extra must not become public.
  '/api/teskeid/weather/vedurstofan/stations',
  // Public Vegagerðin current-measurements overview — read-only cache; handler enforces own flag and access checks.
  // Exact-match only: /current/foo must not become public.
  '/api/teskeid/weather/vegagerdin/current',
  // Public forecast comparison can fetch met.no only for canonical ROAD_MAP_PLACES.
  // Exact-match only; the handler does not accept arbitrary coordinates.
  '/api/teskeid/weather/metno/point',
  // Provider-neutral bounded history for the public comparison table. The
  // handler accepts only canonical station/place IDs and at most seven items.
  '/api/teskeid/weather/forecast-history',
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
  // Public weather route planning needs bounded place autocomplete. The exact
  // handler still enforces weather access, rate limits, query bounds and Icelandic coordinates.
  '/api/place/search',
  // Current-location labels use the private HMS directory. The exact handler
  // keeps GPS coordinates out of URL/access logs and enforces weather access.
  '/api/place/reverse-geocode',
  // Public weather road-intelligence reads. Middleware only lets these exact
  // routes reach their handlers; each handler still enforces WEATHER_ENABLED,
  // request validation, feature access, and upstream safety limits.
  '/api/teskeid/road-intelligence/station-markers',
  '/api/teskeid/road-intelligence/road-segments',
  '/api/teskeid/road-intelligence/road-surface',
  '/api/teskeid/road-intelligence/map-proxy',
  '/api/teskeid/road-intelligence/lmi-tile',
  // Road map prototype — publicly accessible; auth push happens inside the component when
  // users try to save their own weather map. Exact-match only.
  '/auth-mvp/vedrid/road-map-prototype',
])

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  const isPublicBookingPage = PUBLIC_BOOKING_PAGE_PATTERNS.some(pattern => pattern.test(pathname))
  const isPublicBookingApi = PUBLIC_BOOKING_API_PATTERNS.some(pattern => pattern.test(pathname))
  const isBookingCustomerPageNamespace = pathname === '/bokanir'
    || pathname.startsWith('/bokanir/')
  const isBookingProviderPage = pathname === '/auth-mvp/bokanir'
    || pathname.startsWith('/auth-mvp/bokanir/')
  const isBookingProviderApi = pathname === '/api/bookings/provider'
    || pathname.startsWith('/api/bookings/provider/')
  const isBookingPath = isPublicBookingPage
    || isPublicBookingApi
    || isBookingProviderPage
    || isBookingProviderApi

  // Never redirect a customer booking URL. A browser can inherit its
  // capability fragment across redirects, which would move the secret onto a
  // route where analytics may run. Unknown booking page shapes fail here;
  // exact public pages continue to their own fail-closed server resolver.
  if (isBookingCustomerPageNamespace && !isPublicBookingPage) {
    return new NextResponse(null, {
      status: 404,
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  }

  if (isBookingPath && process.env.BOOKINGS_ENABLED !== 'true') {
    if (isPublicBookingPage) {
      // The page resolver returns not-found while the feature is disabled.
      // Staying on /bokanir also keeps any #access fragment away from analytics.
      return NextResponse.next()
    }
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'not_found' },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  const isPublicKvissPath = PUBLIC_KVISS_PATH_PATTERNS.some(pattern => pattern.test(pathname))
  if (isPublicKvissPath && process.env.KVISS_ENABLED !== 'true') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'not_found' },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Feature flag: guard all /auth-mvp/* pages and /api/auth-mvp/* endpoints.
  // Must be checked before any auth logic — AUTH_MVP_ENABLED is server-only (no NEXT_PUBLIC_).
  const isAuthMvpPath = pathname.startsWith('/auth-mvp')
    || pathname.startsWith('/api/auth-mvp')
    || isBookingProviderApi
  if (isAuthMvpPath && process.env.AUTH_MVP_ENABLED !== 'true') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Agent collaboration has its own fail-closed rollout/emergency switch.
  // It must be independently removable without disabling the rest of Teskeið.
  const isAgentCollaborationPage = pathname === '/auth-mvp/samvinna'
    || pathname.startsWith('/auth-mvp/samvinna/')
  const isAgentCollaborationApi = pathname === '/api/auth-mvp/agent-collaboration'
    || pathname.startsWith('/api/auth-mvp/agent-collaboration/')
  if (
    (isAgentCollaborationPage || isAgentCollaborationApi)
    && process.env.AGENT_COLLABORATION_ENABLED !== 'true'
  ) {
    if (isAgentCollaborationApi) {
      return NextResponse.json(
        { error: 'not_found' },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (
    AGENT_BRIDGE_PATHS.has(pathname)
    && process.env.AGENT_COLLABORATION_ENABLED !== 'true'
  ) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
    )
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

  // Expenses private beta has an independent fail-closed global switch.
  // The per-user entitlement is rechecked in every server page/action.
  if (
    pathname.startsWith('/auth-mvp/utlagt-og-endurgreitt') &&
    process.env.EXPENSES_ENABLED !== 'true'
  ) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // The owner-private Events MVP has its own fail-closed global switch and is
  // also expense-backed. Server guards repeat both per-user entitlements.
  const isEventsPath = pathname === '/auth-mvp/vidburdir'
    || pathname.startsWith('/auth-mvp/vidburdir/')
  if (
    isEventsPath
    && (process.env.EVENTS_ENABLED !== 'true' || process.env.EXPENSES_ENABLED !== 'true')
  ) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Bókhaldið private beta has an independent, fail-closed global switch.
  // Its server layout/pages/actions additionally require the per-user row.
  const isBookkeepingPath = pathname === '/auth-mvp/bokhaldid'
    || pathname.startsWith('/auth-mvp/bokhaldid/')
  if (isBookkeepingPath && process.env.BOOKKEEPING_ENABLED !== 'true') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const isKvissCreatorPath = pathname === '/auth-mvp/kviss'
    || pathname.startsWith('/auth-mvp/kviss/')
    || pathname === '/api/auth-mvp/kviss'
    || pathname.startsWith('/api/auth-mvp/kviss/')
  if (isKvissCreatorPath && process.env.KVISS_ENABLED !== 'true') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'not_found' },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  const isAdvertiserPath = pathname === '/auth-mvp/auglysandi'
    || pathname.startsWith('/auth-mvp/auglysandi/')
    || pathname === '/api/auth-mvp/advertiser'
    || pathname.startsWith('/api/auth-mvp/advertiser/')
  if (isAdvertiserPath && process.env.ADVERTISER_ENABLED !== 'true') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'not_found' },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Feature flag: guard /stillingar/tengsl and all sub-paths.
  // TENGSL_ENABLED must be 'true'. Authentication is enforced below.
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
    || EXACT_PUBLIC_PATHS.has(pathname)
    || PREVIEW_PATH_PATTERNS.some(r => r.test(pathname))
    || PUBLIC_KVISS_PATH_PATTERNS.some(r => r.test(pathname))
    || isPublicBookingPage
    || isPublicBookingApi
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
    pathname.startsWith('/auth-mvp/lanad-og-skilad') ||
    pathname.startsWith('/auth-mvp/utlagt-og-endurgreitt') ||
    pathname === '/auth-mvp/vidburdir' ||
    pathname.startsWith('/auth-mvp/vidburdir/') ||
    pathname.startsWith('/auth-mvp/kviss') ||
    pathname.startsWith('/auth-mvp/auglysandi')
  )) {
    return redirectToInnskraningWithNext()
  }

  if (!user && !isPublic && !isAuthCallback) {
    // API routes must return JSON — never redirect to a login page.
    // The route handlers enforce their own auth and feature access.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        {
          status: 401,
          headers: {
            'Cache-Control': 'private, no-store',
            'Vary': 'Cookie',
            'X-Content-Type-Options': 'nosniff',
          },
        },
      )
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

  // Canonicalize authenticated users from public weather routes to the authenticated shell.
  // An authenticated user on /vedrid sees menuVariant="public" (public page always passes that),
  // which shows the wrong hamburger menu. Redirect them to /auth-mvp/vedrid so they get
  // menuVariant="authenticated" and the correct session-aware UI.
  // Query string is preserved so ?saveDefaults= and future route-selection params survive.
  // Only exact paths are canonicalized — /vedrid/* pulse sub-paths are not guaranteed to
  // have identical auth-mvp counterparts and are intentionally excluded.
  if (user && (pathname === '/vedrid' || pathname === '/vedrid/ferdalagid')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth-mvp' + pathname
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
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

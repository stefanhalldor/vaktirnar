import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/dashboard',
  '/s/',
  '/krakkavaktin',
  '/preview',
  '/hugmyndir',
  '/senda-hugmynd',
  '/innskraning',
  '/auth-mvp/innskraning',
  '/auth-mvp/nyr-adgangur',
  '/api/votes',
  '/api/followers',
  '/api/submissions',
  '/api/analytics',
  '/api/login-waitlist',
  '/api/teskeid/profile',
  '/admin/login',
  '/api/auth',
]

export async function middleware(request: NextRequest) {
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

  const pathname = request.nextUrl.pathname
  const isRoot = pathname === '/'
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const isAuthCallback = pathname.startsWith('/auth/callback')

  // Landing page (/) is always public
  if (isRoot) {
    // Authenticated users on / stay on / (landing page is accessible to all)
    return supabaseResponse
  }

  // Teskeið auth MVP hidden routes
  if (!user && pathname.startsWith('/auth-mvp/minn-profill')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth-mvp/innskraning'
    return NextResponse.redirect(url)
  }
  if (user && (pathname.startsWith('/auth-mvp/innskraning') || pathname.startsWith('/auth-mvp/nyr-adgangur'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth-mvp/minn-profill'
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

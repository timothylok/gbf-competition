import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// First line of defence for /admin. Pages and server actions re-check the session
// (including the password fingerprint) in lib/auth.ts, so this is never the only gate.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/admin/login') return NextResponse.next()

  const token = req.cookies.get('gbf_admin')?.value
  const secret = process.env.SESSION_SECRET
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] })
      const res = NextResponse.next()
      res.headers.set('Cache-Control', 'no-store')
      return res
    } catch {
      /* fall through to redirect */
    }
  }
  return NextResponse.redirect(new URL('/admin/login', req.url))
}

export const config = { matcher: ['/admin/:path*'] }

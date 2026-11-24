import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/scan', '/scans', '/profile', '/reports', '/threats', '/notifications', '/admin'];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has('ss_session');

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Deliberately no /login or /register -> /dashboard redirect here. A cookie being present
  // does not mean the session is still valid: it can be expired, revoked or belong to a
  // deleted account. Redirecting on presence alone, while the app layout sends unauthenticated
  // visitors back to /login, produced an infinite loop (ERR_TOO_MANY_REDIRECTS) that made both
  // sign-in and sign-up unusable. Those pages now validate the session with the API instead.

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)'],
};

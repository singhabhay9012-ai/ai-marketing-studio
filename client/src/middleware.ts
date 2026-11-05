import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, createNonce } from '@/lib/csp';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Sets a per-request nonce Content-Security-Policy. Next.js reads the nonce from the
 * request's CSP header and adds it to its own scripts during (dynamic) rendering.
 */
export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    apiUrl: API_URL,
    storageOrigin: process.env.NEXT_PUBLIC_STORAGE_ORIGIN,
    isDev: process.env.NODE_ENV === 'development',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Pages only: skip static assets, image optimisation and metadata files.
    {
      source: '/((?!_next/static|_next/image|favicon.ico|robots.txt).*)',
      // Only Next.js router (RSC) prefetches are skipped; they are not documents. Browser-level
      // document prefetches (Purpose: prefetch) still get the CSP, because they can become navigations.
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};

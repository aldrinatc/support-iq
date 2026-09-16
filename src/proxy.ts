import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Security Headers Middleware
 *
 * Adds security headers to all responses to protect against common vulnerabilities:
 * - XSS attacks
 * - Clickjacking
 * - MIME type sniffing
 * - Information leakage
 *
 * This middleware runs on all routes except static files and API routes
 * that need specific configurations.
 */
 
export function proxy(_request: NextRequest) {
  // Create response
  const response = NextResponse.next();

  // Security Headers
  // Prevents MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Prevents clickjacking attacks
  response.headers.set('X-Frame-Options', 'DENY');

  // Enables XSS filter in older browsers
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Controls referrer information
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Controls which features and APIs can be used
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  // Content Security Policy
  // Allows inline scripts and styles for Next.js, but restricts other sources
  const cspHeader = `
    default-src 'self';
    script-src https://clerk.digitalworkplace.ai 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' data: https: blob:;
    font-src 'self' data: https://fonts.gstatic.com;
    connect-src https://clerk.digitalworkplace.ai 'self' https://api.anthropic.com https://api.dicebear.com https://*.supabase.co wss://*.supabase.co https://vercel.live wss://*.pusher.com https://auzmor.app.n8n.cloud;
    frame-src 'self' https://vercel.live;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim();

  response.headers.set('Content-Security-Policy', cspHeader);

  // HSTS (HTTP Strict Transport Security) - Only in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  return response;
}

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

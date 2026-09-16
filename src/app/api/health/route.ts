import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import packageJson from '../../../../package.json';

/**
 * Health Check Endpoint
 *
 * Used by monitoring systems and load balancers to verify service health.
 * Checks application uptime, memory usage, and database connectivity.
 *
 * Database checks:
 * - Supabase JS (primary): Used for DSQ schema operations
 * - Prisma (optional): Used for NextAuth and legacy features
 *
 * Returns:
 * - 200 OK: Service is healthy
 * - 503 Service Unavailable: Service is unhealthy
 */
export async function GET() {
  const checks = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || 'development',
    version: packageJson.version,
    supabase: 'unknown' as 'connected' | 'disconnected' | 'not_configured',
    prisma: 'unknown' as 'connected' | 'disconnected' | 'not_configured',
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024), // MB
    },
  };

  let isHealthy = true;
  const messages: string[] = [];

  // A configured key is not proof of connectivity: issue a bounded, zero-row query.
  if (supabase) {
    try {
      const { error } = await supabase.from('projects').select('id').limit(0).abortSignal(AbortSignal.timeout(8000));
      if (error) throw new Error('Database API unavailable');
      checks.supabase = 'connected';
      messages.push('Supabase API connected');
    } catch {
      checks.supabase = 'disconnected';
      isHealthy = false;
      messages.push('Supabase API unavailable');
    }
  } else {
    checks.supabase = 'not_configured';
    isHealthy = false;
    messages.push('Supabase not configured');
  }

  // Check Prisma connection (optional - for NextAuth/legacy features)
  if (process.env.DATABASE_URL) {
    try {
      const { prisma } = await import('@/lib/prisma');
      await prisma.$queryRaw`SELECT 1`;
      checks.prisma = 'connected';
      messages.push('Prisma connected');
    } catch (error) {
      checks.prisma = 'disconnected';
      messages.push('Prisma disconnected');
      console.warn('[Health Check] Prisma connection failed (optional)', error instanceof Error ? error.name : 'unknown');
      // Prisma is optional - don't mark unhealthy
    }
  } else {
    checks.prisma = 'not_configured';
    messages.push('Prisma not configured (optional)');
  }

  if (isHealthy) {
    return NextResponse.json({
      status: 'healthy',
      checks,
      message: messages.join(', '),
    });
  } else {
    return NextResponse.json({
      status: 'unhealthy',
      checks,
      message: messages.join(', '),
    }, { status: 503 });
  }
}

// Allow health checks without authentication
export const dynamic = 'force-dynamic';
export const revalidate = 0;

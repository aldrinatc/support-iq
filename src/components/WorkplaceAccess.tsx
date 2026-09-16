"use client";
import { ClerkProvider, useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

function AccessCheck({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [message, setMessage] = useState('Checking workplace access…');
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    (async () => {
      try {
        const token = await getToken();
        const response = await fetch('/dsq/api/admin/access', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const result = await response.json();
        if (active) {
          setAccess(response.ok ? 'allowed' : 'denied');
          setMessage(result.error || 'Workplace access could not be verified.');
        }
      } catch { if (active) { setAccess('denied'); setMessage('Could not connect. Please reload to retry.'); } }
    })();
    return () => { active = false; };
  }, [isLoaded, isSignedIn, getToken]);
  if (isLoaded && isSignedIn && access === 'allowed') return children;
  return <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
    <h1 className="text-xl font-semibold">Digital Workplace</h1>
    <p role="status">{!isLoaded ? 'Loading your session…' : !isSignedIn ? 'Sign in to Digital Workplace to continue.' : message}</p>
    {isLoaded && !isSignedIn && <a className="underline" href="https://www.digitalworkplace.ai/sign-in">Sign in to Digital Workplace</a>}
    {access === 'denied' && <button className="rounded border px-4 py-2" onClick={() => window.location.reload()}>Retry</button>}
  </main>;
}
export default function WorkplaceAccess({ children }: { children: React.ReactNode }) {
  return <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} signInUrl="https://www.digitalworkplace.ai/sign-in"><AccessCheck>{children}</AccessCheck></ClerkProvider>;
}

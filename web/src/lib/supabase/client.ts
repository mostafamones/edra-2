import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import { failureFetch } from '@/modules/development/failures/browser'

import { authCookieOptions, isLegacyAuthCookie } from './cookie-policy'

import type { Database } from './database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: authCookieOptions(),
      // Development only: Developer mode's failure simulator.
      ...(process.env.NODE_ENV !== 'production' && { global: { fetch: failureFetch } }),
      cookies: {
        getAll: () => typeof document === 'undefined' ? [] : parseCookieHeader(document.cookie).map(({ name, value }) => ({ name, value: value ?? '' })),
        setAll(cookiesToSet) {
          for (const { name } of parseCookieHeader(document.cookie)) {
            if (isLegacyAuthCookie(name)) {
              document.cookie = serializeCookieHeader(name, '', { path: '/', maxAge: 0 });
              document.cookie = serializeCookieHeader(name, '', { ...authCookieOptions(), maxAge: 0 });
            }
          }
          cookiesToSet.forEach(({ name, value, options }) => {
            document.cookie = serializeCookieHeader(name, value, options);
          });
        },
      },
    }
  )
}

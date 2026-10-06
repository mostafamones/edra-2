import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import { authCookieOptions, isLegacyAuthCookie } from './cookie-policy'

import type { Database } from './database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: authCookieOptions(),
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

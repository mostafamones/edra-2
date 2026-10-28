import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { failureFetch } from '@/modules/development/failures/inject'

import { authCookieOptions } from './cookie-policy'

import type { Database } from './database.types'

/**
 * If using Fluid compute: Don't put this client in a global variable. Always create a new client within each
 * function when using it.
 */
export async function createClient() {
  const cookieStore = await cookies()
  // Development only: Developer mode's failure simulator; undefined everywhere else.
  const simulated = await failureFetch(cookieStore)

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: authCookieOptions(),
      ...(simulated && { global: { fetch: simulated } }),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

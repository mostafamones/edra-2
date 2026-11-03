import { publicEnv } from "@/lib/env/public";
import { createServerClient } from '@supabase/ssr'
import { cookies } from '@/lib/server/request'

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
    publicEnv.supabaseUrl!,
    publicEnv.supabasePublishableKey!,
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

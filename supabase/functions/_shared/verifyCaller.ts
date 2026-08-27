import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Cryptographically verified caller identity.
 *
 * Never decode a JWT payload by hand to decide who the caller is: an unsigned
 * string shaped like a JWT can claim any `sub` or `role`. Everything here is
 * either verified by Supabase auth (user tokens) or an exact comparison
 * against the real service-role key (server callers).
 */
export interface VerifiedCaller {
  /** True only when the bearer is byte-identical to SUPABASE_SERVICE_ROLE_KEY. */
  isService: boolean
  /** Verified auth user id, or null when there is no valid user session. */
  userId: string | null
  /** Verified auth user email, or null. */
  email: string | null
}

const EMPTY: VerifiedCaller = { isService: false, userId: null, email: null }

export function bearerFrom(req: Request): string {
  return (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
}

/**
 * Resolve the caller of an edge function request.
 *
 * Service identity is proven by presenting the service-role key itself.
 * User identity is proven by a signed token that Supabase auth accepts.
 */
export async function verifyCaller(req: Request): Promise<VerifiedCaller> {
  const bearer = bearerFrom(req)
  if (!bearer) return EMPTY

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (serviceKey && bearer === serviceKey) {
    return { isService: true, userId: null, email: null }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) return EMPTY

  try {
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client.auth.getUser()
    if (error || !data?.user) return EMPTY
    return {
      isService: false,
      userId: data.user.id,
      email: typeof data.user.email === 'string' ? data.user.email : null,
    }
  } catch {
    return EMPTY
  }
}

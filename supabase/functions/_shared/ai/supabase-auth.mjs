/** getUser(jwt) performs server verification; never trust decoded claims/getSession. */
export function createSupabaseAuthenticator({ createClient, url, publishableKey }) {
  return async (jwt, signal) => {
    const client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => globalThis.fetch(input, { ...init, signal }) },
    });
    const { data, error } = await client.auth.getUser(jwt);
    if (error || !data?.user || data.user.is_anonymous === true) return null;
    // Only verified ID crosses the boundary, never user metadata/email/JWT.
    return { id: data.user.id };
  };
}
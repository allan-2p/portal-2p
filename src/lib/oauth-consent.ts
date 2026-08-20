import { supabase } from "@/integrations/supabase/client";

export type OAuthDetails = {
  client?: { name?: string | null } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type Result = Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;

export type OAuthApi = {
  getAuthorizationDetails: (id: string) => Result;
  approveAuthorization: (id: string) => Result;
  denyAuthorization: (id: string) => Result;
};

export function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

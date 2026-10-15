import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getValidOutlookAccessToken } from "@/lib/outlook-token";


const TENANT = "common"; // multi-tenant + personal accounts
const SCOPES = "offline_access openid profile User.Read Mail.ReadWrite Calendars.ReadWrite Tasks.ReadWrite Group.Read.All";
const LOVABLE_PROJECT_ID = "0f679b02-63a6-46ee-ae66-8b953bfe9f15";

function getRedirectUri(origin: string) {
  try {
    const url = new URL(origin);

    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return `${url.origin}/api/public/outlook/callback`;
    }

    if (url.hostname.endsWith(".lovableproject.com")) {
      return `https://id-preview--${LOVABLE_PROJECT_ID}.lovable.app/api/public/outlook/callback`;
    }

    return `${url.origin}/api/public/outlook/callback`;
  } catch {
    return `https://id-preview--${LOVABLE_PROJECT_ID}.lovable.app/api/public/outlook/callback`;
  }
}

function authBase() {
  return `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
}

/** Step 1: returns the URL the browser should navigate to. */
export const getOutlookAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { origin: string }) => data)
  .handler(async ({ data, context }) => {
    const clientId = process.env.MS_CLIENT_ID;
    if (!clientId) throw new Error("MS_CLIENT_ID is not configured");

    const redirectUri = getRedirectUri(data.origin);

    // Create a state token in oauth_pending_states for CSRF protection.
    // The callback will look it up to attribute the connection to this user.
    const state = crypto.randomUUID();
    const { error: stateErr } = await supabaseAdmin
      .from("oauth_pending_states")
      .insert({
        state_token: state,
        user_id: context.userId,
        provider: "outlook",
      });
    if (stateErr) throw new Error(`Failed to create state token: ${stateErr.message}`);

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: SCOPES,
      state,
      prompt: "select_account",
    });

    return { url: `${authBase()}/authorize?${params.toString()}` };
  });

/** Returns connection status for the current user. */
export const getOutlookStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Record<string, never> | undefined) => data ?? {})
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("outlook_connections_safe")
      .select("email, display_name, last_sync_at, expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { connected: !!data, connection: data ?? null };
  });

/** Disconnect: drop tokens. */
export const disconnectOutlook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Record<string, never> | undefined) => data ?? {})
  .handler(async ({ context }) => {
    const { error } = await supabaseAdmin
      .from("outlook_connections")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { success: true };
  });

/** Test the Outlook connection by hitting /me on Graph. Refreshes token if needed. */
export const testOutlookConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Record<string, never> | undefined) => data ?? {})
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: conn } = await supabaseAdmin
      .from("outlook_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!conn) throw new Error("Outlook não está conectado");

    const accessToken = await getValidOutlookAccessToken(userId, conn);

    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Falha (HTTP ${res.status}): ${json?.error?.message ?? "erro"}`);
    return {
      ok: true,
      email: (json.mail ?? json.userPrincipalName) as string | undefined,
      name: json.displayName as string | undefined,
    };
  });

/** Sync calendar events from Outlook into meetings table. */
export const syncOutlookCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Record<string, never> | undefined) => data ?? {})
  .handler(async ({ context }) => {
    const { syncOutlookCalendar } = await import("@/lib/outlook-calendar-sync");
    return syncOutlookCalendar(context.userId);
  });

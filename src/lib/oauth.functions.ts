import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { randomToken } from "@/lib/oauth";

const IssueCodeInput = z.object({
  clientId: z.string().min(1).max(200),
  redirectUri: z.string().url(),
  codeChallenge: z.string().min(20).max(200),
  codeChallengeMethod: z.literal("S256"),
  scope: z.string().max(200).optional(),
});

export const issueOAuthAuthorizationCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof IssueCodeInput>) => IssueCodeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Validate client + redirect_uri
    const { data: client, error: clientErr } = await supabaseAdmin
      .from("oauth_clients")
      .select("id, redirect_uris")
      .eq("id", data.clientId)
      .maybeSingle();
    if (clientErr || !client) throw new Error("Cliente OAuth inválido");
    const uris = (client.redirect_uris as string[]) ?? [];
    if (!uris.includes(data.redirectUri)) throw new Error("redirect_uri não registrado");

    const code = randomToken(32);
    const { error: insErr } = await supabaseAdmin.from("oauth_auth_codes").insert({
      code,
      client_id: data.clientId,
      user_id: userId,
      redirect_uri: data.redirectUri,
      code_challenge: data.codeChallenge,
      code_challenge_method: data.codeChallengeMethod,
      scope: data.scope ?? "mcp",
    } as never);
    if (insErr) throw new Error(insErr.message);

    return { code };
  });

const GetClientInput = z.object({ clientId: z.string().min(1).max(200) });

export const getOAuthClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof GetClientInput>) => GetClientInput.parse(input))
  .handler(async ({ data }) => {
    const { data: client } = await supabaseAdmin
      .from("oauth_clients")
      .select("id, client_name")
      .eq("id", data.clientId)
      .maybeSingle();
    return client ? { id: client.id, name: client.client_name } : null;
  });

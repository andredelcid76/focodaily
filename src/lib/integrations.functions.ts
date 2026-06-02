import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const FIREFLIES_URL = "https://api.fireflies.ai/graphql";

// ------------- Status -------------
export const getIntegrationsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const [outlook, pipedrive, fireflies] = await Promise.all([
      supabaseAdmin
        .from("outlook_connections")
        .select("email,display_name,last_sync_at,updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("pipedrive_connections")
        .select("domain,last_sync_at,updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("fireflies_connections")
        .select("updated_at,last_sync_at")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    return {
      outlook: outlook.data
        ? {
            connected: true,
            email: outlook.data.email as string | null,
            display_name: outlook.data.display_name as string | null,
            last_sync_at: outlook.data.last_sync_at as string | null,
          }
        : { connected: false },
      pipedrive: pipedrive.data
        ? {
            connected: true,
            domain: pipedrive.data.domain as string,
            last_sync_at: pipedrive.data.last_sync_at as string | null,
          }
        : { connected: false },
      fireflies: fireflies.data
        ? {
            connected: true,
            updated_at: fireflies.data.updated_at as string,
          }
        : { connected: false },
    };
  });

// ------------- Pipedrive -------------
export const savePipedriveConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { domain: string; api_token: string }) =>
    z.object({
      domain: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-zA-Z0-9-]+$/, "Apenas letras, números e hífen"),
      api_token: z.string().min(10).max(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Validate by calling Pipedrive /users/me
    const r = await fetch(
      `https://${data.domain}.pipedrive.com/api/v1/users/me?api_token=${encodeURIComponent(data.api_token)}`,
    );
    if (!r.ok) {
      throw new Error(`Falha ao validar token Pipedrive (HTTP ${r.status}). Confira domínio e token.`);
    }
    const json = await r.json();
    if (!json?.data?.id) throw new Error("Token Pipedrive inválido");

    const { error } = await supabaseAdmin
      .from("pipedrive_connections")
      .upsert(
        {
          user_id: userId,
          domain: data.domain,
          api_token: data.api_token,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disconnectPipedrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("pipedrive_connections")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------- Fireflies -------------
export const saveFirefliesConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { api_key: string }) =>
    z.object({ api_key: z.string().min(10).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Validate the key with a tiny query
    const r = await fetch(FIREFLIES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.api_key}`,
      },
      body: JSON.stringify({ query: "{ users { user_id name } }" }),
    });
    if (!r.ok) {
      throw new Error(`Falha ao validar chave Fireflies (HTTP ${r.status}). Confira a API key.`);
    }
    const json = await r.json();
    if (json?.errors) {
      throw new Error(`Fireflies recusou a chave: ${JSON.stringify(json.errors).slice(0, 200)}`);
    }

    const { error } = await supabaseAdmin
      .from("fireflies_connections")
      .upsert(
        {
          user_id: userId,
          api_key: data.api_key,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disconnectFireflies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("fireflies_connections")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------- Test connections -------------
export const testPipedriveConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: conn } = await supabaseAdmin
      .from("pipedrive_connections")
      .select("domain,api_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (!conn) throw new Error("Pipedrive não está conectado");
    const r = await fetch(
      `https://${conn.domain}.pipedrive.com/api/v1/users/me?api_token=${encodeURIComponent(conn.api_token as string)}`,
    );
    if (!r.ok) throw new Error(`Falha (HTTP ${r.status}). Token pode estar inválido.`);
    const json = await r.json();
    if (!json?.data?.id) throw new Error("Resposta inesperada do Pipedrive");
    return {
      ok: true,
      name: json.data.name as string | undefined,
      email: json.data.email as string | undefined,
    };
  });

export const testFirefliesConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: conn } = await supabaseAdmin
      .from("fireflies_connections")
      .select("api_key")
      .eq("user_id", userId)
      .maybeSingle();
    if (!conn) throw new Error("Fireflies não está conectado");
    const r = await fetch(FIREFLIES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${conn.api_key}`,
      },
      body: JSON.stringify({ query: "{ users { user_id name email } }" }),
    });
    if (!r.ok) throw new Error(`Falha (HTTP ${r.status}). Chave pode estar inválida.`);
    const json = await r.json();
    if (json?.errors) throw new Error(`Fireflies recusou: ${JSON.stringify(json.errors).slice(0, 200)}`);
    const user = json?.data?.users?.[0];
    return {
      ok: true,
      name: user?.name as string | undefined,
      email: user?.email as string | undefined,
    };
  });

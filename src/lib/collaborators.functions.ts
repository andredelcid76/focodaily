import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type KnownCollaborator = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

/**
 * Lista todas as pessoas com quem o usuário já colabora (em qualquer projeto
 * ou equipe), independente do projeto atual. Serve como "catálogo global de
 * participantes" para incluir pessoas já conhecidas em novos projetos.
 */
export const listKnownCollaborators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const ids = new Set<string>();

    // Projetos que eu vejo (dono, membro ou via equipe) — RLS resolve o escopo.
    const { data: projects } = await supabase.from("projects").select("id,user_id,team_id");
    for (const p of projects ?? []) if (p.user_id) ids.add(p.user_id as string);

    const projectIds = (projects ?? []).map((p) => p.id as string);
    if (projectIds.length > 0) {
      const { data: members } = await supabase
        .from("project_members")
        .select("user_id")
        .in("project_id", projectIds);
      for (const m of members ?? []) ids.add(m.user_id as string);
    }

    // Equipes que eu vejo
    const { data: teams } = await supabase.from("teams").select("id,owner_id");
    for (const t of teams ?? []) if (t.owner_id) ids.add(t.owner_id as string);
    const teamIds = (teams ?? []).map((t) => t.id as string);
    if (teamIds.length > 0) {
      const { data: tms } = await supabase.from("team_members").select("user_id").in("team_id", teamIds);
      for (const m of tms ?? []) ids.add(m.user_id as string);
    }

    ids.add(userId);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id,display_name,email,avatar_url")
      .in("user_id", Array.from(ids));

    const people = ((profiles ?? []) as KnownCollaborator[]).sort((a, b) => {
      const an = (a.display_name ?? a.email ?? "").toLowerCase();
      const bn = (b.display_name ?? b.email ?? "").toLowerCase();
      return an.localeCompare(bn, "pt-BR");
    });

    return { people, me: userId };
  });

/**
 * Adiciona participantes já conhecidos (que possuem conta) diretamente a um
 * projeto, sem passar por convite por e-mail.
 */
export const addProjectMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string; user_ids: string[]; role?: "member" | "manager" | "admin" }) =>
    z
      .object({
        project_id: z.string().uuid(),
        user_ids: z.array(z.string().uuid()).max(50),
        role: z.enum(["member", "manager", "admin"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_project_admin", {
      _project_id: data.project_id,
      _user_id: userId,
    });
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("Apenas o líder ou administradores podem adicionar participantes.");

    const role = data.role ?? "member";
    const targets = Array.from(new Set(data.user_ids)).filter((id) => id !== userId);
    if (targets.length === 0) return { added: 0 };

    const { error } = await supabase
      .from("project_members")
      .upsert(
        targets.map((uid) => ({ project_id: data.project_id, user_id: uid, role })),
        { onConflict: "project_id,user_id" },
      );
    if (error) throw new Error(error.message);

    const { data: project } = await supabase
      .from("projects")
      .select("name")
      .eq("id", data.project_id)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("notifications").insert(
      targets.map((uid) => ({
        user_id: uid,
        type: "project_access",
        title: "Você foi incluído em um projeto",
        body: `Agora você participa de "${project?.name ?? "um projeto"}".`,
        project_id: data.project_id,
        actor_id: userId,
        link: `/projetos/${data.project_id}`,
      })),
    );

    return { added: targets.length };
  });

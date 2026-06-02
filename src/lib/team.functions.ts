import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ============================================================
// List members of a project (owner + members)
// ============================================================
export const listProjectMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS will ensure user can see this project
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, user_id, team_id")
      .eq("id", data.project_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Projeto não encontrado");

    const { data: members } = await supabase
      .from("project_members")
      .select("user_id, role, created_at")
      .eq("project_id", data.project_id);

    // Always include the owner
    const memberIds = new Set<string>([project.user_id]);
    (members ?? []).forEach((m) => memberIds.add(m.user_id));

    // If project belongs to a team, include team owner + members too
    if ((project as any).team_id) {
      const teamId = (project as any).team_id as string;
      const { data: team } = await supabase
        .from("teams")
        .select("owner_id")
        .eq("id", teamId)
        .maybeSingle();
      if (team?.owner_id) memberIds.add(team.owner_id);
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId);
      (teamMembers ?? []).forEach((m) => memberIds.add(m.user_id));
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, display_name, avatar_url")
      .in("user_id", Array.from(memberIds));

    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    const memberList = Array.from(memberIds).map((uid) => {
      const profile = profileMap.get(uid);
      const isOwner = uid === project.user_id;
      return {
        user_id: uid,
        email: profile?.email ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        role: (isOwner ? "owner" : "member") as "owner" | "member",
        is_me: uid === userId,
      };
    });

    // Pending invites (only visible to owner via RLS)
    const { data: invites } = await supabase
      .from("project_invites")
      .select("id, email, expires_at, created_at")
      .eq("project_id", data.project_id)
      .is("accepted_at", null);

    return {
      members: memberList,
      pending_invites: invites ?? [],
      is_owner: project.user_id === userId,
    };
  });

// ============================================================
// Invite by email
// ============================================================
export const inviteToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        project_id: z.string().uuid(),
        email: z.string().email().max(255),
        origin: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Check ownership
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("id, user_id, name")
      .eq("id", data.project_id)
      .maybeSingle();
    if (!project) throw new Error("Projeto não encontrado");
    if (project.user_id !== userId) throw new Error("Apenas o dono pode convidar membros");

    const email = data.email.toLowerCase().trim();

    // Block inviting yourself
    const { data: myProfile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("user_id", userId)
      .maybeSingle();
    if (myProfile?.email?.toLowerCase() === email) {
      throw new Error("Você já é dono do projeto");
    }

    // If user already exists AND is already a member, no-op
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .ilike("email", email)
      .maybeSingle();

    if (existingProfile) {
      const { data: alreadyMember } = await supabaseAdmin
        .from("project_members")
        .select("user_id")
        .eq("project_id", data.project_id)
        .eq("user_id", existingProfile.user_id)
        .maybeSingle();
      if (alreadyMember) throw new Error("Esta pessoa já é membro do projeto");
    }

    // Generate token
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

    const { error } = await supabaseAdmin
      .from("project_invites")
      .upsert(
        {
          project_id: data.project_id,
          email,
          token,
          invited_by: userId,
          expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
          accepted_at: null,
          accepted_by: null,
        },
        { onConflict: "project_id,email" },
      );
    if (error) throw new Error(error.message);

    const inviteUrl = `${data.origin}/convite/${token}`;

    return {
      invite_url: inviteUrl,
      email,
      project_name: project.name,
    };
  });

// ============================================================
// Revoke a pending invite
// ============================================================
export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ invite_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("project_invites").delete().eq("id", data.invite_id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ============================================================
// Remove a member (owner removes someone; member leaves)
// ============================================================
export const removeProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        project_id: z.string().uuid(),
        user_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", data.project_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ============================================================
// Accept invite (token-based)
// ============================================================
export const acceptProjectInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().min(10).max(128) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: projectId, error } = await supabase.rpc("accept_project_invite", {
      _token: data.token,
    });
    if (error) throw new Error(error.message);
    return { project_id: projectId as string };
  });

// ============================================================
// Get invite preview (logged in or not — uses admin client)
// ============================================================
export const getInvitePreview = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string().min(10).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { data: invite } = await supabaseAdmin
      .from("project_invites")
      .select("project_id, email, expires_at, accepted_at, invited_by")
      .eq("token", data.token)
      .maybeSingle();

    if (!invite) return { valid: false as const, reason: "not_found" as const };
    if (invite.accepted_at) return { valid: false as const, reason: "accepted" as const };
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return { valid: false as const, reason: "expired" as const };
    }

    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("name, color, icon")
      .eq("id", invite.project_id)
      .maybeSingle();

    const { data: inviter } = await supabaseAdmin
      .from("profiles")
      .select("display_name, email")
      .eq("user_id", invite.invited_by)
      .maybeSingle();

    return {
      valid: true as const,
      email: invite.email,
      project_name: project?.name ?? "Projeto",
      project_color: project?.color ?? "#8b5cf6",
      inviter_name: inviter?.display_name ?? inviter?.email ?? "Alguém",
    };
  });

// ============================================================
// Assign / unassign a task
// ============================================================
export const assignTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        task_id: z.string().uuid(),
        assignee_id: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("tasks")
      .update({ assignee_id: data.assignee_id, updated_at: new Date().toISOString() })
      .eq("id", data.task_id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

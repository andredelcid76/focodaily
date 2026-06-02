import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ============================================================
// List teams the current user owns or is a member of
// ============================================================
export const listTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: owned }, { data: memberRows }] = await Promise.all([
      supabase.from("teams").select("*").eq("owner_id", userId),
      supabase.from("team_members").select("team_id").eq("user_id", userId),
    ]);

    const memberIds = (memberRows ?? []).map((r) => r.team_id);
    let memberTeams: any[] = [];
    if (memberIds.length > 0) {
      const { data } = await supabase
        .from("teams")
        .select("*")
        .in("id", memberIds);
      memberTeams = data ?? [];
    }

    // dedupe
    const map = new Map<string, any>();
    (owned ?? []).forEach((t) => map.set(t.id, { ...t, is_owner: true }));
    memberTeams.forEach((t) => {
      if (!map.has(t.id)) map.set(t.id, { ...t, is_owner: false });
    });

    return { teams: Array.from(map.values()) };
  });

// ============================================================
// Create a team
// ============================================================
export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().min(1).max(80),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        icon: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: team, error } = await supabase
      .from("teams")
      .insert({
        owner_id: userId,
        name: data.name,
        color: data.color ?? "#8b5cf6",
        icon: data.icon ?? "users",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { team };
  });

// ============================================================
// Update team (rename / color)
// ============================================================
export const updateTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        team_id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        icon: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, string> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.color !== undefined) patch.color = data.color;
    if (data.icon !== undefined) patch.icon = data.icon;
    const { error } = await supabase.from("teams").update(patch).eq("id", data.team_id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ============================================================
// Delete team
// ============================================================
export const deleteTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ team_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("teams").delete().eq("id", data.team_id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ============================================================
// Get a single team with members and pending invites and projects
// ============================================================
export const getTeamDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ team_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: team, error: tErr } = await supabase
      .from("teams")
      .select("*")
      .eq("id", data.team_id)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!team) throw new Error("Equipe não encontrada");

    const is_owner = team.owner_id === userId;

    // members
    const { data: rows } = await supabase
      .from("team_members")
      .select("user_id, role, created_at")
      .eq("team_id", data.team_id);

    const memberIds = new Set<string>([team.owner_id]);
    (rows ?? []).forEach((r) => memberIds.add(r.user_id));

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, display_name, avatar_url")
      .in("user_id", Array.from(memberIds));
    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    const members = Array.from(memberIds).map((uid) => {
      const profile = profileMap.get(uid);
      return {
        user_id: uid,
        email: profile?.email ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        role: (uid === team.owner_id ? "owner" : "member") as "owner" | "member",
        is_me: uid === userId,
      };
    });

    // invites (visible only to owner via RLS)
    const { data: invites } = await supabase
      .from("team_invites")
      .select("id, email, expires_at, created_at")
      .eq("team_id", data.team_id)
      .is("accepted_at", null);

    // projects assigned to this team
    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, color, icon, status")
      .eq("team_id", data.team_id)
      .order("created_at", { ascending: false });

    return {
      team,
      is_owner,
      members,
      pending_invites: invites ?? [],
      projects: projects ?? [],
    };
  });

// ============================================================
// Invite member by email
// ============================================================
export const inviteToTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        team_id: z.string().uuid(),
        email: z.string().email().max(255),
        origin: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("id, owner_id, name")
      .eq("id", data.team_id)
      .maybeSingle();
    if (!team) throw new Error("Equipe não encontrada");
    if (team.owner_id !== userId) throw new Error("Apenas o dono pode convidar membros");

    const email = data.email.toLowerCase().trim();

    const { data: myProfile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("user_id", userId)
      .maybeSingle();
    if (myProfile?.email?.toLowerCase() === email) {
      throw new Error("Você já é dono da equipe");
    }

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .ilike("email", email)
      .maybeSingle();

    if (existingProfile) {
      const { data: already } = await supabaseAdmin
        .from("team_members")
        .select("user_id")
        .eq("team_id", data.team_id)
        .eq("user_id", existingProfile.user_id)
        .maybeSingle();
      if (already) throw new Error("Esta pessoa já é membro da equipe");
    }

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

    const { error } = await supabaseAdmin
      .from("team_invites")
      .upsert(
        {
          team_id: data.team_id,
          email,
          token,
          invited_by: userId,
          expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
          accepted_at: null,
          accepted_by: null,
        },
        { onConflict: "team_id,email" },
      );
    if (error) throw new Error(error.message);

    return {
      invite_url: `${data.origin}/convite-equipe/${token}`,
      email,
      team_name: team.name,
    };
  });

// ============================================================
// Revoke invite
// ============================================================
export const revokeTeamInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ invite_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("team_invites").delete().eq("id", data.invite_id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ============================================================
// Remove member (owner removes / member leaves)
// ============================================================
export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        team_id: z.string().uuid(),
        user_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", data.team_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ============================================================
// Accept team invite (token)
// ============================================================
export const acceptTeamInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().min(10).max(128) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: teamId, error } = await supabase.rpc("accept_team_invite", {
      _token: data.token,
    });
    if (error) throw new Error(error.message);
    return { team_id: teamId as string };
  });

// ============================================================
// Preview team invite (no auth)
// ============================================================
export const getTeamInvitePreview = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string().min(10).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { data: invite } = await supabaseAdmin
      .from("team_invites")
      .select("team_id, email, expires_at, accepted_at, invited_by")
      .eq("token", data.token)
      .maybeSingle();

    if (!invite) return { valid: false as const, reason: "not_found" as const };
    if (invite.accepted_at) return { valid: false as const, reason: "accepted" as const };
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return { valid: false as const, reason: "expired" as const };
    }

    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("name, color, icon")
      .eq("id", invite.team_id)
      .maybeSingle();

    const { data: inviter } = await supabaseAdmin
      .from("profiles")
      .select("display_name, email")
      .eq("user_id", invite.invited_by)
      .maybeSingle();

    return {
      valid: true as const,
      email: invite.email,
      team_name: team?.name ?? "Equipe",
      team_color: team?.color ?? "#8b5cf6",
      inviter_name: inviter?.display_name ?? inviter?.email ?? "Alguém",
    };
  });

// ============================================================
// List members of a team (used by TaskDialog when project belongs to team)
// ============================================================
export const listTeamMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ team_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: team } = await supabase
      .from("teams")
      .select("owner_id")
      .eq("id", data.team_id)
      .maybeSingle();
    if (!team) return { members: [] };

    const { data: rows } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", data.team_id);

    const ids = new Set<string>([team.owner_id]);
    (rows ?? []).forEach((r) => ids.add(r.user_id));

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, display_name, avatar_url")
      .in("user_id", Array.from(ids));

    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    const members = Array.from(ids).map((uid) => {
      const profile = profileMap.get(uid);
      return {
        user_id: uid,
        email: profile?.email ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        role: (uid === team.owner_id ? "owner" : "member") as "owner" | "member",
        is_me: uid === userId,
      };
    });

    return { members };
  });

import { createServerFn } from "@tanstack/react-start";
import * as React from "react";
import { render } from "@react-email/components";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CollaborationNoticeEmail } from "@/lib/email-templates/collaboration-notice";

const SITE_NAME = "Foco";
const FROM_DOMAIN = "anpla.com.br";
const SENDER_DOMAIN = "notify.anpla.com.br";

async function enqueueCollaborationEmail(input: {
  to: string;
  label: string;
  subject: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}) {
  const messageId = crypto.randomUUID();

  try {
    const element = React.createElement(CollaborationNoticeEmail, {
      siteName: SITE_NAME,
      title: input.title,
      body: input.body,
      ctaLabel: input.ctaLabel,
      ctaUrl: input.ctaUrl,
    });

    const html = await render(element);
    const text = await render(element, { plainText: true });

    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: input.label,
      recipient_email: input.to,
      status: "pending",
    });

    const { error } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: input.to,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: input.subject,
        html,
        text,
        purpose: "transactional",
        label: input.label,
        idempotency_key: messageId,
        queued_at: new Date().toISOString(),
      },
    });

    if (error) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: input.label,
        recipient_email: input.to,
        status: "failed",
        error_message: error.message,
      });
    }
  } catch (error) {
    console.error("Failed to enqueue collaboration email", {
      label: input.label,
      to: input.to,
      error,
    });
  }
}

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

    const memberRoleMap = new Map(
      (members ?? []).map((m) => [m.user_id, (m.role ?? "member") as "owner" | "admin" | "manager" | "member"]),
    );
    const memberList = Array.from(memberIds).map((uid) => {
      const profile = profileMap.get(uid);
      const isOwner = uid === project.user_id;
      const role: "owner" | "admin" | "manager" | "member" = isOwner
        ? "owner"
        : (memberRoleMap.get(uid) ?? "member");
      return {
        user_id: uid,
        email: profile?.email ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        role,
        is_me: uid === userId,
      };
    });

    const { data: invites } = await supabase
      .from("project_invites")
      .select("id, email, expires_at, created_at, role")
      .eq("project_id", data.project_id)
      .is("accepted_at", null);

    const isOwner = project.user_id === userId;
    const myMembership = (members ?? []).find((m) => m.user_id === userId);
    const isAdmin = isOwner || myMembership?.role === "admin";

    return {
      members: memberList,
      pending_invites: invites ?? [],
      is_owner: isOwner,
      is_admin: isAdmin,
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
        role: z.enum(["admin", "manager", "member"]).default("member"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Check admin (owner or project admin)
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("id, user_id, name")
      .eq("id", data.project_id)
      .maybeSingle();
    if (!project) throw new Error("Projeto não encontrado");

    const { data: myMembership } = await supabaseAdmin
      .from("project_members")
      .select("role")
      .eq("project_id", data.project_id)
      .eq("user_id", userId)
      .maybeSingle();
    const isAdmin = project.user_id === userId || myMembership?.role === "admin";
    if (!isAdmin) throw new Error("Apenas o dono ou um admin pode convidar membros");

    const email = data.email.toLowerCase().trim();

    const { data: myProfile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("user_id", userId)
      .maybeSingle();
    if (myProfile?.email?.toLowerCase() === email) {
      throw new Error("Você já participa do projeto");
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
          role: data.role,
          invited_by: userId,
          expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
          accepted_at: null,
          accepted_by: null,
        },
        { onConflict: "project_id,email" },
      );
    if (error) throw new Error(error.message);

    const inviteUrl = `${data.origin}/convite/${token}`;

    if (existingProfile?.user_id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: existingProfile.user_id,
        type: "project_invite",
        title: "Você recebeu um convite para projeto",
        body: `Você foi convidado para participar de ${project.name}.`,
        project_id: data.project_id,
        actor_id: userId,
        link: `/convite/${token}`,
      });
    }

    await enqueueCollaborationEmail({
      to: email,
      label: "project_invite",
      subject: `Convite para o projeto ${project.name}`,
      title: `Você foi convidado para ${project.name}`,
      body: `Abra o convite para entrar no projeto ${project.name} no Foco.`,
      ctaLabel: "Abrir convite",
      ctaUrl: inviteUrl,
    });

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
// Update a member's role (admin-only)
// ============================================================
export const updateProjectMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        project_id: z.string().uuid(),
        user_id: z.string().uuid(),
        role: z.enum(["admin", "manager", "member"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("user_id")
      .eq("id", data.project_id)
      .maybeSingle();
    if (!project) throw new Error("Projeto não encontrado");
    const { data: myMembership } = await supabaseAdmin
      .from("project_members")
      .select("role")
      .eq("project_id", data.project_id)
      .eq("user_id", userId)
      .maybeSingle();
    const isAdmin = project.user_id === userId || myMembership?.role === "admin";
    if (!isAdmin) throw new Error("Apenas o dono ou um admin pode mudar papéis");
    if (data.user_id === project.user_id) throw new Error("O dono não tem papel editável");

    const { error } = await supabaseAdmin
      .from("project_members")
      .update({ role: data.role } as never)
      .eq("project_id", data.project_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ============================================================
// Transfer project leadership (current leader → another member)
// ============================================================
export const transferProjectLeadership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        project_id: z.string().uuid(),
        new_leader_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("id, user_id, name")
      .eq("id", data.project_id)
      .maybeSingle();
    if (!project) throw new Error("Projeto não encontrado");
    if (project.user_id !== userId) {
      throw new Error("Apenas o líder atual pode transferir a liderança");
    }
    if (project.user_id === data.new_leader_id) {
      throw new Error("Este usuário já é o líder do projeto");
    }

    // 1) Update the project owner (this is the "leader" in the new vocabulary).
    const { error: updErr } = await supabaseAdmin
      .from("projects")
      .update({ user_id: data.new_leader_id })
      .eq("id", data.project_id);
    if (updErr) throw new Error(updErr.message);

    // 2) Ensure ex-leader keeps full access as manager.
    await supabaseAdmin
      .from("project_members")
      .upsert(
        { project_id: data.project_id, user_id: userId, role: "manager" },
        { onConflict: "project_id,user_id" },
      );

    // 3) Remove any project_members row for the new leader (now they're the owner).
    await supabaseAdmin
      .from("project_members")
      .delete()
      .eq("project_id", data.project_id)
      .eq("user_id", data.new_leader_id);

    // 4) Notify the new leader.
    await supabaseAdmin.from("notifications").insert({
      user_id: data.new_leader_id,
      type: "project_leader_transfer",
      title: "Você agora é o líder do projeto",
      body: `Você recebeu a liderança do projeto ${project.name}.`,
      project_id: project.id,
      actor_id: userId,
      link: `/projetos/${project.id}`,
    });

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

export const notifyProjectTeamAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        project_id: z.string().uuid(),
        team_id: z.string().uuid(),
        origin: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const [{ data: project }, { data: team }, { data: actor }] = await Promise.all([
      supabaseAdmin.from("projects").select("id, name, user_id").eq("id", data.project_id).maybeSingle(),
      supabaseAdmin.from("teams").select("id, name, owner_id").eq("id", data.team_id).maybeSingle(),
      supabaseAdmin.from("profiles").select("display_name, email").eq("user_id", userId).maybeSingle(),
    ]);

    if (!project || !team) return { success: false };

    const { data: teamMembers } = await supabaseAdmin
      .from("team_members")
      .select("user_id")
      .eq("team_id", data.team_id);

    const recipientIds = Array.from(
      new Set([team.owner_id, ...(teamMembers ?? []).map((row) => row.user_id)]),
    ).filter((id) => id && id !== userId);

    if (recipientIds.length === 0) return { success: true };

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email")
      .in("user_id", recipientIds);

    const actorName = actor?.display_name ?? actor?.email ?? "Alguém";

    await Promise.all(
      (profiles ?? []).map(async (profile) => {
        await supabaseAdmin.from("notifications").insert({
          user_id: profile.user_id,
          type: "team_project_access",
          title: "Novo projeto compartilhado com sua equipe",
          body: `${actorName} compartilhou ${project.name} com a equipe ${team.name}.`,
          project_id: project.id,
          actor_id: userId,
          link: `/projetos/${project.id}`,
        });

        if (profile.email) {
          await enqueueCollaborationEmail({
            to: profile.email,
            label: "team_project_access",
            subject: `Novo projeto disponível: ${project.name}`,
            title: `${project.name} agora está com a sua equipe`,
            body: `${actorName} compartilhou o projeto ${project.name} com a equipe ${team.name}.`,
            ctaLabel: "Abrir projeto",
            ctaUrl: `${data.origin}/projetos/${project.id}`,
          });
        }
      }),
    );

    return { success: true };
  });

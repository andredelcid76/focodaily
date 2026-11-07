#!/usr/bin/env bash
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to an EMPTY disposable PostgreSQL database}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
CREATE TABLE projects(id uuid PRIMARY KEY,user_id uuid,members_can_reassign boolean DEFAULT true);
CREATE TABLE project_members(project_id uuid,user_id uuid,role text,UNIQUE(project_id,user_id));
CREATE TABLE team_members(team_id uuid,user_id uuid,role text,UNIQUE(team_id,user_id));
CREATE TABLE tasks(id uuid PRIMARY KEY,user_id uuid,project_id uuid,assignee_id uuid,title text);
CREATE TABLE profiles(user_id uuid PRIMARY KEY,email text);
CREATE TABLE contacts(owner_id uuid,contact_id uuid,UNIQUE(owner_id,contact_id));
CREATE TABLE contact_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),inviter_id uuid,email text,token text,expires_at timestamptz DEFAULT now()+interval '7 days',accepted_at timestamptz,accepted_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE project_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,invited_by uuid,email text,token text,role text DEFAULT 'member',expires_at timestamptz DEFAULT now()+interval '7 days',accepted_at timestamptz,accepted_by uuid);
CREATE TABLE team_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),team_id uuid,invited_by uuid,email text,token text,role text DEFAULT 'member',expires_at timestamptz DEFAULT now()+interval '7 days',accepted_at timestamptz,accepted_by uuid);
CREATE FUNCTION is_project_owner(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1 AND user_id=$2) $$;
CREATE FUNCTION is_project_member(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT is_project_owner($1,$2) OR EXISTS(SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2) $$;
CREATE FUNCTION is_project_manager_or_above(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT is_project_owner($1,$2) OR EXISTS(SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2 AND role IN ('manager','admin')) $$;
CREATE TABLE notifications(id uuid PRIMARY KEY,user_id uuid,type text,title text,created_at timestamptz DEFAULT now(),emailed_at timestamptz,teams_sent_at timestamptz,digest_pending boolean DEFAULT false,delivery_error text);
CREATE SCHEMA net;
CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE SCHEMA cron;
CREATE TABLE cron.job(jobid bigint,command text);
CREATE FUNCTION cron.alter_job(bigint, command text) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET command=$2 WHERE jobid=$1 $$;
SQL
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$root/drizzle/migrations/0016_security_phase1_ownership_invites_signup.sql"
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TRIGGER task_security_test BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION enforce_member_task_constraints();
SQL
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$root/drizzle/migrations/0017_security_phase1_cron_notification_claims.sql"
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$root/drizzle/migrations/0018_security_phase1_delivery_finalize.sql"
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$root/tests/database/security-phase1.sql"
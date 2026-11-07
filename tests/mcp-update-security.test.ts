import { expect, test, mock, beforeEach } from "bun:test";

const owner = "10000000-0000-0000-0000-000000000001";
const actor = "10000000-0000-0000-0000-000000000002";
const source = "20000000-0000-0000-0000-000000000001";
const destination = "20000000-0000-0000-0000-000000000002";
let current = { user_id: owner, assignee_id: actor, project_id: source };
let manager = false;
let canReassign = true;
let updated = false;
let updateFilter = "";
let projectLookup = "";
class Query {
  constructor(private table: string) {}
  private isUpdate = false;
  select() { return this; }
  eq(key: string, value: string) { if (this.table === "projects" && key === "id") projectLookup = value; return this; }
  or(value: string) { if (this.isUpdate) updateFilter = value; return this; }
  update() { this.isUpdate = true; updated = true; return this; }
  async maybeSingle() { return { data: this.table === "tasks" ? current : this.table === "projects" ? { members_can_reassign: canReassign } : { user_id: actor }, error: null }; }
  async single() { return { data: current, error: null }; }
}
const client = {
  from: (table: string) => new Query(table),
  rpc: async (name: string) => ({ data: name === "is_project_manager_or_above" ? manager : true, error: null }),
};
mock.module("../src/lib/mcp/supabase", () => ({ db: () => client, adminDb: () => client, getUserId: () => actor }));
mock.module("../src/integrations/supabase/client.server", () => ({ supabaseAdmin: client }));
const { updateTask } = await import("../src/lib/mcp/tools/index");
beforeEach(() => {
  current = { user_id: owner, assignee_id: actor, project_id: source };
  manager = false; canReassign = true; updated = false; updateFilter = ""; projectLookup = "";
});
const run = (args: Record<string, unknown>) => updateTask.execute(updateTask.parameters.parse({ id: "task", ...args }), { auth: {} });
test("assignee can reassign only when source project allows it and final UPDATE stays scoped", async () => {
  await run({ assignee_id: owner });
  expect(projectLookup).toBe(source);
  expect(updateFilter).toBe(`user_id.eq.${actor},assignee_id.eq.${actor}`);
});
test("assignee cannot reassign when disabled", async () => {
  canReassign = false;
  await expect(run({ assignee_id: owner })).rejects.toThrow("Apenas o dono");
  expect(updated).toBe(false);
});
test("assignee cannot move to own destination project", async () => {
  await expect(run({ project_id: destination })).rejects.toThrow("Somente o dono atual");
  expect(updated).toBe(false);
});
test("unrelated user is denied even if destination access exists", async () => {
  current.assignee_id = owner;
  await expect(run({ title: "unauthorized" })).rejects.toThrow("sem acesso");
  expect(updated).toBe(false);
});
test("manager final filter includes only source project, never destination", async () => {
  manager = true; current.assignee_id = owner;
  await run({ project_id: destination });
  expect(updateFilter).toBe(`user_id.eq.${actor},assignee_id.eq.${actor},project_id.eq.${source}`);
});
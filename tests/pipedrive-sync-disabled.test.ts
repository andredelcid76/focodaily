import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Regra do dono do app (18/11/2026): a rotina de 2 em 2 horas não puxa mais o Pipedrive para tarefas,
// mas continua sincronizando a agenda do Outlook.
const src = readFileSync("src/routes/api/public/sync/scan-all.ts", "utf8");
const code = src.replace(/^\s*\/\/.*$/gm, "");

describe("sync/scan-all", () => {
  test("não chama a sincronização Pipedrive → tarefas", () => {
    expect(code).not.toContain("syncPipedriveForUser");
    expect(code).not.toContain("pipedrive-sync.server");
  });
  test("continua sincronizando a agenda do Outlook", () => {
    expect(code).toContain("syncOutlookCalendar(userId)");
  });
});

import { expect, test } from "bun:test";
import { buildState, verifyState, outlookStateCookieHeader } from "../src/lib/oauth-state";

test("S8: the browser that started the flow passes", async () => {
  const { state, nonce } = await buildState();
  expect(await verifyState(state, nonce)).toBe(true);
});

test("S8: another browser's nonce or no cookie fails", async () => {
  const { state } = await buildState();
  expect(await verifyState(state, (await buildState()).nonce)).toBe(false);
  expect(await verifyState(state, undefined)).toBe(false);
});

test("S8: tampered or malformed state fails", async () => {
  const { state, nonce } = await buildState();
  const changedId = (state[0] === "a" ? "b" : "a") + state.slice(1);
  const changedHash = state.slice(0, -1) + (state.endsWith("A") ? "B" : "A");
  expect(await verifyState(changedId, nonce)).toBe(false);
  expect(await verifyState(changedHash, nonce)).toBe(false);
  expect(await verifyState("malformed", nonce)).toBe(false);
});

test("S8: cookie is httpOnly, Lax, callback-scoped and expires in 10 minutes", () => {
  expect(outlookStateCookieHeader("nonce")).toBe(
    "__Secure-outlook-state=nonce; HttpOnly; Secure; SameSite=Lax; Path=/api/public/outlook/callback; Max-Age=600",
  );
  expect(outlookStateCookieHeader("", 0)).toContain("Max-Age=0");
});

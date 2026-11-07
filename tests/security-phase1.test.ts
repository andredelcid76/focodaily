import { expect, test } from "bun:test";
import { internalReturnPath } from "../src/lib/internal-return-path";
import { cronSecretMatches } from "../src/lib/cron-auth.server";

test("login rejects network-path, external, backslash and control-character redirects", () => {
  for (const path of ["//site.com", "/\\site.com", "https://site.com", "/\n/site.com", "/%2e%2e//site.com"]) {
    expect(internalReturnPath(path, "https://focodaily.lovable.app")).toBe("/");
  }
});
test("login preserves internal invitation/consent parameters and fragments", () => {
  expect(internalReturnPath("/oauth/consent?client_id=abc#consent", "https://focodaily.lovable.app"))
    .toBe("/oauth/consent?client_id=abc#consent");
});
test("cron authorization requires the exact dedicated secret and fails closed when absent", () => {
  expect(cronSecretMatches("test-secret", "test-secret")).toBe(true);
  expect(cronSecretMatches("test-secreu", "test-secret")).toBe(false);
  expect(cronSecretMatches("short", "test-secret")).toBe(false);
  expect(cronSecretMatches(null, "test-secret")).toBe(false);
  expect(cronSecretMatches("test-secret", undefined)).toBe(false);
});
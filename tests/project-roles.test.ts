import { describe, expect, it } from "bun:test";
import { isSelfPromotion } from "../src/lib/project-roles";

describe("S11 project role self-promotion", () => {
  it("blocks a manager raising their own role to admin", () => {
    expect(isSelfPromotion("u1", "u1", "manager", "admin")).toBe(true);
  });
  it("blocks a member raising their own role to manager", () => {
    expect(isSelfPromotion("u1", "u1", "member", "manager")).toBe(true);
  });
  it("allows lowering your own role", () => {
    expect(isSelfPromotion("u1", "u1", "admin", "member")).toBe(false);
  });
  it("allows an admin promoting someone else", () => {
    expect(isSelfPromotion("u1", "u2", "member", "admin")).toBe(false);
  });
});

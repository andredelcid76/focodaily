import { expect, test } from "bun:test";
import { isTransientDeliveryError } from "../src/lib/notification-delivery-policy";
import { authError, socialAuthReturnUrl, RESTRICTED_SIGNUP } from "../src/lib/auth-errors";

test("only timeout, network, 429 and 5xx errors retry", () => {
  for (const error of ["teams:recipient_lookup_429", "teams:chat_create_503:Unavailable", "email:http_500:failed", "email:request timed out", new TypeError("fetch failed"), { message: "network error" }, { status: 408 }]) {
    expect(isTransientDeliveryError(error)).toBe(true);
  }
});
test("permanent recipients, suppression, configuration and validation never retry", () => {
  for (const error of ["teams:sender_without_microsoft_connection", "teams:recipient_lookup_404", "email:recipient_without_email", "email:recipient_suppressed", "email:http_422:invalid", "teams:message_send_400:validation", { status: 401 }, "email:disabled_by_user"]) {
    expect(isTransientDeliveryError(error)).toBe(false);
  }
});
test("social callbacks return to public auth with the intended internal destination", () => {
  const url = new URL(socialAuthReturnUrl("https://focodaily.lovable.app", "/projetos?view=list"));
  expect(url.pathname).toBe("/auth");
  expect(url.searchParams.get("next")).toBe("/projetos?view=list");
  expect(socialAuthReturnUrl("https://focodaily.lovable.app", "/")).toBe("https://focodaily.lovable.app/auth");
});
test("signup trigger rejection is classified for both broker error forms", () => {
  expect(authError("Database error saving new user")).toBe(RESTRICTED_SIGNUP);
  expect(authError("FOCO_SIGNUP_RESTRICTED")).toBe(RESTRICTED_SIGNUP);
  expect(authError("Invalid login credentials")).toBe("Invalid login credentials");
});
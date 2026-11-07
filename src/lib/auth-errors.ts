export const RESTRICTED_SIGNUP = "O Foco é restrito à equipe Anpla. Peça um convite.";
export function authError(message: string) {
  return /database error (?:saving new user|creating new user)|signup.*(disabled|not allowed)|anpla|foco_signup_restricted/i.test(message)
    ? RESTRICTED_SIGNUP : message;
}

/** The public auth screen must receive errors as well as successful social returns. */
export function socialAuthReturnUrl(origin: string, next: string) {
  const url = new URL("/auth", origin);
  if (next !== "/") url.searchParams.set("next", next);
  return url.href;
}
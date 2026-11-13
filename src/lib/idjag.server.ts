import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const IDJAG_ISSUER =
  process.env.IDJAG_ISSUER ?? "https://identity.anthropic.com/issuers/iss_2gjydw5j3xsvhpnxi2rkhn";
const IDJAG_JWKS_URI =
  process.env.IDJAG_JWKS_URI ??
  "https://identity.anthropic.com/issuers/iss_2gjydw5j3xsvhpnxi2rkhn/jwks.json";

const jwks = createRemoteJWKSet(new URL(IDJAG_JWKS_URI));

export type IdJagPayload = JWTPayload & {
  iss: string;
  sub: string;
  jti: string;
  exp: number;
  iat: number;
  client_id: string;
  email: string;
};

/** Verifies an ID-JAG (draft-ietf-oauth-identity-assertion-authz-grant). Throws on any failure. */
export async function verifyIdJag(
  assertion: string,
  expectedAudience: string,
  clientId: string,
): Promise<IdJagPayload> {
  const { payload } = await jwtVerify(assertion, jwks, {
    issuer: IDJAG_ISSUER,
    audience: expectedAudience,
    algorithms: ["ES256"],
    typ: "oauth-id-jag+jwt",
    clockTolerance: 60,
    requiredClaims: ["exp", "iat", "jti", "sub", "client_id", "email"],
  });
  if (payload.client_id !== clientId) {
    throw new Error("client_id claim mismatch");
  }
  return payload as IdJagPayload;
}

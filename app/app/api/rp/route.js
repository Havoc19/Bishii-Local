import { signRequest } from "@worldcoin/idkit/signing";
export const dynamic = "force-dynamic"; // sign a fresh nonce per request, never at build time

// Signs the World ID request on the server so the signing key never reaches the browser.
export async function GET() {
  const s = signRequest({ signingKeyHex: process.env.WORLD_SIGNING_KEY, action: process.env.NEXT_PUBLIC_WORLD_ACTION });
  return Response.json({
    rp_id: process.env.WORLD_RP_ID,
    nonce: s.nonce,
    created_at: s.createdAt,
    expires_at: s.expiresAt,
    signature: s.sig,
  });
}

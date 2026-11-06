import { createWalletClient, createPublicClient, http, isAddress, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hashSignal } from "@worldcoin/idkit/hashing";
import { BISHI_ABI } from "../../../lib/abi";

const chain = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID),
  name: "bishi",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC || "http://127.0.0.1:8545"] } },
};

// Verifies a World ID proof with World's API, then binds the human (nullifier) to the wallet on-chain.
export async function POST(req) {
  const { result, wallet } = await req.json();
  if (!isAddress(wallet)) return Response.json({ error: "bad wallet" }, { status: 400 });

  const expectedEnv = process.env.NEXT_PUBLIC_WORLD_ENV || "production";
  if (result?.environment !== expectedEnv) return Response.json({ error: "wrong environment" }, { status: 400 });
  // The proof's signal must be this wallet, so a proof can't be replayed for someone else's wallet.
  const item = result?.responses?.[0];
  console.log("[verify]", JSON.stringify({ wallet, protocol: result?.protocol_version, env: result?.environment, responses: (result?.responses || []).map((r) => ({ id: r.identifier, schema: r.issuer_schema_id, nullifier: String(r.nullifier).slice(0, 18) })) }));
  if (!item?.nullifier) return Response.json({ error: "no proof" }, { status: 400 });
  if (!item.signal_hash || BigInt(item.signal_hash) !== BigInt(hashSignal(wallet.toLowerCase())))
    return Response.json({ error: "proof is for a different wallet" }, { status: 400 });

  const r = await fetch(`https://developer.world.org/api/v4/verify/${process.env.WORLD_RP_ID}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return Response.json({ error: "World ID rejected", detail: body }, { status: 400 });

  const human = keccak256(toHex(item.nullifier)); // fixed action -> same human always gives the same nullifier
  const account = privateKeyToAccount(process.env.VERIFIER_PK);
  const wc = createWalletClient({ account, chain, transport: http() });
  const pc = createPublicClient({ chain, transport: http() });
  const hash = await wc.writeContract({
    address: process.env.NEXT_PUBLIC_BISHI,
    abi: BISHI_ABI,
    functionName: "registerHuman",
    args: [wallet, human],
  });
  await pc.waitForTransactionReceipt({ hash });
  return Response.json({ ok: true, human, credential: item.identifier, tx: hash });
}

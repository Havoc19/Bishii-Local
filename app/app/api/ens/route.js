import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createWalletClient, createPublicClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { BISHI_ABI } from "../../../lib/abi";

export const maxDuration = 60;
const run = promisify(execFile);
const LABEL = /^[a-z0-9-]{1,32}$/;
const ROOT = process.env.NEXT_PUBLIC_ENS_PARENT || "bishii.eth";
const ENS_CLI = path.join(process.cwd(), "node_modules", "@ensdomains", "cli", "dist", "ens.mjs");

// The ENS CLI (ENSv2 aware) builds calldata; we sign and send it on Sepolia with our ENS wallet.
async function ens(args) {
  const { stdout } = await run(process.execPath, [ENS_CLI, ...args, "--chain", "sepolia", "--format", "json"], {
    env: { ...process.env, ETH_RPC_URL: process.env.SEPOLIA_RPC },
  });
  return JSON.parse(stdout);
}

async function sendAll(calls) {
  const account = privateKeyToAccount(process.env.ENS_PK);
  const transport = http(process.env.SEPOLIA_RPC);
  const wc = createWalletClient({ account, chain: sepolia, transport });
  const pc = createPublicClient({ chain: sepolia, transport });
  let nonce = await pc.getTransactionCount({ address: account.address, blockTag: "pending" });
  const hashes = [];
  // Fixed gas + explicit nonces: later txs don't need earlier ones mined before sending.
  for (const c of calls) hashes.push(await wc.sendTransaction({ to: c.to, data: c.data, value: BigInt(c.value || 0), nonce: nonce++, gas: 900000n }));
  for (const h of hashes) {
    const r = await pc.waitForTransactionReceipt({ hash: h });
    if (r.status !== "success") throw new Error(`tx reverted ${h}`);
  }
  return hashes;
}

const bishi = createPublicClient({
  chain: { id: Number(process.env.NEXT_PUBLIC_CHAIN_ID), name: "bishi", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC || "http://127.0.0.1:8545"] } } },
  transport: http(),
});
const read = (functionName, args = []) => bishi.readContract({ address: process.env.NEXT_PUBLIC_BISHI, abi: BISHI_ABI, functionName, args });

// Only mirror what the contract says: a room's foreman gets the room name, a seated member gets a seat name.
async function allowed(label, roomLabel, owner) {
  const n = Number(await read("roomCount"));
  for (let i = 0; i < n; i++) {
    const r = await read("rooms", [BigInt(i)]);
    if (!roomLabel) {
      if (r[1] === label) return r[0].toLowerCase() === owner.toLowerCase();
    } else if (r[1] === roomLabel) {
      const seats = await read("getSeats", [BigInt(i)]);
      return seats.some((s) => s.member.toLowerCase() === owner.toLowerCase());
    }
  }
  return false;
}

// Room:  <label>.bishii.eth        held by the protocol (so it can issue seats), resolves to the foreman.
// Seat:  <label>.<room>.bishii.eth owned by the member, resolves to the member.
export async function POST(req) {
  const { label, parent, owner, texts = {} } = await req.json();
  if (!LABEL.test(label) || !isAddress(owner)) return Response.json({ error: "bad input" }, { status: 400 });
  const isSeat = parent && parent !== ROOT;
  if (isSeat && !(parent.endsWith("." + ROOT) && LABEL.test(parent.slice(0, -ROOT.length - 1)))) return Response.json({ error: "bad parent" }, { status: 400 });
  if (!(await allowed(label, isSeat ? parent.slice(0, -ROOT.length - 1) : null, owner))) return Response.json({ error: "not on-chain" }, { status: 403 });

  const name = `${label}.${isSeat ? parent : ROOT}`;
  try {
    const ensWallet = privateKeyToAccount(process.env.ENS_PK).address;
    const resolver = (await ens(["whois", ROOT])).resolver; // our resolver serves every bishii name
    const calls = [];
    if (isSeat) {
      calls.push(await ens(["subname", "create", name, "--owner", owner, "--resolver", resolver]));
    } else {
      const sub = await ens(["subregistry", "deploy", name, "--deployer", ensWallet]);
      if (!sub.alreadyDeployed) calls.push(sub);
      calls.push(await ens(["subname", "create", name, "--owner", ensWallet, "--resolver", resolver, "--subregistry", sub.subregistry]));
    }
    calls.push(await ens(["set", "address", name, "--address", owner, "--resolver", resolver]));
    for (const [key, value] of Object.entries(texts)) calls.push(await ens(["set", "text", name, "--key", key, "--value", String(value), "--resolver", resolver]));
    const txs = await sendAll(calls);
    return Response.json({ ok: true, name, txs });
  } catch (e) {
    return Response.json({ error: "ENS write failed", detail: String(e.stderr || e.shortMessage || e.message).slice(0, 300) }, { status: 500 });
  }
}

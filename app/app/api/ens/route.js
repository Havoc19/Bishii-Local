import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWalletClient, createPublicClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { BISHI_ABI } from "../../../lib/abi";

const run = promisify(execFile);
const LABEL = /^[a-z0-9-]{1,32}$/;

// The `ens` CLI (github.com/ensdomains/ens-cli) builds ENSv2 calldata; we sign and send it on Sepolia.
async function ensTx(args) {
  const { stdout } = await run("ens", [...args, "--chain", "sepolia", "--json"], {
    env: { ...process.env, ETH_RPC_URL: process.env.SEPOLIA_RPC },
  });
  const out = JSON.parse(stdout);
  const txs = Array.isArray(out) ? out : out.transactions || [out.transaction || out];
  const account = privateKeyToAccount(process.env.ENS_PK);
  const wc = createWalletClient({ account, chain: sepolia, transport: http(process.env.SEPOLIA_RPC) });
  const pc = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC) });
  const hashes = [];
  for (const t of txs) {
    const hash = await wc.sendTransaction({ to: t.to, data: t.data, value: BigInt(t.value || 0) });
    await pc.waitForTransactionReceipt({ hash });
    hashes.push(hash);
  }
  return hashes;
}

const bishi = createPublicClient({
  chain: { id: Number(process.env.NEXT_PUBLIC_CHAIN_ID), name: "bishi", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC || "http://127.0.0.1:8545"] } } },
  transport: http(),
});
const read = (functionName, args = []) => bishi.readContract({ address: process.env.NEXT_PUBLIC_BISHI, abi: BISHI_ABI, functionName, args });

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

// Creates <label>.<parent> pointing at `owner`, with text records (room rules, seat status, foreman record).
export async function POST(req) {
  const { label, parent, owner, texts = {} } = await req.json();
  const root = process.env.NEXT_PUBLIC_ENS_PARENT;
  if (!LABEL.test(label) || !isAddress(owner)) return Response.json({ error: "bad input" }, { status: 400 });
  if (parent && !(parent === root || parent.endsWith("." + root))) return Response.json({ error: "bad parent" }, { status: 400 });
  const name = `${label}.${parent || root}`;
  // Only mirror what the contract says: a room's foreman gets the room name, a seated member gets a seat name.
  if (!(await allowed(label, parent && parent !== root ? parent.split(".")[0] : null, owner)))
    return Response.json({ error: "not on-chain" }, { status: 403 });
  try {
    const txs = [];
    txs.push(...(await ensTx(["subname", "create", name, "--owner", owner])));
    txs.push(...(await ensTx(["set", "address", name, "--address", owner])));
    for (const [key, value] of Object.entries(texts)) {
      txs.push(...(await ensTx(["set", "text", name, "--key", key, "--value", String(value)])));
    }
    return Response.json({ ok: true, name, txs });
  } catch (e) {
    return Response.json({ error: "ENS write failed", detail: String(e.stderr || e.message) }, { status: 500 });
  }
}

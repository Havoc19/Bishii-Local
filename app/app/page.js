"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { createPublicClient, createWalletClient, custom, http, formatUnits, parseUnits, maxUint256 } from "viem";
import { IDKitRequestWidget, proofOfHuman } from "@worldcoin/idkit";
import { BISHI_ABI, USDC_ABI } from "../lib/abi";

const BISHI = process.env.NEXT_PUBLIC_BISHI;
const USDC = process.env.NEXT_PUBLIC_USDC;
const PARENT = process.env.NEXT_PUBLIC_ENS_PARENT || "bishii.eth";
const ZERO = "0x0000000000000000000000000000000000000000";
const chain = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID),
  name: Number(process.env.NEXT_PUBLIC_CHAIN_ID) === 5042002 ? "Arc Testnet" : "Localnet",
  // Arc pays gas in USDC (native, 18 decimals); the ERC-20 USDC interface the contract uses has 6.
  nativeCurrency: Number(process.env.NEXT_PUBLIC_CHAIN_ID) === 5042002 ? { name: "USDC", symbol: "USDC", decimals: 18 } : { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC || "http://127.0.0.1:8545"] } },
};
const pc = createPublicClient({ chain, transport: http() });
const usd = (v) => "$" + Number(formatUnits(v ?? 0n, 6)).toFixed(2);
const BACKING = ["Open", "Guarantor", "Full guarantor"];
const BICON = ["🔓", "🤝", "🛡"];
const ROOM_KEYS = ["foreman", "name", "instalment", "size", "roundLen", "maxBidBps", "commissionBps", "guarantorFeeBps", "deposit", "backing", "guarantorAmount", "round", "start", "filled", "bestSeat", "bestBps", "reserve", "collected"];
const COLORS = ["#ffc21a", "#ff3d8b", "#22e4ff", "#3dffa8", "#8b5cff", "#ff8a1a", "#5cc8ff", "#ff6ad5", "#b4ff3d", "#ffd86b"];

export default function Home() {
  const [wallet, setWallet] = useState(null);
  const [human, setHuman] = useState(null);
  const [bal, setBal] = useState(0n);
  const [rooms, setRooms] = useState([]);
  const [sel, setSel] = useState(null);
  useEffect(() => { // deep link from a guarantor request: /?room=0&seat=1
    const q = new URLSearchParams(window.location.search).get("room");
    if (q !== null) { setSel(Number(q)); setTimeout(() => document.getElementById("room")?.scrollIntoView({ behavior: "smooth" }), 800); }
  }, []);
  const [allSeats, setAllSeats] = useState([]);
  const seats = (sel !== null && allSeats[sel]) || [];
  const [rp, setRp] = useState(null);
  const [idOpen, setIdOpen] = useState(false);
  const [log, setLog] = useState([]);
  const [toast, setToast] = useState(null);
  const [party, setParty] = useState(0);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const say = (m) => {
    setLog((l) => [{ t: new Date().toLocaleTimeString(), m }, ...l].slice(0, 40));
    setToast(m);
  };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const load = useCallback(async () => {
    if (!BISHI) return;
    const n = Number(await pc.readContract({ address: BISHI, abi: BISHI_ABI, functionName: "roomCount" }));
    // Public reads: anyone can watch every table live, no wallet needed.
    const ids = Array.from({ length: n }, (_, i) => BigInt(i));
    const [rs, ss] = await Promise.all([
      Promise.all(ids.map((i) => pc.readContract({ address: BISHI, abi: BISHI_ABI, functionName: "rooms", args: [i] }))),
      Promise.all(ids.map((i) => pc.readContract({ address: BISHI, abi: BISHI_ABI, functionName: "getSeats", args: [i] }))),
    ]);
    setRooms(rs.map((r) => Object.fromEntries(ROOM_KEYS.map((k, j) => [k, r[j]]))));
    setAllSeats(ss);
    if (wallet) {
      setBal(await pc.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [wallet] }));
      const h = await pc.readContract({ address: BISHI, abi: BISHI_ABI, functionName: "humanOf", args: [wallet] });
      setHuman(/^0x0+$/.test(h) ? null : h);
    }
  }, [wallet]);

  useEffect(() => {
    load().catch(() => {});
    const t = setInterval(() => { setNow(Math.floor(Date.now() / 1000)); load().catch(() => {}); }, 3000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!window.ethereum) return;
    const h = (a) => setWallet(a[0] || null);
    window.ethereum.on?.("accountsChanged", h);
    return () => window.ethereum.removeListener?.("accountsChanged", h);
  }, []);

  async function connect() {
    if (!window.ethereum) return say("❌ Install a wallet (MetaMask / Rabby)");
    const [a] = await window.ethereum.request({ method: "eth_requestAccounts" });
    const hex = "0x" + chain.id.toString(16);
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch {
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: chain.name, rpcUrls: chain.rpcUrls.default.http, nativeCurrency: chain.nativeCurrency }] });
    }
    setWallet(a);
    return a;
  }

  // Join from any table: wallet prompt → World ID → open the table to board.
  async function wantJoin(i) {
    setSel(i);
    setTimeout(() => document.getElementById("room")?.scrollIntoView({ behavior: "smooth" }), 50);
    const addr = wallet || (await connect());
    if (!addr) return;
    const h = await pc.readContract({ address: BISHI, abi: BISHI_ABI, functionName: "humanOf", args: [addr] });
    if (/^0x0+$/.test(h)) { say("◉ One quick step: prove you're a unique human"); startVerify(); }
  }

  async function tx(address, abi, functionName, args = [], label = functionName) {
    try {
      const wc = createWalletClient({ account: wallet, chain, transport: custom(window.ethereum) });
      // Simulate first: a bad input shows the contract's own reason instead of a silent on-chain revert.
      const { request } = await pc.simulateContract({ account: wallet, address, abi, functionName, args });
      const hash = await wc.writeContract(request);
      say(`⏳ ${label}…`);
      const rc = await pc.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("transaction reverted on-chain");
      say(`✅ ${label}`);
      await load();
      return true;
    } catch (e) {
      say(`❌ ${label}: ${e.shortMessage || e.message}`);
      return false;
    }
  }
  const b = (fn, args, label) => tx(BISHI, BISHI_ABI, fn, args, label);

  async function ens(label, parent, texts) {
    say(`🪪 Writing ENS name ${label}.${parent || PARENT}…`);
    let r;
    for (let i = 0; i < 4; i++) { // the RPC can lag a few seconds behind the tx we just mined
      r = await fetch("/api/ens", { method: "POST", body: JSON.stringify({ label, parent, owner: wallet, texts }) }).then((r) => r.json()).catch(() => ({ error: "offline" }));
      if (r.error !== "not on-chain") break;
      await new Promise((ok) => setTimeout(ok, 3000));
    }
    say(r.ok ? `🪪 ENS ${r.name} is live` : `⚠️ ENS: ${r.error}`);
  }

  async function startVerify() {
    setRp(await fetch("/api/rp").then((r) => r.json()));
    setIdOpen(true);
  }

  const totals = rooms.reduce((a, r) => ({ rooms: a.rooms + 1, seats: a.seats + r.filled, pot: a.pot + (r.round >= 1 && r.round <= r.size ? r.instalment * BigInt(r.size) : 0n) }), { rooms: 0, seats: 0, pot: 0n });

  return (
    <main>
      <Confetti key={party} on={party > 0} />
      {toast && <div className="toast">{toast}</div>}

      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="pill live mono">LIVE · {chain.id === 31337 ? "localnet" : "Arc testnet"}</span>
        <div className="row">
          {!wallet ? <button onClick={connect}>Connect wallet</button> : <span className="pill mono">{wallet.slice(0, 6)}…{wallet.slice(-4)} · <b className="acc">{usd(bal)}</b></span>}
          {wallet && !human && <button className="hot" onClick={startVerify}>◉ Verify with World ID</button>}
          {human && <span className="pill ok">◉ verified human</span>}
          {wallet && chain.id === 31337 && <button className="ghost" onClick={async () => { await tx(USDC, USDC_ABI, "mint", [wallet, parseUnits("1000", 6)], "minted $1000 test USDC"); await tx(USDC, USDC_ABI, "approve", [BISHI, maxUint256], "USDC approved"); }}>+ test USDC</button>}
          {wallet && chain.id !== 31337 && (
            <>
              <a className="pill" href="https://faucet.circle.com" target="_blank" rel="noreferrer">Get testnet USDC ↗</a>
              <button className="ghost" onClick={() => tx(USDC, USDC_ABI, "approve", [BISHI, maxUint256], "USDC approved")}>Approve USDC</button>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <h1>Bishi with <span className="grad">strangers</span>,<br />made safe.</h1>
        <p className="mut" style={{ maxWidth: 620, fontSize: 17 }}>
          Board a savings circle like a Mumbai local. Every seat is a real human. Every winner is backed.
          Run with the pot and the circle still gets paid. And you never come back.
        </p>
      </div>
      <Train />
      <div className="stats">
        <div className="stat"><span className="mut">rooms</span><b className="acc">{totals.rooms}</b></div>
        <div className="stat"><span className="mut">humans aboard</span><b className="cy">{totals.seats}</b></div>
        <div className="stat"><span className="mut">pots in motion</span><b className="pk">{usd(totals.pot)}</b></div>
      </div>

      {rp && wallet && (
        <IDKitRequestWidget
          open={idOpen}
          onOpenChange={setIdOpen}
          app_id={process.env.NEXT_PUBLIC_WORLD_APP_ID}
          action={process.env.NEXT_PUBLIC_WORLD_ACTION}
          rp_context={rp}
          allow_legacy_proofs={true}
          environment={process.env.NEXT_PUBLIC_WORLD_ENV || "production"}
          preset={proofOfHuman({ signal: wallet.toLowerCase() })}
          handleVerify={async (result) => {
            const r = await fetch("/api/verify", { method: "POST", body: JSON.stringify({ result, wallet }) }).then((r) => r.json());
            if (!r.ok) { say(`❌ World ID: ${r.error}`); throw new Error(r.error); }
          }}
          onSuccess={() => { say("◉ World ID verified. One human, one seat."); setParty((p) => p + 1); load(); }}
          onError={(e) => say(`❌ World ID cancelled / failed: ${e}`)}
        />
      )}

      <HowItWorks />
      <Tables rooms={rooms} allSeats={allSeats} now={now} onPick={(i) => { setSel(i); setTimeout(() => document.getElementById("room")?.scrollIntoView({ behavior: "smooth" }), 50); }} onJoin={wantJoin} sel={sel} />
      <Board rooms={rooms} now={now} onPick={setSel} sel={sel} />
      {sel !== null && rooms[sel] && (
        <div id="room">
          <Room id={sel} r={rooms[sel]} seats={seats} wallet={wallet} now={now} b={b} ens={ens} celebrate={() => setParty((p) => p + 1)} />
        </div>
      )}
      <Create b={b} ens={ens} disabled={!human} roomCount={rooms.length} />
      <div className="card">
        <h2>Activity</h2>
        <div className="ticker">{log.length ? log.map((x, i) => <div key={x.t + i}><span className="mut">{x.t}</span>  {x.m}</div>) : <span className="mut">Waiting for the first train…</span>}</div>
      </div>
    </main>
  );
}

function Train() {
  return (
    <div className="track">
      <svg className="train" width="400" height="60" viewBox="0 0 400 60">
        <defs>
          <linearGradient id="tg" x1="0" x2="1"><stop offset="0" stopColor="#ffc21a" /><stop offset=".55" stopColor="#ff3d8b" /><stop offset="1" stopColor="#8b5cff" /></linearGradient>
        </defs>
        {[0, 1, 2].map((c) => (
          <g key={c} transform={`translate(${c * 128},0)`}>
            <rect x="2" y="6" width="122" height="40" rx={c === 2 ? 18 : 8} fill="url(#tg)" />
            {[0, 1, 2, 3].map((w) => <rect key={w} x={12 + w * 27} y="14" width="18" height="14" rx="3" fill="#07070c" opacity=".85" />)}
            <rect x="2" y="34" width="122" height="4" fill="#07070c" opacity=".35" />
            <circle cx="26" cy="50" r="7" fill="#1a1a22" stroke="#ffc21a" strokeWidth="2" />
            <circle cx="100" cy="50" r="7" fill="#1a1a22" stroke="#ffc21a" strokeWidth="2" />
          </g>
        ))}
        <circle cx="376" cy="22" r="4" fill="#fff" className="pulse" />
      </svg>
    </div>
  );
}

const STEPS = [
  { i: "◉", t: "Prove you're human", d: "World ID. One person, one seat. No bots, no fake bidders." },
  { i: "🚆", t: "Board a table", d: "Pick a room like bkc.bishii.eth. Some need a deposit or a guarantor." },
  { i: "💸", t: "Pay & bid", d: "Everyone pays each round. Need cash early? Bid a discount for the pot." },
  { i: "🛡", t: "Winners are backed", d: "You take out only what's backed. Run away and the guarantor pays the circle." },
];

function HowItWorks() {
  const [k, setK] = useState(0);
  useEffect(() => { const t = setInterval(() => setK((x) => (x + 1) % STEPS.length), 2600); return () => clearInterval(t); }, []);
  return (
    <div className="card">
      <h2>How it works · 4 stops</h2>
      <div className="steps">
        {STEPS.map((s, i) => (
          <div key={i} className={`step ${i === k ? "on" : ""}`} onMouseEnter={() => setK(i)}>
            <div className="dot">{s.i}</div>
            <b>{i + 1}. {s.t}</b>
            <span className="mut">{s.d}</span>
          </div>
        ))}
        <div className="rail"><i style={{ width: `${(k / (STEPS.length - 1)) * 100}%` }} /></div>
      </div>
    </div>
  );
}

// Plain-language caption: what's happening at this table right now.
function narrate(r, seats, now) {
  if (r.round === 0) {
    const unbacked = r.backing ? seats.filter((s) => s.guarantor === ZERO).length : 0;
    const free = r.size - r.filled;
    if (free > 0) return `🟡 Boarding: ${free} seat${free > 1 ? "s" : ""} left. Departs when full${r.backing ? " and every seat is backed" : ""}.`;
    return `🛡 Full! Waiting for ${unbacked} guarantor${unbacked > 1 ? "s" : ""} to back seats.`;
  }
  if (r.round > r.size) return `🏁 Arrived. Everyone got their pot. Deposits and stakes returned.`;
  const paid = seats.filter((s) => s.paidRound === r.round && !s.defaulted).length;
  const left = Number(r.start) + r.round * r.roundLen - now;
  const bid = r.bestSeat ? `Seat ${r.bestSeat - 1} leads, bidding ${r.bestBps / 100}% off.` : "No bids yet: pot goes to the next in line.";
  const bad = seats.filter((s) => s.defaulted).length;
  return `${left > 0 ? "🟢" : "🔴"} Round ${r.round}/${r.size}: ${paid}/${r.size} paid. ${bid} ${left > 0 ? `Closes in ${left}s.` : "Ready to close."}${bad ? ` ✕ ${bad} defaulted, covered by backing.` : ""}`;
}

function Tables({ rooms, allSeats, now, onPick, onJoin, sel }) {
  return (
    <div className="card glow">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>🎡 Live bishi tables</h2>
        <span className="mut" style={{ fontSize: 12 }}>watch freely · join with one tap</span>
      </div>
      <div className="tables">
        {rooms.length === 0 && <div className="mut">No tables yet. Become the first foreman below ↓</div>}
        {rooms.map((r, i) => {
          const seats = allSeats[i] || [];
          const s = status(r, now);
          const canJoin = r.round === 0 && r.filled < r.size;
          return (
            <div key={i} className={`table ${sel === i ? "sel" : ""}`} onClick={() => onPick(i)}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b className="grad" style={{ fontSize: 17 }}>{r.name}.{PARENT}</b>
                <span className={`mono ${s.c}`} style={{ fontSize: 11 }}>{s.t}</span>
              </div>
              <Circle r={r} seats={seats} me={-1} now={now} />
              <div className="row" style={{ gap: 6 }}>
                <span className="pill">{usd(r.instalment)}/round</span>
                <span className="pill">pot {usd(r.instalment * BigInt(r.size))}</span>
                <span className="pill">{BICON[r.backing]} {BACKING[r.backing]}</span>
              </div>
              <div className="cap">{narrate(r, seats, now)}</div>
              <button className={canJoin ? "hot" : "ghost"} style={{ width: "100%", marginTop: 10 }} onClick={(e) => { e.stopPropagation(); canJoin ? onJoin(i) : onPick(i); }}>
                {canJoin ? `Join · ${r.size - r.filled} seat${r.size - r.filled > 1 ? "s" : ""} left` : "Watch live →"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Flap({ text }) {
  return <span className="flap">{String(text).split("").map((c, i) => <span key={i} style={{ animationDelay: `${i * 30}ms` }}>{c === " " ? " " : c}</span>)}</span>;
}

function status(r, now) {
  if (r.round === 0) return { t: `BOARDING ${r.filled}/${r.size}`, c: "acc" };
  if (r.round > r.size) return { t: "ARRIVED", c: "ok" };
  const left = Number(r.start) + r.round * r.roundLen - now;
  return left > 0 ? { t: `RND ${r.round}/${r.size} · ${left}s`, c: "cy" } : { t: `RND ${r.round} · CLOSE NOW`, c: "pk" };
}

function Board({ rooms, now, onPick, sel }) {
  return (
    <div className="card glow">
      <h2>🚉 Departures</h2>
      <div className="board">
        <div className="brow head"><div>Room</div><div>Per round</div><div>Seats</div><div>Rules</div><div>Status</div></div>
        {rooms.length === 0 && <div className="brow"><span className="mut">No trains yet. Be the first foreman ↓</span></div>}
        {rooms.map((r, i) => {
          const s = status(r, now);
          return (
            <div key={i} className="brow" onClick={() => onPick(i)} style={sel === i ? { background: "rgba(255,61,139,.08)" } : null}>
              <Flap text={`${r.name}.${PARENT}`.toUpperCase()} />
              <span className="mono">{usd(r.instalment)}</span>
              <div><div className="mono" style={{ fontSize: 12 }}>{r.filled}/{r.size}</div><div className="bar"><i style={{ width: `${(r.filled / r.size) * 100}%` }} /></div></div>
              <span>{BICON[r.backing]} {BACKING[r.backing]}{r.deposit ? " · 💰" : ""}</span>
              <span className={`mono ${s.c}`}>{s.t}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The circle: seats on a ring around the pot, guarantors orbiting their seats, a countdown ring outside.
function Circle({ r, seats, me, now }) {
  const N = r.size, C = 210, R = 140;
  const active = r.round >= 1 && r.round <= r.size;
  const pot = r.instalment * BigInt(N);
  const fill = active && pot > 0n ? Number((r.collected * 1000n) / pot) / 1000 : r.round > r.size ? 1 : r.filled / N;
  const left = active ? Math.max(0, Number(r.start) + r.round * r.roundLen - now) : 0;
  const prog = active ? 1 - left / r.roundLen : 0;
  const ringLen = 2 * Math.PI * 196;
  const potR = 70, potTop = C + potR - fill * potR * 2;
  return (
    <svg viewBox="0 0 420 420" width="100%" style={{ maxWidth: 440 }}>
      <defs>
        <radialGradient id="core"><stop offset="0" stopColor="#ff3d8b" stopOpacity=".35" /><stop offset="1" stopColor="#07070c" stopOpacity="0" /></radialGradient>
        <linearGradient id="liq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22e4ff" /><stop offset="1" stopColor="#8b5cff" /></linearGradient>
        <clipPath id="potclip"><circle cx={C} cy={C} r={potR} /></clipPath>
      </defs>
      <circle cx={C} cy={C} r="205" fill="url(#core)" />
      <circle cx={C} cy={C} r="196" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="6" />
      {active && <circle cx={C} cy={C} r="196" fill="none" stroke={left > 0 ? "#ffc21a" : "#ff3d8b"} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={ringLen} strokeDashoffset={ringLen * (1 - prog)} transform={`rotate(-90 ${C} ${C})`} style={{ transition: "stroke-dashoffset 1s linear", filter: "drop-shadow(0 0 8px #ffc21a)" }} />}
      <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeDasharray="3 7" className="orbit" />

      {/* money lines from each paid seat into the pot */}
      {seats.map((s, i) => {
        const a = (i / N) * 2 * Math.PI - Math.PI / 2, x = C + R * Math.cos(a), y = C + R * Math.sin(a);
        const paid = active && s.paidRound === r.round && !s.defaulted;
        return paid ? <line key={"l" + i} x1={x} y1={y} x2={C} y2={C} stroke={COLORS[i]} strokeOpacity=".55" strokeWidth="2" strokeDasharray="4 6" className="pulse" /> : null;
      })}

      {/* pot with liquid */}
      <circle cx={C} cy={C} r={potR} fill="#0d0d14" stroke="rgba(255,255,255,.15)" strokeWidth="2" />
      <g clipPath="url(#potclip)">
        <g className="wave">
          <path d={`M ${C - potR - 10} ${potTop} q 15 -8 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 V ${C + potR + 10} H ${C - potR - 10} Z`} fill="url(#liq)" opacity=".9" style={{ transition: "all .8s" }} />
        </g>
      </g>
      <text x={C} y={C - 6} textAnchor="middle" fill="#fff" fontSize="22" fontWeight="700">{usd(active ? r.collected : pot)}</text>
      <text x={C} y={C + 16} textAnchor="middle" fill="#c9cbd6" fontSize="10" letterSpacing="2">{active ? `POT · ROUND ${r.round}` : r.round > r.size ? "COMPLETE" : "BOARDING"}</text>
      {active && <text x={C} y={C + 32} textAnchor="middle" fill="#ffc21a" fontSize="11">{left > 0 ? `${left}s` : "close round"}</text>}

      {/* seats */}
      {Array.from({ length: N }).map((_, i) => {
        const s = seats[i];
        const a = (i / N) * 2 * Math.PI - Math.PI / 2, x = C + R * Math.cos(a), y = C + R * Math.sin(a);
        const col = !s ? "#2a2a35" : s.defaulted ? "#ff4d5e" : COLORS[i];
        const isTop = r.bestSeat === i + 1;
        const backed = s && s.guarantor !== ZERO;
        return (
          <g key={i}>
            {isTop && <circle cx={x} cy={y} r="34" fill="none" stroke="#ffc21a" strokeWidth="2" className="pulse" />}
            {s?.won && <circle cx={x} cy={y} r="30" fill="none" stroke="#3dffa8" strokeWidth="2" strokeDasharray="2 4" />}
            <circle cx={x} cy={y} r="24" fill="#0d0d14" stroke={col} strokeWidth={i === me ? 4 : 2.5} style={{ filter: s ? `drop-shadow(0 0 10px ${col})` : "none" }} />
            <text x={x} y={y + 5} textAnchor="middle" fill={s ? "#fff" : "#55556a"} fontSize="14" fontWeight="700">{s ? (s.defaulted ? "✕" : s.won ? "★" : i) : "+"}</text>
            {backed && (
              <g style={{ transformOrigin: `${x}px ${y}px`, animation: `rot ${6 + i}s linear infinite` }}>
                <circle cx={x + 34} cy={y} r="8" fill="#0d0d14" stroke="#22e4ff" strokeWidth="1.5" />
                <text x={x + 34} y={y + 3.5} textAnchor="middle" fontSize="9">🛡</text>
              </g>
            )}
            {s && active && s.paidRound === r.round && !s.defaulted && <circle cx={x + 17} cy={y - 17} r="6" fill="#3dffa8" />}
            {i === me && <text x={x} y={y + 42} textAnchor="middle" fill="#ffc21a" fontSize="10" letterSpacing="2">YOU</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Room({ id, r, seats, wallet, now, b, ens, celebrate }) {
  const [bps, setBps] = useState(1000);
  const [seatName, setSeatName] = useState("");
  const wonRef = useRef(null);
  const me = seats.findIndex((s) => wallet && s.member.toLowerCase() === wallet.toLowerCase());
  const stakeFor = r.backing === 2 ? BigInt(r.size - 1) * r.instalment : r.guarantorAmount;
  const shareLink = typeof window !== "undefined" ? `${window.location.origin}/?room=${id}&seat=${me}` : "";
  const focusSeat = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("room") === String(id) ? Number(new URLSearchParams(window.location.search).get("seat")) : -1;
  const mine = me >= 0 ? seats[me] : null;
  const active = r.round >= 1 && r.round <= r.size;
  const ended = active && now >= Number(r.start) + r.round * r.roundLen;
  useEffect(() => { if (mine?.won && wonRef.current === false) celebrate(); wonRef.current = !!mine?.won; }, [mine?.won]);

  // The safety rule, live: what you'd get now vs what's held.
  const pot = r.instalment * BigInt(r.size);
  const discount = (pot * BigInt(bps)) / 10000n;
  const commission = (pot * BigInt(r.commissionBps)) / 10000n;
  const owe = BigInt(Math.max(0, r.size - r.round)) * r.instalment;
  const backing = mine ? mine.deposit + mine.stake : 0n;
  const net = pot - discount - commission;
  let held = owe > backing ? owe - backing : 0n;
  if (held > net) held = net;
  const nowAmt = net - held;
  const pct = (v) => (pot > 0n ? Number((v * 10000n) / pot) / 100 : 0);

  return (
    <div className="card glow">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Room</h2>
          <div style={{ fontSize: 26, fontWeight: 700 }} className="grad">{r.name}.{PARENT}</div>
          <div className="mut mono" style={{ fontSize: 12 }}>foreman {r.foreman.slice(0, 8)}… · organiser, earns reputation not fees</div>
        </div>
        <div className="row">
          <span className="pill">{usd(r.instalment)} × {r.size}</span>
          <span className="pill">{BICON[r.backing]} {BACKING[r.backing]}{r.backing === 1 ? ` ${usd(r.guarantorAmount)}` : ""}</span>
          {r.deposit && <span className="pill">💰 deposit</span>}
          <span className="pill">max bid {r.maxBidBps / 100}%</span>
        </div>
      </div>

      <div className="cap" style={{ fontSize: 15, marginTop: 12 }}>{narrate(r, seats, now)}</div>
      <div className="stage" style={{ marginTop: 10 }}>
        <Circle r={r} seats={seats} me={me} now={now} />
        <div>
          <div className="mono" style={{ fontSize: 12, lineHeight: 2 }}>
            {seats.map((s, i) => (
              <div key={i} className="row" style={{ gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.defaulted ? "#ff4d5e" : COLORS[i], boxShadow: `0 0 8px ${COLORS[i]}` }} />
                <span>seat {i}{i === me ? " (you)" : ""}</span>
                <span className="mut">{s.member.slice(0, 6)}…</span>
                {s.guarantor !== ZERO && <span className="cy">🛡 backed {usd(s.stake)}</span>}
                {r.backing > 0 && s.guarantor === ZERO && <span className="acc">⚠️ needs guarantor</span>}
                {s.deposit > 0n && <span className="acc">💰 {usd(s.deposit)}</span>}
                {s.held > 0n && <span className="pk">⏳ {usd(s.held)}</span>}
                {s.won && <span className="ok">★ won</span>}
                {s.defaulted && <span className="bad">✕ defaulted · flagged forever</span>}
                {r.round === 0 && r.backing > 0 && s.guarantor === ZERO && i !== me && (
                  <button className={focusSeat === i ? "hot" : "ghost"} style={{ padding: "4px 10px" }} onClick={() => b("guarantee", [BigInt(id), i], `guaranteed seat ${i}`)}>🛡 Back this seat · stake {usd(stakeFor)}</button>
                )}
              </div>
            ))}
            {seats.length < r.size && <div className="mut">{r.size - seats.length} empty seat(s)</div>}
          </div>

          {mine && r.round === 0 && r.backing > 0 && mine.guarantor === ZERO && (
            <div className="cap" style={{ marginTop: 14, borderLeftColor: "var(--pink)" }}>
              <b>Your seat needs a guarantor.</b> Ask someone you trust (a different verified human, not in this room) to back you with a{" "}
              <b>{usd(stakeFor)}</b> stake. They earn {r.guarantorFeeBps / 100}% of every instalment you pay, and get the stake back when the circle ends.
              <div className="row" style={{ marginTop: 8 }}>
                <input readOnly value={shareLink} style={{ flex: 1, minWidth: 220 }} onFocus={(e) => e.target.select()} />
                <button onClick={() => { navigator.clipboard?.writeText(shareLink); }}>Copy link</button>
              </div>
            </div>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            {r.round === 0 && me < 0 && (
              <>
                <span className="row" style={{ gap: 4 }}><input placeholder="riya" value={seatName} onChange={(e) => setSeatName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} style={{ width: 110 }} /><span className="mut mono" style={{ fontSize: 12 }}>.{r.name}.{PARENT}</span></span>
                <button onClick={async () => { if (await b("join", [BigInt(id)], "boarded")) if (seatName) ens(seatName, `${r.name}.${PARENT}`, { "bishi.seat": "member", "bishi.room": `${r.name}.${PARENT}` }); }}>
                  Board{r.deposit ? ` · lock ${usd(r.instalment)}` : ""}
                </button>
              </>
            )}
            {active && mine && !ended && mine.paidRound < r.round && <button onClick={() => b("pay", [BigInt(id)], `paid round ${r.round}`)}>Pay {usd(r.instalment)}</button>}
            {active && mine && mine.paidRound === r.round && <span className="pill ok">✓ paid this round</span>}
            {ended && <button className="hot" onClick={() => b("closeRound", [BigInt(id)], `round ${r.round} closed`)}>Close round → pay winner</button>}
          </div>

          {active && mine && !mine.won && !mine.defaulted && !ended && (
            <div style={{ marginTop: 18 }}>
              <h2>Bid for the pot · {bps / 100}% discount</h2>
              <input type="range" min="0" max={r.maxBidBps} step="50" value={bps} onChange={(e) => setBps(Number(e.target.value))} />
              <div className="stack" style={{ marginTop: 12 }}>
                <div style={{ flexGrow: pct(nowAmt), background: "var(--ok)" }}>{pct(nowAmt) > 12 ? `NOW ${usd(nowAmt)}` : ""}</div>
                <div style={{ flexGrow: pct(held), background: "var(--acc)" }}>{pct(held) > 12 ? `HELD ${usd(held)}` : ""}</div>
                <div style={{ flexGrow: pct(discount), background: "var(--pink)" }}>{pct(discount) > 8 ? "DIVIDEND" : ""}</div>
              </div>
              <div className="row mono" style={{ fontSize: 12, marginTop: 8, gap: 16 }}>
                <span className="ok">● you get now {usd(nowAmt)}</span>
                <span className="acc">● held, unlocks as you pay {usd(held)}</span>
                <span className="pk">● to other members {usd(discount)}</span>
              </div>
              <div className="mut" style={{ fontSize: 12, marginTop: 6 }}>backing {usd(backing)} vs still owe {usd(owe)}: you can only take out what's backed.</div>
              <button style={{ marginTop: 12 }} disabled={mine.paidRound < r.round} onClick={() => b("bid", [BigInt(id), bps], `bid ${bps / 100}%`)}>
                {mine.paidRound < r.round ? "Pay first to bid" : `Bid ${bps / 100}%`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Gauge({ level }) {
  const a = [-60, 0, 60][level];
  const col = ["#ff4d5e", "#ffc21a", "#3dffa8"][level];
  return (
    <svg className="gauge" viewBox="0 0 160 96">
      <path d="M 14 86 A 66 66 0 0 1 146 86" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="12" strokeLinecap="round" />
      <path d="M 14 86 A 66 66 0 0 1 146 86" fill="none" stroke="url(#gg)" strokeWidth="12" strokeLinecap="round" strokeDasharray="208" strokeDashoffset={208 - ((level + 1) / 3) * 208} style={{ transition: "stroke-dashoffset .6s" }} />
      <defs><linearGradient id="gg"><stop offset="0" stopColor="#ff4d5e" /><stop offset=".5" stopColor="#ffc21a" /><stop offset="1" stopColor="#3dffa8" /></linearGradient></defs>
      <line x1="80" y1="86" x2="80" y2="34" stroke={col} strokeWidth="4" strokeLinecap="round" transform={`rotate(${a} 80 86)`} style={{ transition: "transform .6s cubic-bezier(.3,1.6,.5,1)", filter: `drop-shadow(0 0 6px ${col})` }} />
      <circle cx="80" cy="86" r="6" fill="#fff" />
    </svg>
  );
}

function Create({ b, ens, disabled, roomCount }) {
  const [f, setF] = useState({ name: "", instalment: "1", size: 4, roundLen: 120, maxBid: 30, gFee: 2, deposit: true, backing: 2, gAmt: "40" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const level = Number(f.backing) === 2 ? 2 : Number(f.backing) === 1 || f.deposit ? 1 : 0;
  const safety = ["Open seats: winners get little upfront, the rest unlocks as they pay", "Partly backed: winners get some upfront", "Fully backed: winners get the whole pot upfront"][level];
  return (
    <div className="card">
      <h2>🧑‍✈️ Become a foreman</h2>
      <div className="stage" style={{ gridTemplateColumns: "1fr 220px" }}>
        <div>
          <label>Room name
            <span className="row" style={{ gap: 6 }}>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="bkc" style={{ fontSize: 20, width: 180 }} />
              <span className="grad mono" style={{ fontSize: 18 }}>.{PARENT}</span>
            </span>
          </label>
          <div className="row" style={{ marginTop: 14 }}>
            <label>Per round ($)<input value={f.instalment} onChange={set("instalment")} size={5} /></label>
            <label>Round (sec)<input value={f.roundLen} onChange={set("roundLen")} size={5} /></label>
            <label>Max bid % (≤30)<input type="number" min="0" max="30" value={f.maxBid} onChange={(e) => setF({ ...f, maxBid: Math.min(30, Math.max(0, Number(e.target.value))) })} style={{ width: 70 }} /></label>
            <label>Guarantor fee % (≤10)<input type="number" min="0" max="10" value={f.gFee} onChange={(e) => setF({ ...f, gFee: Math.min(10, Math.max(0, Number(e.target.value))) })} style={{ width: 70 }} /></label>
          </div>
          <label style={{ marginTop: 14 }}>Members
            <div className="seg">{[4, 6, 8, 10].map((n) => <button key={n} className={Number(f.size) === n ? "on" : ""} onClick={() => setF({ ...f, size: n })}>{n}</button>)}</div>
          </label>
          <label style={{ marginTop: 14 }}>Who can board
            <div className="seg">{BACKING.map((x, i) => <button key={i} className={Number(f.backing) === i ? "on" : ""} onClick={() => setF({ ...f, backing: i })}>{BICON[i]} {x}</button>)}</div>
          </label>
          <div className="row" style={{ marginTop: 12 }}>
            {Number(f.backing) === 1 && <label>Guarantor stake ($)<input value={f.gAmt} onChange={set("gAmt")} size={5} /></label>}
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={f.deposit} onChange={set("deposit")} /> Joining deposit (1 round locked)</label>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <Gauge level={level} />
          <div className="mono" style={{ fontSize: 12, color: ["#ff4d5e", "#ffc21a", "#3dffa8"][level] }}>SAFETY {["LOW", "MEDIUM", "HIGH"][level]}</div>
          <div className="mut" style={{ fontSize: 12, marginTop: 6 }}>{safety}</div>
        </div>
      </div>
      <button
        className="hot"
        style={{ marginTop: 18, fontSize: 16, padding: "14px 22px" }}
        disabled={disabled || !f.name}
        onClick={async () => {
          const ok = await b("createRoom", [f.name, parseUnits(f.instalment, 6), Number(f.size), Number(f.roundLen), Math.round(f.maxBid * 100), 0, Math.round(f.gFee * 100), f.deposit, Number(f.backing), parseUnits(f.gAmt || "0", 6)], `${f.name}.${PARENT} created`);
          if (ok) ens(f.name, null, { "bishi.rules": `${f.instalment}USDC x${f.size}, ${BACKING[f.backing]}${f.deposit ? ", deposit" : ""}`, "bishi.foreman": "true", "bishi.room": String(roomCount) });
        }}
      >
        {disabled ? "◉ Verify with World ID to create a room" : `🚆 Launch ${f.name || "…"}.${PARENT}`}
      </button>
    </div>
  );
}

function Confetti({ on }) {
  if (!on) return null;
  return (
    <div className="confetti">
      {Array.from({ length: 70 }).map((_, i) => (
        <i key={i} style={{ left: `${Math.random() * 100}%`, background: COLORS[i % COLORS.length], animationDelay: `${Math.random() * 0.6}s`, transform: `rotate(${Math.random() * 360}deg)` }} />
      ))}
    </div>
  );
}

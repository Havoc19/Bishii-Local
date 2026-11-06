# 🚆 Bishi Local

**Bishi with strangers, made safe.** Run a bidding savings circle (bishi / chit / committee) with people you don't know.
Every seat is a unique real human (World ID), every room has a name and a track record (ENSv2), and every winner
can only take out what is backed. The rest is held in USDC and released as they keep paying.

Built at ETHGlobal Mumbai 2026.

---

## 1. Problem

- Millions of Indians save and borrow through bishi, but only with people they already trust.
- The classic failure: someone wins the pot early, then stops paying. Everyone else loses.
- On-chain savings circles so far don't stop this. For example, in Yield Circle's contract the first recipient
  takes everyone's deposits minus their own and nothing makes them pay again. A new wallet resets any reputation.
- Real chit funds solve it with a **foreman**: the organiser who picks members, guarantees them and earns a commission.
  Every on-chain chit fund so far deleted the foreman. **We bring the foreman back, with their promise enforced by code.**

## 2. The idea in one screen

| Who | What they do | What they risk / earn |
|---|---|---|
| **Foreman** | Creates a room `bkc.bishi.eth`, sets the rules | Earns a commission on every pot (max 5%); their ENS name carries their record |
| **Member** | Joins a room, pays each round, bids a discount to get the pot early | Bid discount is paid as dividends to the patient members |
| **Guarantor** | A *different* verified human who backs a member's seat | Locks a stake, earns a fee on every instalment that member pays |

### Room rules (two settings)

1. **Joining deposit**: on or off. On means each member locks one instalment as security.
2. **Backing**:
   - 🔓 **None**: open room, any verified human can join.
   - 🤝 **Guarantor + amount**: each seat needs a guarantor who stakes the amount the foreman set.
   - 🛡 **Full guarantor**: the guarantor stakes everything the member could still owe.

### The one safety rule

> **You can take out now only what's backed. Anything not backed is held and released as you keep paying.**

```
backing     = your deposit + your guarantor's stake
still owe   = rounds left × instalment
held back   = max(0, still owe − backing)
you get now = pot − your discount − commission − held back
```

Example: 4 members, $20 a round, pot $80. Riya wins round 1 with a 10% bid (discount $8, commission $1.60).
She still owes $60.

| Room rules | Backing | Held | Riya gets now |
|---|---|---|---|
| Full guarantor | $60 | $0 | **$70.40** |
| Deposit + $20 guarantor | $40 | $20 | **$50.40**, plus the rest as she pays |
| Open room, no deposit | $0 | $60 | **$10.40**, plus $20 each round she pays |

So every room type is safe from the runaway problem; stronger backing just means more cash upfront.

### If someone defaults

At the round deadline, an unpaid seat is marked defaulted. Their money is seized in this order and used to pay
their instalments: **held payout → deposit → guarantor stake**. If anything is still short, the pot shrinks for everyone.
Their **World ID is flagged forever**: a new wallet carries the same World ID nullifier and is rejected.

## 3. Sponsors and why each is needed

| Sponsor / prize | Its job | Without it |
|---|---|---|
| **World: Best Use of IDKit** | One seat per human; guarantor must be a different human; defaulter can't return with a new wallet | One person fills a room with fake bidders, guarantees themselves, and resets bad history with a fresh wallet |
| **ENS: Best Use of ENSv2** | `bkc.bishi.eth` is the room/foreman; `riya.bkc.bishi.eth` is a seat; text records hold the rules and record | Rooms are anonymous numbers; nobody can check a foreman's history before trusting them |
| **Arc: Advanced Stablecoin Logic** | USDC escrow, bid auction, dividend splits, commission and guarantor fees, held-back payouts, default handling | No dollar-stable money for savings |

**Credential choice (World):** `proofOfHuman` (Orb), because real money and one-seat-per-human need the strongest
uniqueness. The demo uses World's simulator in `staging`.

## 4. Architecture

```
┌──────────────────── Next.js app (app/) ─────────────────────┐
│ Departures board · Create room · Room view · Bid preview    │
└───────┬──────────────────────────────┬──────────────────────┘
        │ World ID proof               │ wallet txs (USDC)
┌───────▼─────────────────────┐        │
│ API routes (server only)    │        │
│ /api/rp     sign request    │        │
│ /api/verify check proof →   │        │
│             registerHuman   │        │
│ /api/ens    mirror rooms &  │        │
│             seats to ENS    │        │
└───┬─────────────┬───────────┘        │
    │             │                    │
    │      ┌──────▼────────────────────▼─────────┐
    │      │ Arc testnet: Bishi.sol               │
    │      │ humans (nullifier ↔ wallet, flags)   │
    │      │ rooms, join rules, guarantor stakes  │
    │      │ pay · bid · closeRound · payouts     │
    │      └──────────────────────────────────────┘
┌───▼─────────────────────────────────────────┐
│ Sepolia: ENSv2                               │
│ bishi.eth                                    │
│  └ bkc.bishi.eth          room / foreman     │
│     └ riya.bkc.bishi.eth  a seat → wallet    │
└──────────────────────────────────────────────┘
```

- **One contract**, `contracts/src/Bishi.sol`. All rooms live in it; no per-room deploys.
- **World ID**: the browser gets a server-signed request (`/api/rp`), the user proves with World App, the server
  checks the proof with World's API, confirms the proof's signal is the user's wallet, and calls
  `registerHuman(wallet, keccak(nullifier))`. One fixed action ID means the same human always gets the same nullifier.
- **ENS**: after a room is created or a seat joined on-chain, `/api/ens` checks the contract (the caller must really be
  that room's foreman / a seated member) and then writes the ENSv2 subname and text records on Sepolia via the `ens` CLI.
- **Rounds**: `closeRound` can be called by anyone after the deadline. The backend holds no member money.

## 5. How people use it

**Foreman**
1. Connect wallet → Verify with World ID.
2. Create room: name `bkc`, instalment, members, round length, max discount, commission, guarantor fee,
   deposit on/off, backing type. The page shows the room's safety level live.
3. `bkc.bishi.eth` is created and starts building a record.

**Member**
1. Verify with World ID → pick a room from the departures board.
2. Join with a seat name (`riya` → `riya.bkc.bishi.eth`). If the room needs a deposit, it is locked now.
3. If the room needs backing, send the room link to a guarantor.
4. When all seats are filled and backed, the room departs. Each round: **Pay**, optionally **Bid** with the slider,
   which shows *"you get now"* vs *"held"* before you commit.
5. After the deadline anyone presses **Close round**: the winner is paid, dividends are split, defaults are covered.

**Guarantor**
1. Verify with World ID (must not be in that room, so a second wallet of the member is rejected).
2. Open the room → **Guarantee this seat** → stake locks. Earn the fee on every instalment the member pays;
   stake returns when the circle finishes cleanly.

## 6. Denied paths (shown in the demo)

| Attempt | Result |
|---|---|
| Unverified wallet joins | `verify with World ID first` |
| Same human, second wallet, second seat | `one seat per human` |
| Member guarantees their own seat from another wallet | `guarantor can't be in this room` |
| Defaulter returns with a fresh wallet | `flagged: defaulted before` |
| World ID proof made for a different wallet | API rejects: `proof is for a different wallet` |

## 7. Demo script (3 min)

1. "Bishi runs on trust between people who know each other. We made it work between strangers."
2. Foreman creates `bkc.bishi.eth` (full guarantor, 4 seats, 2-minute rounds).
3. Judges verify with World ID and take seats; guarantors back them.
4. Round 1: a judge bids 10%. The slider shows $70.40 now, $0 held. Close round: payout + dividends land.
5. Round 2: the winner doesn't pay. Close round: their guarantor's stake covers the circle, and their World ID is flagged.
6. They try again with a new wallet: rejected. "New wallet, same human. No escape."
7. Show the same attack against Yield Circle's contract: the winner walks away with profit.

## 8. Run it

```bash
# contracts
cd contracts && forge test                     # 3 tests: safety rule, covered runaway, denied paths
anvil                                          # local chain, or use Arc testnet
VERIFIER=<backend wallet> forge script script/Deploy.s.sol --rpc-url <rpc> --private-key <pk> --broadcast
#   USDC=<arc usdc address> to use real USDC; unset deploys MockUSDC

# app
cd app && cp .env.example .env.local           # fill in values
npm install && npm run dev                     # http://localhost:3000
npm install -g "https://pkg.pr.new/ensdomains/ens-cli/@ensdomains/cli@main"   # for /api/ens
```

ENS setup (once): register `bishi.eth` on ENSv2 Sepolia with the `ens` CLI, give it a resolver and subregistry,
and put that wallet's key in `ENS_PK`.

## 9. Known limits (honest)

- A friend who knows the member can still guarantee them; World ID stops fake people, not friendly ones.
- Bids are open, not sealed. Commit-reveal is the next step.
- Guarantor stakes unlock at the end of the circle, not gradually as exposure falls.
- ENS names are mirrored from Arc by our backend. Next step: a resolver that reads seats straight from Arc (CCIP-Read).
- Chit funds are regulated in India (Chit Funds Act 1982); a real launch needs registration. The 30% bid cap and 5%
  commission cap follow common practice.

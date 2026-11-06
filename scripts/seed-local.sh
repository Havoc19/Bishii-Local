#!/usr/bin/env bash
# Seeds a local anvil chain with demo tables: one boarding, one mid-round with bids, one waiting for guarantors.
# Uses anvil's public test keys only. Usage: BISHI=0x.. USDC=0x.. ./scripts/seed-local.sh
set -euo pipefail
RPC=${RPC:-http://127.0.0.1:8545}
VER=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
KEYS=(0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba
0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e
0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356
0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97
0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6)
s() { cast send --rpc-url "$RPC" --private-key "$1" "${@:2}" >/dev/null; }
addr() { cast wallet address "$1"; }

for i in "${!KEYS[@]}"; do
  k=${KEYS[$i]}; a=$(addr "$k")
  s $VER "$BISHI" "registerHuman(address,bytes32)" "$a" "$(cast keccak "demo-human-$i")"
  s "$k" "$USDC" "mint(address,uint256)" "$a" 1000000000
  s "$k" "$USDC" "approve(address,uint256)" "$BISHI" "$(cast max-uint)"
  echo "human $i ready: $a"
done

# createRoom(name, instalment, size, roundLen, maxBidBps, commissionBps, guarantorFeeBps, deposit, backing, guarantorAmount)
s ${KEYS[0]} "$BISHI" "createRoom(string,uint256,uint8,uint32,uint16,uint16,uint16,bool,uint8,uint256)" bkc 20000000 4 600 3000 200 200 false 0 0
s ${KEYS[1]} "$BISHI" "createRoom(string,uint256,uint8,uint32,uint16,uint16,uint16,bool,uint8,uint256)" dadar 50000000 6 600 3000 200 200 true 0 0
s ${KEYS[2]} "$BISHI" "createRoom(string,uint256,uint8,uint32,uint16,uint16,uint16,bool,uint8,uint256)" andheri 10000000 4 600 3000 200 200 false 2 0

# bkc: full, running, 3 paid, seat 1 bidding 12%
for i in 0 1 2 3; do s ${KEYS[$i]} "$BISHI" "join(uint256)" 0; done
for i in 0 1 2; do s ${KEYS[$i]} "$BISHI" "pay(uint256)" 0; done
s ${KEYS[1]} "$BISHI" "bid(uint256,uint16)" 0 1200
# dadar: boarding 3/6 with deposits
for i in 4 5 6; do s ${KEYS[$i]} "$BISHI" "join(uint256)" 1; done
# andheri (full guarantor): 4 seated, 1 backed
for i in 3 4 5 6; do s ${KEYS[$i]} "$BISHI" "join(uint256)" 2; done
s ${KEYS[7]} "$BISHI" "guarantee(uint256,uint8)" 2 0
echo "seeded: bkc (running), dadar (boarding), andheri (waiting for guarantors)"

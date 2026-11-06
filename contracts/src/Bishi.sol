// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title Bishi — bidding savings circles between verified strangers.
/// Rule: a winner takes out now only what is backed; the rest is held and released as they keep paying.
contract Bishi {
    enum Backing { None, Guarantor, FullGuarantor }

    struct Room {
        address foreman;
        string name; // ENS label, e.g. "bkc" -> bkc.bishi.eth
        uint256 instalment;
        uint8 size;
        uint32 roundLen;
        uint16 maxBidBps;
        uint16 commissionBps;
        uint16 guarantorFeeBps;
        bool deposit;
        Backing backing;
        uint256 guarantorAmount; // used when backing == Guarantor
        uint8 round; // 0 = filling, 1..size = active, size+1 = finished
        uint64 start;
        uint8 filled;
        uint8 bestSeat; // current top bidder (+1, 0 = none)
        uint16 bestBps;
        uint256 reserve; // seized from defaulters, pays their instalments
        uint256 collected; // this round's pot so far
    }

    struct Seat {
        address member;
        bytes32 human;
        address guarantor;
        uint256 stake; // guarantor stake
        uint256 deposit;
        uint256 held; // payout held back until paid
        uint8 paidRound; // last round paid
        bool won;
        bool defaulted;
    }

    IERC20 public immutable usdc;
    address public verifier; // backend that checks World ID proofs

    mapping(address => bytes32) public humanOf; // wallet -> World ID nullifier
    mapping(bytes32 => bool) public flagged; // defaulted humans, forever
    mapping(bytes32 => uint256) public completed; // circles finished cleanly
    mapping(uint256 => mapping(bytes32 => bool)) public inRoom; // member or guarantor already involved

    Room[] public rooms;
    mapping(uint256 => Seat[]) internal seats;
    mapping(bytes32 => bool) public nameTaken;

    event HumanRegistered(address indexed wallet, bytes32 indexed human);
    event RoomCreated(uint256 indexed id, string name, address foreman);
    event Joined(uint256 indexed id, uint8 seat, address member);
    event Guaranteed(uint256 indexed id, uint8 seat, address guarantor, uint256 stake);
    event Started(uint256 indexed id);
    event Paid(uint256 indexed id, uint8 seat, uint8 round, uint256 released);
    event Bid(uint256 indexed id, uint8 seat, uint16 bps);
    event Won(uint256 indexed id, uint8 round, uint8 seat, uint256 now_, uint256 held, uint256 dividendEach);
    event Defaulted(uint256 indexed id, uint8 seat, bytes32 human, uint256 seized);
    event Finished(uint256 indexed id);

    constructor(IERC20 _usdc, address _verifier) {
        usdc = _usdc;
        verifier = _verifier;
    }

    // ---------- humans ----------

    /// Backend calls this after verifying a World ID proof. Same human + new wallet keeps the same nullifier,
    /// so flags and history follow the person, not the wallet.
    function registerHuman(address wallet, bytes32 human) external {
        require(msg.sender == verifier, "not verifier");
        require(human != bytes32(0), "bad human");
        humanOf[wallet] = human;
        emit HumanRegistered(wallet, human);
    }

    function _human(address a) internal view returns (bytes32 h) {
        h = humanOf[a];
        require(h != bytes32(0), "verify with World ID first");
        require(!flagged[h], "flagged: defaulted before");
    }

    // ---------- rooms ----------

    function createRoom(
        string calldata name,
        uint256 instalment,
        uint8 size,
        uint32 roundLen,
        uint16 maxBidBps,
        uint16 commissionBps,
        uint16 guarantorFeeBps,
        bool deposit,
        Backing backing,
        uint256 guarantorAmount
    ) external returns (uint256 id) {
        _human(msg.sender);
        require(size >= 2 && size <= 10, "size 2-10");
        require(instalment > 0 && roundLen > 0, "bad params");
        require(maxBidBps <= 3000 && commissionBps <= 500 && guarantorFeeBps <= 1000, "caps: bid 30%, fee 5%/10%");
        bytes32 key = keccak256(bytes(name));
        require(bytes(name).length > 0 && !nameTaken[key], "name taken");
        nameTaken[key] = true;
        id = rooms.length;
        Room storage r = rooms.push();
        r.foreman = msg.sender;
        r.name = name;
        r.instalment = instalment;
        r.size = size;
        r.roundLen = roundLen;
        r.maxBidBps = maxBidBps;
        r.commissionBps = commissionBps;
        r.guarantorFeeBps = guarantorFeeBps;
        r.deposit = deposit;
        r.backing = backing;
        r.guarantorAmount = guarantorAmount;
        emit RoomCreated(id, name, msg.sender);
    }

    function join(uint256 id) external {
        Room storage r = rooms[id];
        bytes32 h = _human(msg.sender);
        require(r.round == 0 && r.filled < r.size, "room not open");
        require(!inRoom[id][h], "one seat per human");
        inRoom[id][h] = true;
        uint256 dep = r.deposit ? r.instalment : 0;
        if (dep > 0) _pull(msg.sender, dep);
        seats[id].push(Seat(msg.sender, h, address(0), 0, dep, 0, 0, false, false));
        r.filled++;
        emit Joined(id, r.filled - 1, msg.sender);
        _maybeStart(id);
    }

    /// A different verified human backs a seat with their own money.
    function guarantee(uint256 id, uint8 seat) external {
        Room storage r = rooms[id];
        require(r.backing != Backing.None, "no guarantor needed");
        Seat storage s = seats[id][seat];
        require(r.round == 0 && s.guarantor == address(0), "already backed");
        bytes32 h = _human(msg.sender);
        require(!inRoom[id][h], "guarantor can't be in this room"); // also blocks self-guarantee from a 2nd wallet
        inRoom[id][h] = true;
        uint256 stake = r.backing == Backing.FullGuarantor ? uint256(r.size - 1) * r.instalment : r.guarantorAmount;
        _pull(msg.sender, stake);
        s.guarantor = msg.sender;
        s.stake = stake;
        emit Guaranteed(id, seat, msg.sender, stake);
        _maybeStart(id);
    }

    function _maybeStart(uint256 id) internal {
        Room storage r = rooms[id];
        if (r.filled < r.size) return;
        if (r.backing != Backing.None) {
            Seat[] storage ss = seats[id];
            for (uint256 i; i < ss.length; i++) if (ss[i].guarantor == address(0)) return;
        }
        r.round = 1;
        r.start = uint64(block.timestamp);
        emit Started(id);
    }

    // ---------- rounds ----------

    function pay(uint256 id) external {
        Room storage r = rooms[id];
        require(r.round >= 1 && r.round <= r.size, "not active");
        require(block.timestamp < roundEnd(id), "round over, call closeRound");
        uint8 i = _seatOf(id, msg.sender);
        Seat storage s = seats[id][i];
        require(!s.defaulted && s.paidRound < r.round, "already paid");
        s.paidRound = r.round;
        uint256 fee = s.guarantor == address(0) ? 0 : (r.instalment * r.guarantorFeeBps) / 10000;
        _pull(msg.sender, r.instalment + fee);
        r.collected += r.instalment;
        if (fee > 0) _push(s.guarantor, fee);
        uint256 rel = s.held < r.instalment ? s.held : r.instalment; // paying unlocks held-back payout
        if (rel > 0) {
            s.held -= rel;
            _push(msg.sender, rel);
        }
        emit Paid(id, i, r.round, rel);
    }

    function bid(uint256 id, uint16 bps) external {
        Room storage r = rooms[id];
        require(r.round >= 1 && r.round <= r.size && block.timestamp < roundEnd(id), "not active");
        require(bps <= r.maxBidBps, "above max discount");
        uint8 i = _seatOf(id, msg.sender);
        Seat storage s = seats[id][i];
        require(!s.won && !s.defaulted && s.paidRound == r.round, "pay first / already won");
        require(r.bestSeat == 0 || bps > r.bestBps, "bid higher");
        r.bestSeat = i + 1;
        r.bestBps = bps;
        emit Bid(id, i, bps);
    }

    /// Anyone can close a round after its deadline: covers defaulters, pays the winner, splits dividends.
    function closeRound(uint256 id) external {
        Room storage r = rooms[id];
        require(r.round >= 1 && r.round <= r.size, "not active");
        require(block.timestamp >= roundEnd(id), "round still open");
        Seat[] storage ss = seats[id];

        // 1. defaults: seize held -> deposit -> guarantor stake into reserve; reserve pays their instalment
        for (uint8 i; i < ss.length; i++) {
            Seat storage s = ss[i];
            if (s.paidRound == r.round) continue;
            if (!s.defaulted) {
                s.defaulted = true;
                flagged[s.human] = true;
                uint256 seized = s.held + s.deposit + s.stake;
                s.held = 0;
                s.deposit = 0;
                s.stake = 0;
                r.reserve += seized;
                emit Defaulted(id, i, s.human, seized);
            }
            uint256 cover = r.reserve < r.instalment ? r.reserve : r.instalment;
            r.reserve -= cover;
            r.collected += cover; // ponytail: shortfall beyond backing shrinks the pot (shared by everyone)
            s.paidRound = r.round;
        }

        // 2. winner: top bidder, else first eligible seat in rotation
        uint8 w = r.bestSeat;
        uint16 bps = r.bestBps;
        if (w == 0) {
            for (uint8 i; i < ss.length; i++) {
                if (!ss[i].won && !ss[i].defaulted) {
                    w = i + 1;
                    break;
                }
            }
            bps = 0;
        }

        if (w != 0) _payout(id, w - 1, bps);
        r.bestSeat = 0;
        r.bestBps = 0;
        r.collected = 0;
        r.round++;
        if (r.round > r.size) _finish(id);
    }

    function _payout(uint256 id, uint8 wi, uint16 bps) internal {
        Room storage r = rooms[id];
        Seat[] storage ss = seats[id];
        Seat storage s = ss[wi];
        s.won = true;
        uint256 pot = r.collected;
        uint256 discount = (pot * bps) / 10000;
        uint256 commission = (pot * r.commissionBps) / 10000;
        uint256 others;
        for (uint8 i; i < ss.length; i++) if (i != wi && !ss[i].defaulted) others++;
        uint256 each = others == 0 ? 0 : discount / others;

        uint256 owe = uint256(r.size - r.round) * r.instalment;
        uint256 backing = s.deposit + s.stake;
        uint256 net = pot - discount - commission;
        uint256 held = owe > backing ? owe - backing : 0;
        if (held > net) held = net;
        s.held = held;

        if (commission > 0) _push(r.foreman, commission);
        if (each > 0) for (uint8 i; i < ss.length; i++) if (i != wi && !ss[i].defaulted) _push(ss[i].member, each);
        _push(s.member, net - held);
        emit Won(id, r.round, wi, net - held, held, each);
    }

    function _finish(uint256 id) internal {
        Room storage r = rooms[id];
        Seat[] storage ss = seats[id];
        uint256 left = r.reserve;
        r.reserve = 0;
        for (uint8 i; i < ss.length; i++) {
            Seat storage s = ss[i];
            if (s.defaulted) continue;
            completed[s.human]++;
            uint256 back = s.deposit + s.held;
            s.deposit = 0;
            s.held = 0;
            if (back > 0) _push(s.member, back);
            if (s.stake > 0) {
                uint256 st = s.stake;
                s.stake = 0;
                _push(s.guarantor, st);
            }
        }
        if (left > 0) _push(r.foreman, left); // ponytail: leftover reserve to foreman; pro-rata to guarantors if it matters
        emit Finished(id);
    }

    // ---------- views ----------

    function roundEnd(uint256 id) public view returns (uint256) {
        Room storage r = rooms[id];
        return r.start + uint256(r.round) * r.roundLen;
    }

    function roomCount() external view returns (uint256) {
        return rooms.length;
    }

    function getSeats(uint256 id) external view returns (Seat[] memory) {
        return seats[id];
    }

    function _seatOf(uint256 id, address a) internal view returns (uint8) {
        Seat[] storage ss = seats[id];
        for (uint8 i; i < ss.length; i++) if (ss[i].member == a) return i;
        revert("not a member");
    }

    function _pull(address from, uint256 amt) internal {
        require(usdc.transferFrom(from, address(this), amt), "transferFrom failed");
    }

    function _push(address to, uint256 amt) internal {
        require(usdc.transfer(to, amt), "transfer failed");
    }
}

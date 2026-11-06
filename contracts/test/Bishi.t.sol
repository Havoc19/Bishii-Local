// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Bishi.sol";
import "../src/MockUSDC.sol";

contract BishiTest is Test {
    MockUSDC usdc;
    Bishi b;
    address verifier = address(0x7E);
    address foreman = address(0xF0);
    address[4] m = [address(0xA1), address(0xA2), address(0xA3), address(0xA4)];
    address g = address(0x99);
    uint256 constant I = 20e6; // $20 instalment

    function setUp() public {
        usdc = new MockUSDC();
        b = new Bishi(IERC20(address(usdc)), verifier);
        _human(foreman, "foreman");
        _human(g, "guarantor");
        for (uint256 i; i < 4; i++) _human(m[i], bytes32(i + 1));
    }

    function _human(address a, bytes32 h) internal {
        vm.prank(verifier);
        b.registerHuman(a, h);
        usdc.mint(a, 1000e6);
        vm.prank(a);
        usdc.approve(address(b), type(uint256).max);
    }

    function _open(bool deposit, Bishi.Backing backing, uint256 gAmt) internal returns (uint256 id) {
        vm.prank(foreman);
        id = b.createRoom("bkc", I, 4, 1 days, 3000, 200, 200, deposit, backing, gAmt);
    }

    function _payAll(uint256 id) internal {
        for (uint256 i; i < 4; i++) {
            vm.prank(m[i]);
            b.pay(id);
        }
    }

    // Open room, no deposit: month-1 winner gets only the unbacked-safe part; rest released as they pay.
    function test_openRoomHoldsBackWhatIsNotBacked() public {
        uint256 id = _open(false, Bishi.Backing.None, 0);
        for (uint256 i; i < 4; i++) {
            vm.prank(m[i]);
            b.join(id);
        }
        _payAll(id);
        vm.prank(m[0]);
        b.bid(id, 1000); // 10%
        uint256 before = usdc.balanceOf(m[0]);
        vm.warp(block.timestamp + 1 days);
        b.closeRound(id);
        // pot 80, discount 8, commission 1.6 -> net 70.4, owes 60 unbacked -> 10.4 now
        assertEq(usdc.balanceOf(m[0]) - before, 10.4e6);
        // others get 8/3 dividend
        assertEq(usdc.balanceOf(m[1]), 1000e6 - I + uint256(8e6) / 3);
        // paying next round releases held money
        vm.prank(m[0]);
        b.pay(id);
        assertEq(usdc.balanceOf(m[0]) - before, 10.4e6); // paid 20, released 20
    }

    // Full guarantor: winner gets everything now; runner's default is covered by the guarantor stake.
    function test_fullGuarantorCoversRunaway() public {
        uint256 id = _open(false, Bishi.Backing.FullGuarantor, 0);
        for (uint256 i; i < 4; i++) {
            vm.prank(m[i]);
            b.join(id);
        }
        address[4] memory gs = [address(0xB1), address(0xB2), address(0xB3), address(0xB4)];
        for (uint8 i; i < 4; i++) {
            _human(gs[i], bytes32(uint256(100 + i)));
            vm.prank(gs[i]);
            b.guarantee(id, i);
        }
        _payAll(id);
        vm.prank(m[0]);
        b.bid(id, 1000);
        uint256 before = usdc.balanceOf(m[0]);
        vm.warp(block.timestamp + 1 days);
        b.closeRound(id);
        assertEq(usdc.balanceOf(m[0]) - before, 70.4e6);

        // m[0] runs: doesn't pay round 2
        for (uint256 i = 1; i < 4; i++) {
            vm.prank(m[i]);
            b.pay(id);
        }
        vm.warp(1 + 2 days); // absolute: via-ir caches block.timestamp within a test
        b.closeRound(id);
        assertTrue(b.flagged(bytes32(uint256(1))));
        (,,,,,,,,,,, uint8 round,,,,,,) = b.rooms(id);
        assertEq(round, 3); // circle kept going, fully paid from the stake

        // runner's new wallet: same human, still blocked
        address fresh = address(0xDEAD);
        _human(fresh, bytes32(uint256(1)));
        vm.prank(fresh);
        vm.expectRevert("flagged: defaulted before");
        b.createRoom("x", I, 4, 1 days, 0, 0, 0, false, Bishi.Backing.None, 0);
    }

    function test_deniedPaths() public {
        uint256 id = _open(false, Bishi.Backing.Guarantor, 40e6);
        // unverified user
        vm.prank(address(0xBAD));
        vm.expectRevert("verify with World ID first");
        b.join(id);
        // same human, second wallet
        vm.prank(m[0]);
        b.join(id);
        address alt = address(0xA11);
        _human(alt, bytes32(uint256(1)));
        vm.prank(alt);
        vm.expectRevert("one seat per human");
        b.join(id);
        // self-guarantee from second wallet
        vm.prank(alt);
        vm.expectRevert("guarantor can't be in this room");
        b.guarantee(id, 0);
        // name reuse
        vm.prank(foreman);
        vm.expectRevert("name taken");
        b.createRoom("bkc", I, 4, 1 days, 0, 0, 0, false, Bishi.Backing.None, 0);
    }
}

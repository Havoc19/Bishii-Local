// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/Bishi.sol";
import "../src/MockUSDC.sol";

/// USDC=<addr> uses real USDC (e.g. Arc testnet); unset deploys MockUSDC. VERIFIER = backend wallet.
contract Deploy is Script {
    function run() external {
        address usdc = vm.envOr("USDC", address(0));
        address verifier = vm.envAddress("VERIFIER");
        vm.startBroadcast();
        if (usdc == address(0)) usdc = address(new MockUSDC());
        Bishi b = new Bishi(IERC20(usdc), verifier);
        vm.stopBroadcast();
        console.log("USDC", usdc);
        console.log("BISHI", address(b));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { SignetSchemaRegistry } from "../src/SignetSchemaRegistry.sol";
import { SignetAttestationRegistry } from "../src/SignetAttestationRegistry.sol";
import { ISchemaRegistry } from "../src/interfaces/ISchemaRegistry.sol";

/// @notice Deploys the Signet core to a target network.
/// @dev Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url monad_testnet --broadcast --verify
///   Requires PRIVATE_KEY in the environment.
contract Deploy is Script {
    function run() external returns (SignetSchemaRegistry schemas, SignetAttestationRegistry attestations) {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        schemas = new SignetSchemaRegistry();
        attestations = new SignetAttestationRegistry(ISchemaRegistry(address(schemas)));
        vm.stopBroadcast();

        console2.log("SignetSchemaRegistry:     ", address(schemas));
        console2.log("SignetAttestationRegistry:", address(attestations));
    }
}

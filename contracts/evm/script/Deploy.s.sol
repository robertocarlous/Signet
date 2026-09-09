// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { SignetSchemaRegistry } from "../src/SignetSchemaRegistry.sol";
import { SignetAttestationRegistry } from "../src/SignetAttestationRegistry.sol";
import { ISchemaRegistry } from "../src/interfaces/ISchemaRegistry.sol";

/// @notice Deploys the Signet core (SchemaRegistry + AttestationRegistry) to a target network.
/// @dev The signer comes from the CLI, not the script — pick one:
///
///   # keystore (recommended, no plaintext key on disk):
///   cast wallet import signet-deployer --interactive
///   forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet \
///     --account signet-deployer --broadcast --verify -vvv
///
///   # raw key:
///   forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet \
///     --private-key 0xYOUR_KEY --broadcast -vvv
contract Deploy is Script {
    function run() external returns (SignetSchemaRegistry schemas, SignetAttestationRegistry attestations) {
        vm.startBroadcast();

        schemas = new SignetSchemaRegistry();
        attestations = new SignetAttestationRegistry(ISchemaRegistry(address(schemas)));

        vm.stopBroadcast();

        console2.log("chain id:                 ", block.chainid);
        console2.log("SignetSchemaRegistry:     ", address(schemas));
        console2.log("SignetAttestationRegistry:", address(attestations));
    }
}

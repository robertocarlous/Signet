// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { ISchemaRegistry } from "../src/interfaces/ISchemaRegistry.sol";
import { IAttestationRegistry } from "../src/interfaces/IAttestationRegistry.sol";
import { PersonhoodResolver } from "../src/resolvers/PersonhoodResolver.sol";
import { PasskeyAttester } from "../src/PasskeyAttester.sol";

/// @notice Deploys the M2 passkey / personhood layer on top of an existing Signet core.
/// @dev Wires PersonhoodResolver <-> PasskeyAttester with CREATE-address prediction,
///      so neither needs a post-deploy setter and both stay immutable.
///
///   Env: SCHEMA_REGISTRY, ATTESTATION_REGISTRY, optional REQUIRE_UV (default false).
///
///   forge script script/DeployPersonhood.s.sol:DeployPersonhood \
///     --rpc-url monad_testnet --private-key 0x... --broadcast -vvv
contract DeployPersonhood is Script {
    string internal constant PERSONHOOD_DEFINITION =
        '{"name":"proof-of-personhood","version":"1","description":"Holder controls a WebAuthn passkey; one attestation per credential.","fields":[{"name":"pubKeyX","type":"uint256"},{"name":"pubKeyY","type":"uint256"}]}';

    function run() external returns (PersonhoodResolver resolver, PasskeyAttester attester, bytes32 schemaUID) {
        ISchemaRegistry schemaRegistry = ISchemaRegistry(vm.envAddress("SCHEMA_REGISTRY"));
        IAttestationRegistry attestationRegistry = IAttestationRegistry(vm.envAddress("ATTESTATION_REGISTRY"));
        bool requireUV = vm.envOr("REQUIRE_UV", false);

        vm.startBroadcast();
        address deployer = msg.sender;
        uint256 nonce = vm.getNonce(deployer);

        // tx nonce+0: resolver, nonce+1: register(), nonce+2: attester
        address predictedAttester = vm.computeCreateAddress(deployer, nonce + 2);

        resolver = new PersonhoodResolver(address(attestationRegistry), predictedAttester);
        schemaUID = schemaRegistry.register(PERSONHOOD_DEFINITION, address(resolver), true);
        attester = new PasskeyAttester(attestationRegistry, schemaUID, requireUV);

        vm.stopBroadcast();

        require(address(attester) == predictedAttester, "CREATE address prediction mismatch");

        console2.log("chain id:          ", block.chainid);
        console2.log("PersonhoodResolver:", address(resolver));
        console2.log("PasskeyAttester:   ", address(attester));
        console2.logBytes32(schemaUID);
    }
}

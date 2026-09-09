// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { PasskeyAttester } from "../src/PasskeyAttester.sol";
import { IAttestationRegistry } from "../src/interfaces/IAttestationRegistry.sol";
import { Attestation, WebAuthnAuth } from "../src/lib/Types.sol";
import { PasskeySigner } from "../test/utils/PasskeySigner.sol";

/// @notice One-shot live check of the passkey personhood flow.
/// @dev Mints a synthetic P-256 passkey, builds a real WebAuthn assertion over
///      `attester.challenge(subject, x, y)`, and relays `attestPersonhood`.
///
///   Env: PASSKEY_ATTESTER, SUBJECT (defaults to broadcaster), PASSKEY_SK (default 0xB0B).
///
///   forge script script/SmokePersonhood.s.sol:SmokePersonhood \
///     --rpc-url monad_testnet --private-key 0x... --broadcast -vvv
contract SmokePersonhood is Script {
    function run() external returns (bytes32 uid) {
        PasskeyAttester attester = PasskeyAttester(vm.envAddress("PASSKEY_ATTESTER"));
        uint256 passkeySk = vm.envOr("PASSKEY_SK", uint256(0xB0B));

        vm.startBroadcast();
        address subject = vm.envOr("SUBJECT", msg.sender);

        (uint256 x, uint256 y) = PasskeySigner.publicKey(passkeySk);
        WebAuthnAuth memory auth = PasskeySigner.sign(passkeySk, attester.challenge(subject, x, y), false);

        uid = attester.attestPersonhood(subject, x, y, auth);
        vm.stopBroadcast();

        IAttestationRegistry reg = attester.attestationRegistry();
        Attestation memory a = reg.getAttestation(uid);

        console2.log("subject:          ", subject);
        console2.log("attester (onchain):", a.attester);
        console2.log("isValid:          ", reg.isValid(uid));
        console2.logBytes32(uid);
    }
}

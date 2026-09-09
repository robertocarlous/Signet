// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Vm } from "forge-std/Vm.sol";
import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";
import { WebAuthnAuth } from "../../src/lib/Types.sol";

/// @notice Test-only helper that mints a synthetic passkey and produces WebAuthn
///         assertions with `vm.publicKeyP256` / `vm.signP256`.
library PasskeySigner {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @dev secp256r1 group order.
    uint256 internal constant P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551;

    function publicKey(uint256 privateKey) internal pure returns (uint256 x, uint256 y) {
        (x, y) = vm.publicKeyP256(privateKey);
    }

    /// @notice Build a WebAuthn assertion over `challenge` for the given passkey.
    /// @param privateKey P-256 private key.
    /// @param challenge The bytes to embed (base64url) as the clientData challenge.
    /// @param userVerified Sets the UV flag (0x04) in authenticatorData in addition to UP (0x01).
    function sign(uint256 privateKey, bytes memory challenge, bool userVerified)
        internal
        pure
        returns (WebAuthnAuth memory auth)
    {
        // clientDataJSON laid out so the member offsets are fixed:
        //   {"type":"webauthn.get","challenge":"<b64url>","origin":"https://signet.test"}
        //    ^1                    ^23
        string memory clientDataJSON = string.concat(
            '{"type":"webauthn.get","challenge":"', Base64.encodeURL(challenge), '","origin":"https://signet.test"}'
        );

        bytes1 flags = userVerified ? bytes1(0x05) : bytes1(0x01); // UP | (UV)
        bytes memory authenticatorData = abi.encodePacked(keccak256("signet.test rpIdHash"), flags, bytes4(0x00000001));

        bytes32 messageHash = sha256(abi.encodePacked(authenticatorData, sha256(bytes(clientDataJSON))));
        (bytes32 r, bytes32 s) = vm.signP256(privateKey, messageHash);

        // WebAuthn / P256.verify require low-s.
        if (uint256(s) > P256_N / 2) {
            s = bytes32(P256_N - uint256(s));
        }

        auth = WebAuthnAuth({
            authenticatorData: authenticatorData,
            clientDataJSON: clientDataJSON,
            challengeIndex: 23,
            typeIndex: 1,
            r: r,
            s: s
        });
    }
}

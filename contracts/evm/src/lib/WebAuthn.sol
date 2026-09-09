// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { P256 } from "@openzeppelin/contracts/utils/cryptography/P256.sol";
import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";
import { WebAuthnAuth } from "./Types.sol";

/// @title WebAuthn
/// @notice Verifies a WebAuthn authentication assertion (a passkey signature) on chain.
/// @dev Design follows the reference implementation base-org/webauthn-sol, using
///      OpenZeppelin's `P256.verify` (RIP-7212 precompile with a Solidity fallback)
///      and `Base64.encodeURL`.
///
///      This is the EVM analogue of the BLS delegated-signature path in
///      `protocol/src/instructions/delegation.rs`: an off-chain key authorises an
///      action, anyone submits it. Here the key lives in a device secure enclave
///      and the signature is a WebAuthn assertion.
///
///      Steps (all must hold):
///        1. `s` is not malleable (`s <= N/2`) — also enforced by `P256.verify`.
///        2. `clientDataJSON` declares `"type":"webauthn.get"` at `typeIndex`.
///        3. `clientDataJSON` carries `"challenge":"<base64url(challenge)>"` at `challengeIndex`.
///        4. authenticator flags: User Present (0x01) set; User Verified (0x04) if required.
///        5. P-256 verify of `sha256(authenticatorData ‖ sha256(clientDataJSON))`.
library WebAuthn {
    /// @dev secp256r1 group order / 2. Signatures with `s` above this are malleable.
    uint256 internal constant P256_N_DIV_2 = 0x7fffffff800000007fffffffffffffffde737d56d38bcf4279dce5617e3192a8;

    bytes32 private constant EXPECTED_TYPE_HASH = keccak256(bytes('"type":"webauthn.get"'));

    /// @notice Verify a passkey assertion over `challenge` for public key `(x, y)`.
    /// @param challenge The bytes the authenticator was asked to sign (embedded, base64url, in clientDataJSON).
    /// @param requireUserVerification If true, the UV flag must be set (biometric / PIN, not just presence).
    /// @param auth The assertion returned by the authenticator.
    /// @param x P-256 public key X coordinate.
    /// @param y P-256 public key Y coordinate.
    function verify(
        bytes memory challenge,
        bool requireUserVerification,
        WebAuthnAuth memory auth,
        uint256 x,
        uint256 y
    ) internal view returns (bool) {
        // 1. Reject malleable signatures early (P256.verify also enforces this).
        if (uint256(auth.s) > P256_N_DIV_2) return false;

        bytes memory clientData = bytes(auth.clientDataJSON);

        // 2. `"type":"webauthn.get"` at typeIndex.
        if (!_equalAt(clientData, auth.typeIndex, bytes('"type":"webauthn.get"'), EXPECTED_TYPE_HASH)) {
            return false;
        }

        // 3. `"challenge":"<b64url>"` at challengeIndex.
        bytes memory expectedChallenge = abi.encodePacked('"challenge":"', bytes(Base64.encodeURL(challenge)), '"');
        if (!_equalAt(clientData, auth.challengeIndex, expectedChallenge, keccak256(expectedChallenge))) {
            return false;
        }

        // 4. Authenticator data flags live in byte 32 (after the 32-byte rpIdHash).
        if (auth.authenticatorData.length < 37) return false;
        if (auth.authenticatorData[32] & 0x01 != 0x01) return false; // User Present
        if (requireUserVerification && auth.authenticatorData[32] & 0x04 != 0x04) return false; // User Verified

        // 5. P-256 verification.
        bytes32 clientDataHash = sha256(clientData);
        bytes32 messageHash = sha256(abi.encodePacked(auth.authenticatorData, clientDataHash));
        return P256.verify(messageHash, auth.r, auth.s, bytes32(x), bytes32(y));
    }

    /// @dev True if `needle` appears in `haystack` starting exactly at `offset`.
    ///      `needleHash` is `keccak256(needle)`, passed in to avoid re-hashing a literal.
    function _equalAt(bytes memory haystack, uint256 offset, bytes memory needle, bytes32 needleHash)
        private
        pure
        returns (bool)
    {
        uint256 len = needle.length;
        if (offset + len < offset || offset + len > haystack.length) return false;

        bytes memory slice = new bytes(len);
        for (uint256 i = 0; i < len; ++i) {
            slice[i] = haystack[offset + i];
        }
        return keccak256(slice) == needleHash;
    }
}

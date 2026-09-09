// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    Attestation,
    AttestationRequest,
    DelegatedAttestationRequest,
    RevocationRequest,
    DelegatedRevocationRequest
} from "../lib/Types.sol";

/// @title IAttestationRegistry
/// @notice Core attestation engine: create / revoke, direct or delegated.
/// @dev EVM port of `protocol/src/instructions/{attestation,delegation}.rs`.
///      Multi-attestation per (schema, subject) is supported via per-attester nonces.
interface IAttestationRegistry {
    /// @notice Emitted on every new attestation. Mirrors Soroban ("ATTEST","CREATE").
    event Attested(
        bytes32 indexed uid,
        bytes32 indexed schemaUID,
        address indexed subject,
        address attester,
        uint64 nonce,
        uint64 time
    );

    /// @notice Emitted on revocation. Mirrors Soroban ("ATTEST","REVOKE").
    event Revoked(
        bytes32 indexed uid, bytes32 indexed schemaUID, address indexed subject, address attester, uint64 revocationTime
    );

    // --- direct ---

    /// @notice Create an attestation; `msg.sender` is the attester.
    function attest(AttestationRequest calldata request) external returns (bytes32 uid);

    /// @notice Revoke an attestation; `msg.sender` must be its attester.
    function revoke(RevocationRequest calldata request) external;

    // --- delegated (signed off-chain, relayed by anyone) ---

    /// @notice Create an attestation on behalf of `request.attester` using their EIP-712 signature.
    function attestByDelegation(DelegatedAttestationRequest calldata request) external returns (bytes32 uid);

    /// @notice Revoke on behalf of `request.revoker` using their EIP-712 signature.
    function revokeByDelegation(DelegatedRevocationRequest calldata request) external;

    // --- views ---

    /// @notice Fetch an attestation by UID. Reverts AttestationNotFound if unknown.
    function getAttestation(bytes32 uid) external view returns (Attestation memory);

    /// @notice Whether an attestation UID exists.
    function isAttested(bytes32 uid) external view returns (bool);

    /// @notice True if the attestation exists, is not revoked, and is not past expiry.
    function isValid(bytes32 uid) external view returns (bool);

    /// @notice Current attestation nonce for an attester (next expected value).
    function getNonce(address attester) external view returns (uint64);

    /// @notice Current delegated-revocation nonce for a revoker.
    function getRevocationNonce(address revoker) external view returns (uint64);
}

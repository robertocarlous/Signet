// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Signet UID derivation
/// @notice Deterministic identifiers for schemas and attestations.
/// @dev EVM port of `protocol/src/utils.rs::{generate_schema_uid, generate_attestation_uid}`.
///
///      Divergence from Stellar: Soroban hashes XDR-encoded values (schema UID
///      with SHA-256, attestation UID with Keccak-256). On EVM both use
///      keccak256 over `abi.encode`/`abi.encodePacked`. The *input fields* and
///      their ordering are preserved, including:
///        - `revocable` participates in the schema UID (Stellar C-CONTRACT-3),
///          so revocable/non-revocable variants of one definition don't collide.
///        - the registry address and `attester` participate in the attestation
///          UID (Stellar HAL-01), preventing cross-deployment and cross-attester
///          collisions for the same (schema, subject, nonce) tuple.
///
///      The off-chain helper in the evm-sdk package MUST reproduce these exact
///      byte layouts.
library SignetUID {
    /// @dev Domain-separation tags. Versioned to allow future formula upgrades.
    bytes32 internal constant SCHEMA_DOMAIN = keccak256("SIGNET_SCHEMA_UID_V1");
    bytes32 internal constant ATTEST_DOMAIN = keccak256("SIGNET_ATTEST_UID_V1");

    /// @notice Derive a schema UID.
    /// @param definition The schema body.
    /// @param authority The registering address.
    /// @param resolver The resolver contract (address(0) if none).
    /// @param revocable Whether attestations under this schema may be revoked.
    function schemaUID(string memory definition, address authority, address resolver, bool revocable)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(SCHEMA_DOMAIN, keccak256(bytes(definition)), authority, resolver, revocable));
    }

    /// @notice Derive an attestation UID.
    /// @param registry The AttestationRegistry address (deployment binding).
    /// @param schemaUID_ The schema this attestation follows.
    /// @param subject The address the attestation is about.
    /// @param attester The address that authored the attestation.
    /// @param nonce The attester's sequential nonce for this attestation.
    function attestationUID(address registry, bytes32 schemaUID_, address subject, address attester, uint64 nonce)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(ATTEST_DOMAIN, registry, schemaUID_, subject, attester, nonce));
    }
}

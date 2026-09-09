// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Signet core data types
/// @notice EVM port of the Soroban `protocol` crate's `state.rs` structs.
///         Field names and semantics are kept 1:1 with the Stellar
///         implementation so the SDK, indexer, and docs stay chain-agnostic.
///         The only intentional divergences:
///           - `value` is `bytes` (ABI/schema-encoded) instead of a Soroban `String`.
///           - delegated auth uses EIP-712 ECDSA signatures instead of BLS12-381.
///             (A WebAuthn/P256 authorization path is layered on top in M2.)

/// @notice A schema definition that attestations are structured against.
/// @dev Mirrors `state.rs::Schema`. `resolver == address(0)` means "no resolver".
struct Schema {
    address authority; // who registered the schema
    address resolver; // optional resolver contract (address(0) = none)
    bool revocable; // whether attestations under this schema may be revoked
    string definition; // schema body (JSON / ABI signature / arbitrary)
}

/// @notice A single attestation record.
/// @dev Mirrors `state.rs::Attestation`. `(schemaUID, subject, nonce)` is unique
///      per attester; `uid` is the global identifier (see SignetUID).
struct Attestation {
    bytes32 uid;
    bytes32 schemaUID;
    address subject; // who the claim is about
    address attester; // who authored the claim (original signer for delegated)
    uint64 nonce; // per-attester sequential nonce
    uint64 time; // creation timestamp
    uint64 expirationTime; // 0 = no expiry
    uint64 revocationTime; // 0 = not revoked
    bool revoked;
    bytes data; // schema-encoded attestation value
}

/// @notice Arguments for a direct attestation (`msg.sender` is the attester).
/// @dev Mirrors the fields the Soroban `attest` instruction takes.
struct AttestationRequest {
    bytes32 schemaUID;
    address subject;
    uint64 expirationTime; // 0 = no expiry
    bytes data;
}

/// @notice Arguments for a delegated attestation (signed off-chain, submitted by anyone).
/// @dev Mirrors `state.rs::DelegatedAttestationRequest`; `signature` is an
///      EIP-712 ECDSA signature over the ATTEST typehash (see SignetEIP712).
struct DelegatedAttestationRequest {
    bytes32 schemaUID;
    address subject;
    address attester; // original signer
    uint64 nonce; // must equal the attester's current nonce
    uint64 deadline; // signature validity cutoff
    uint64 expirationTime; // attestation expiry (0 = none)
    bytes data;
    bytes signature; // abi.encodePacked(r, s, v)
}

/// @notice Arguments for a direct revocation.
struct RevocationRequest {
    bytes32 attestationUID;
}

/// @notice Arguments for a delegated revocation.
/// @dev Mirrors `state.rs::DelegatedRevocationRequest`.
struct DelegatedRevocationRequest {
    bytes32 attestationUID;
    address revoker; // original signer (must be the attestation's attester)
    uint64 nonce; // revoker's current revocation nonce
    uint64 deadline;
    bytes signature;
}

/// @notice Descriptive metadata a resolver advertises. Not consumed by the protocol.
/// @dev Mirrors `resolvers::interface::ResolverMetadata`.
struct ResolverMetadata {
    string name;
    string version;
    string resolverType;
}

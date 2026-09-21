// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Signet protocol errors
/// @notice Custom errors mirroring `protocol/src/errors.rs`. Kept as a shared
///         library so the registries, resolvers, and SDK decode a single set.
library SignetErrors {
    // --- schema ---
    error SchemaNotFound();
    error SchemaAlreadyExists();
    error InvalidSchemaDefinition();

    // --- attestation lifecycle ---
    error AttestationExists();
    error AttestationNotFound();
    error AttestationNotRevocable();
    error AlreadyRevoked();
    error AttestationExpired();
    error InvalidAttestationValue();

    // --- authorization ---
    error NotAuthorized();
    error NotInitialized();
    error AlreadyInitialized();

    // --- delegation / signatures ---
    error InvalidNonce();
    error InvalidDeadline();
    error ExpiredSignature();
    error InvalidSignature();

    // --- resolver dispatch ---
    error ResolverRejected(); // resolver returned false from onAttest/onRevoke
    error ResolverCallFailed(); // resolver reverted

    // --- passkey / personhood ---
    error BadPasskeySignature(); // WebAuthn assertion failed to verify
    error PasskeyAlreadyEnrolled(); // this credential has already claimed personhood
    error SubjectAlreadyVerified(); // subject already holds a personhood attestation
    error InvalidPublicKey(); // (0,0) or otherwise not a usable P-256 point
    error NotEnrolled(); // subject has no personhood attestation to act on

    // --- passkey / guardians & recovery ---
    error TooFewGuardians(); // fewer than MIN_GUARDIANS addresses given
    error InvalidThreshold(); // threshold < 2 or > guardians.length
    error DuplicateGuardian(); // same address appears twice in a guardian set
    error NoGuardiansConfigured(); // recovery attempted but subject never called setGuardians
    error InsufficientGuardianApprovals(); // fewer than `threshold` distinct valid guardian signatures

    // --- misc ---
    error InvalidUID();
    error ZeroAddress();
}

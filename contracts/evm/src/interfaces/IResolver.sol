// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Attestation, ResolverMetadata } from "../lib/Types.sol";

/// @title IResolver
/// @notice Cross-contract ABI the AttestationRegistry uses to call resolvers.
/// @dev EVM port of `protocol/src/interfaces/resolver.rs::Resolver`.
///
///      Lifecycle hooks:
///        - `onAttest`  : pre-creation gate. Return `false` (or revert) to block.
///        - `onRevoke`  : pre-revocation gate. Same semantics.
///        - `onResolve` : post-processing side effects (rewards, cleanup, …).
///                        Best-effort — the registry calls it and ignores failure.
///        - `metadata`  : discovery only, not consumed by the protocol.
///
///      Security model: `onAttest` / `onRevoke` are CRITICAL and must fully
///      validate before returning true. `onResolve` is NON-CRITICAL.
interface IResolver {
    /// @notice Called before an attestation is written. CRITICAL for access control.
    /// @return allowed True to proceed, false to reject (registry reverts ResolverRejected).
    function onAttest(Attestation calldata attestation) external returns (bool allowed);

    /// @notice Called before an attestation is marked revoked. CRITICAL.
    /// @return allowed True to proceed, false to reject.
    function onRevoke(Attestation calldata attestation) external returns (bool allowed);

    /// @notice Called after a successful attestation or revocation. Best-effort.
    /// @param attestationUID The affected attestation.
    /// @param attester Forwarded for accounting; resolver looks up its own state by UID.
    function onResolve(bytes32 attestationUID, address attester) external;

    /// @notice Descriptive metadata for discovery/integration.
    function metadata() external view returns (ResolverMetadata memory);
}

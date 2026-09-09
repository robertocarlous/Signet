// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IResolver } from "../interfaces/IResolver.sol";
import { Attestation, ResolverMetadata } from "../lib/Types.sol";
import { SignetErrors } from "../lib/Errors.sol";

/// @title SchemaResolver
/// @notice Abstract base for Signet resolvers. EVM port of the resolvers crate's
///         `DefaultResolver` scaffolding: it wires the `IResolver` hooks, restricts
///         calls to the bound AttestationRegistry, and gives subclasses simple
///         `_onAttest` / `_onRevoke` overrides to implement policy.
abstract contract SchemaResolver is IResolver {
    /// @notice The only address allowed to invoke the lifecycle hooks.
    address public immutable attestationRegistry;

    constructor(address attestationRegistry_) {
        if (attestationRegistry_ == address(0)) revert SignetErrors.ZeroAddress();
        attestationRegistry = attestationRegistry_;
    }

    modifier onlyRegistry() {
        if (msg.sender != attestationRegistry) revert SignetErrors.NotAuthorized();
        _;
    }

    /// @inheritdoc IResolver
    function onAttest(Attestation calldata attestation) external onlyRegistry returns (bool) {
        return _onAttest(attestation);
    }

    /// @inheritdoc IResolver
    function onRevoke(Attestation calldata attestation) external onlyRegistry returns (bool) {
        return _onRevoke(attestation);
    }

    /// @inheritdoc IResolver
    function onResolve(bytes32 attestationUID, address attester) external onlyRegistry {
        _onResolve(attestationUID, attester);
    }

    /// @inheritdoc IResolver
    function metadata() external view virtual returns (ResolverMetadata memory);

    // --- overridable policy ---

    /// @dev Default: accept everything. Override to gate attestations.
    function _onAttest(Attestation calldata) internal virtual returns (bool) {
        return true;
    }

    /// @dev Default: accept everything. Override to gate revocations.
    function _onRevoke(Attestation calldata) internal virtual returns (bool) {
        return true;
    }

    /// @dev Default: no-op. Override for rewards / cleanup / notifications.
    function _onResolve(bytes32 attestationUID, address attester) internal virtual { }
}

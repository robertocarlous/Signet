// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { SchemaResolver } from "./SchemaResolver.sol";
import { Attestation, ResolverMetadata } from "../lib/Types.sol";
import { SignetErrors } from "../lib/Errors.sol";

/// @title PersonhoodResolver
/// @notice Locks a schema so the ONLY entity that can attest against it is the
///         `PasskeyAttester`. Every personhood attestation therefore carries a
///         verified WebAuthn assertion behind it, and the "one per human" rule
///         is enforced upstream in the attester.
/// @dev Attach this as the resolver when registering the personhood schema.
contract PersonhoodResolver is SchemaResolver {
    /// @notice The sole permitted attester for the personhood schema.
    address public immutable passkeyAttester;

    constructor(address attestationRegistry_, address passkeyAttester_) SchemaResolver(attestationRegistry_) {
        if (passkeyAttester_ == address(0)) revert SignetErrors.ZeroAddress();
        passkeyAttester = passkeyAttester_;
    }

    /// @inheritdoc SchemaResolver
    function _onAttest(Attestation calldata attestation) internal view override returns (bool) {
        return attestation.attester == passkeyAttester;
    }

    /// @inheritdoc SchemaResolver
    function _onRevoke(Attestation calldata attestation) internal view override returns (bool) {
        return attestation.attester == passkeyAttester;
    }

    /// @inheritdoc SchemaResolver
    function metadata() external pure override returns (ResolverMetadata memory) {
        return ResolverMetadata({ name: "PersonhoodResolver", version: "0.1.0", resolverType: "personhood" });
    }
}

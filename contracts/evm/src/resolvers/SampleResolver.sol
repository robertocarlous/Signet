// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { SchemaResolver } from "./SchemaResolver.sol";
import { Attestation, ResolverMetadata } from "../lib/Types.sol";

/// @title SampleResolver
/// @notice Minimal reference resolver: only an allowlisted set of attesters may
///         attest against schemas that point at this contract. Demonstrates the
///         override surface; not intended for production.
contract SampleResolver is SchemaResolver {
    address public immutable owner;
    mapping(address attester => bool allowed) public allowlisted;

    event AllowlistUpdated(address indexed attester, bool allowed);

    constructor(address attestationRegistry_, address owner_) SchemaResolver(attestationRegistry_) {
        owner = owner_;
    }

    /// @notice Owner toggles who may attest through this resolver.
    function setAllowlisted(address attester, bool allowed) external {
        require(msg.sender == owner, "not owner");
        allowlisted[attester] = allowed;
        emit AllowlistUpdated(attester, allowed);
    }

    /// @inheritdoc SchemaResolver
    function _onAttest(Attestation calldata attestation) internal view override returns (bool) {
        return allowlisted[attestation.attester];
    }

    /// @inheritdoc SchemaResolver
    function metadata() external pure override returns (ResolverMetadata memory) {
        return ResolverMetadata({ name: "SampleResolver", version: "0.1.0", resolverType: "allowlist" });
    }
}

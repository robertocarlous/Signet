// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Schema } from "../lib/Types.sol";

/// @title ISchemaRegistry
/// @notice Permissionless registry of attestation schemas.
/// @dev EVM port of `protocol/src/instructions/schema.rs`. Anyone may register a
///      schema; the caller becomes its `authority`. UID = SignetUID.schemaUID(...).
interface ISchemaRegistry {
    /// @notice Emitted when a new schema is registered.
    event SchemaRegistered(
        bytes32 indexed uid, address indexed authority, address resolver, bool revocable, string definition
    );

    /// @notice Register a new schema.
    /// @param definition The schema body (JSON / ABI signature / arbitrary text).
    /// @param resolver Optional resolver contract (address(0) for none).
    /// @param revocable Whether attestations under this schema may be revoked.
    /// @return uid The derived schema UID.
    function register(string calldata definition, address resolver, bool revocable) external returns (bytes32 uid);

    /// @notice Fetch a schema by UID. Reverts SchemaNotFound if unknown.
    function getSchema(bytes32 uid) external view returns (Schema memory);

    /// @notice Whether a schema UID exists.
    function isRegistered(bytes32 uid) external view returns (bool);
}

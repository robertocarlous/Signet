// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ISchemaRegistry } from "./interfaces/ISchemaRegistry.sol";
import { Schema } from "./lib/Types.sol";
import { SignetErrors } from "./lib/Errors.sol";
import { SignetUID } from "./lib/SignetUID.sol";

/// @title SignetSchemaRegistry
/// @notice Permissionless schema registry. EVM port of `instructions/schema.rs`.
/// @dev No admin, no upgrade path — schemas are immutable once registered.
contract SignetSchemaRegistry is ISchemaRegistry {
    /// @dev uid => schema. `authority == address(0)` means "not registered".
    mapping(bytes32 uid => Schema schema) private _schemas;

    /// @inheritdoc ISchemaRegistry
    function register(string calldata definition, address resolver, bool revocable) external returns (bytes32 uid) {
        if (bytes(definition).length == 0) revert SignetErrors.InvalidSchemaDefinition();

        uid = SignetUID.schemaUID(definition, msg.sender, resolver, revocable);

        // `revocable` is part of the UID input, so identical definitions with
        // different revocability get distinct UIDs (Stellar C-CONTRACT-3).
        if (_schemas[uid].authority != address(0)) revert SignetErrors.SchemaAlreadyExists();

        _schemas[uid] =
            Schema({ authority: msg.sender, resolver: resolver, revocable: revocable, definition: definition });

        emit SchemaRegistered(uid, msg.sender, resolver, revocable, definition);
    }

    /// @inheritdoc ISchemaRegistry
    function getSchema(bytes32 uid) external view returns (Schema memory schema) {
        schema = _schemas[uid];
        if (schema.authority == address(0)) revert SignetErrors.SchemaNotFound();
    }

    /// @inheritdoc ISchemaRegistry
    function isRegistered(bytes32 uid) external view returns (bool) {
        return _schemas[uid].authority != address(0);
    }
}

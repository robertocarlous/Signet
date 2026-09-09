// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IAttestationRegistry } from "./interfaces/IAttestationRegistry.sol";
import { ISchemaRegistry } from "./interfaces/ISchemaRegistry.sol";
import { IResolver } from "./interfaces/IResolver.sol";
import {
    Schema,
    Attestation,
    AttestationRequest,
    DelegatedAttestationRequest,
    RevocationRequest,
    DelegatedRevocationRequest
} from "./lib/Types.sol";
import { SignetErrors } from "./lib/Errors.sol";
import { SignetUID } from "./lib/SignetUID.sol";

/// @title SignetAttestationRegistry
/// @notice Core attestation engine. EVM port of `instructions/{attestation,delegation}.rs`.
/// @dev Bound to one SchemaRegistry at deploy time. No admin — the protocol layer
///      is immutable; policy lives in per-schema resolver contracts.
contract SignetAttestationRegistry is IAttestationRegistry {
    /// @notice The schema registry this engine reads definitions from.
    ISchemaRegistry public immutable schemaRegistry;

    /// @dev uid => attestation. `attester == address(0)` means "not found".
    mapping(bytes32 uid => Attestation attestation) private _attestations;
    /// @dev attester => next attestation nonce.
    mapping(address attester => uint64 nonce) private _nonces;
    /// @dev revoker => next delegated-revocation nonce (independent of _nonces).
    mapping(address revoker => uint64 nonce) private _revocationNonces;

    constructor(ISchemaRegistry schemaRegistry_) {
        if (address(schemaRegistry_) == address(0)) revert SignetErrors.ZeroAddress();
        schemaRegistry = schemaRegistry_;
    }

    // ---------------------------------------------------------------------
    // Direct attestation
    // ---------------------------------------------------------------------

    /// @inheritdoc IAttestationRegistry
    function attest(AttestationRequest calldata request) external returns (bytes32 uid) {
        return _attest(request.schemaUID, request.subject, msg.sender, request.expirationTime, request.data);
    }

    /// @inheritdoc IAttestationRegistry
    function revoke(RevocationRequest calldata request) external {
        _revoke(request.attestationUID, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Delegated attestation  — TODO(M1 follow-up): EIP-712 verification
    // ---------------------------------------------------------------------

    /// @inheritdoc IAttestationRegistry
    /// @dev TODO: recover `request.attester` from an EIP-712 signature over the
    ///      ATTEST typehash, enforce `nonce == _nonces[attester]` and
    ///      `block.timestamp <= deadline`, then call `_attest(...)`.
    ///      Ported from `delegation.rs::attest_by_delegation` (BLS -> ECDSA).
    function attestByDelegation(DelegatedAttestationRequest calldata request) external returns (bytes32 uid) {
        request; // silence unused warning until implemented
        revert("TODO: attestByDelegation");
    }

    /// @inheritdoc IAttestationRegistry
    /// @dev TODO: mirror `attestByDelegation` for revocation
    ///      (`delegation.rs::revoke_by_delegation`), using `_revocationNonces`.
    function revokeByDelegation(DelegatedRevocationRequest calldata request) external {
        request;
        revert("TODO: revokeByDelegation");
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @inheritdoc IAttestationRegistry
    function getAttestation(bytes32 uid) external view returns (Attestation memory attestation) {
        attestation = _attestations[uid];
        if (attestation.attester == address(0)) revert SignetErrors.AttestationNotFound();
    }

    /// @inheritdoc IAttestationRegistry
    function isAttested(bytes32 uid) external view returns (bool) {
        return _attestations[uid].attester != address(0);
    }

    /// @inheritdoc IAttestationRegistry
    function isValid(bytes32 uid) external view returns (bool) {
        Attestation storage a = _attestations[uid];
        if (a.attester == address(0) || a.revoked) return false;
        if (a.expirationTime != 0 && block.timestamp > a.expirationTime) return false;
        return true;
    }

    /// @inheritdoc IAttestationRegistry
    function getNonce(address attester) external view returns (uint64) {
        return _nonces[attester];
    }

    /// @inheritdoc IAttestationRegistry
    function getRevocationNonce(address revoker) external view returns (uint64) {
        return _revocationNonces[revoker];
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev Shared create path for direct and (later) delegated attestation.
    ///      Ported from `attestation.rs::attest`.
    function _attest(bytes32 schemaUID, address subject, address attester, uint64 expirationTime, bytes calldata data)
        internal
        returns (bytes32 uid)
    {
        Schema memory schema = schemaRegistry.getSchema(schemaUID); // reverts SchemaNotFound

        uint64 nonce = _nonces[attester];
        uid = SignetUID.attestationUID(address(this), schemaUID, subject, attester, nonce);
        if (_attestations[uid].attester != address(0)) revert SignetErrors.AttestationExists();

        Attestation memory a = Attestation({
            uid: uid,
            schemaUID: schemaUID,
            subject: subject,
            attester: attester,
            nonce: nonce,
            time: uint64(block.timestamp),
            expirationTime: expirationTime,
            revocationTime: 0,
            revoked: false,
            data: data
        });

        // Effects before the external resolver call (checks-effects-interactions).
        _attestations[uid] = a;
        unchecked {
            _nonces[attester] = nonce + 1;
        }

        _runResolverOnAttest(schema.resolver, a);

        emit Attested(uid, schemaUID, subject, attester, nonce, a.time);
    }

    /// @dev Shared revoke path. Ported from `attestation.rs::revoke_attestation`.
    function _revoke(bytes32 uid, address caller) internal {
        Attestation storage a = _attestations[uid];
        if (a.attester == address(0)) revert SignetErrors.AttestationNotFound();
        if (a.attester != caller) revert SignetErrors.NotAuthorized();
        if (a.revoked) revert SignetErrors.AlreadyRevoked();

        Schema memory schema = schemaRegistry.getSchema(a.schemaUID);
        if (!schema.revocable) revert SignetErrors.AttestationNotRevocable();

        a.revoked = true;
        a.revocationTime = uint64(block.timestamp);

        _runResolverOnRevoke(schema.resolver, a);

        emit Revoked(uid, a.schemaUID, a.subject, a.attester, a.revocationTime);
    }

    /// @dev CRITICAL gate: a `false` return or a revert blocks the attestation.
    function _runResolverOnAttest(address resolver, Attestation memory a) private {
        if (resolver == address(0)) return;
        try IResolver(resolver).onAttest(a) returns (bool allowed) {
            if (!allowed) revert SignetErrors.ResolverRejected();
        } catch {
            revert SignetErrors.ResolverCallFailed();
        }
        // Best-effort post hook (Stellar `try_onresolve` — failures ignored).
        try IResolver(resolver).onResolve(a.uid, a.attester) { } catch { }
    }

    /// @dev CRITICAL gate for revocation, mirroring `_runResolverOnAttest`.
    function _runResolverOnRevoke(address resolver, Attestation memory a) private {
        if (resolver == address(0)) return;
        try IResolver(resolver).onRevoke(a) returns (bool allowed) {
            if (!allowed) revert SignetErrors.ResolverRejected();
        } catch {
            revert SignetErrors.ResolverCallFailed();
        }
        try IResolver(resolver).onResolve(a.uid, a.attester) { } catch { }
    }
}

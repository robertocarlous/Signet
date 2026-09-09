// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { DelegatedAttestationRequest, DelegatedRevocationRequest } from "./Types.sol";

/// @title SignetEIP712
/// @notice EIP-712 typed-data domain + struct hashing for delegated attestation
///         and revocation. EVM analogue of the BLS message construction in
///         `protocol/src/instructions/delegation.rs` (`ATTEST_PROTOCOL_V1_DELEGATED`),
///         re-expressed as EIP-712 so any wallet / passkey stack can produce it.
///
///         Domain: name `"Signet"`, version `"1"`, plus the runtime chainId and
///         this contract's address as `verifyingContract`.
///
///         The off-chain signer in the evm-sdk package MUST reproduce these exact
///         type strings and field ordering.
abstract contract SignetEIP712 is EIP712 {
    /// @dev keccak256(
    ///   "Attest(bytes32 schemaUID,address subject,address attester,uint64 nonce,"
    ///   "uint64 deadline,uint64 expirationTime,bytes data)"
    /// )
    bytes32 internal constant ATTEST_TYPEHASH = keccak256(
        "Attest(bytes32 schemaUID,address subject,address attester,uint64 nonce,uint64 deadline,uint64 expirationTime,bytes data)"
    );

    /// @dev keccak256("Revoke(bytes32 attestationUID,address revoker,uint64 nonce,uint64 deadline)")
    bytes32 internal constant REVOKE_TYPEHASH =
        keccak256("Revoke(bytes32 attestationUID,address revoker,uint64 nonce,uint64 deadline)");

    constructor() EIP712("Signet", "1") { }

    /// @notice The EIP-712 domain separator for this deployment.
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice The digest an `attester` must sign for `attestByDelegation`.
    function hashDelegatedAttestation(DelegatedAttestationRequest calldata request) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTEST_TYPEHASH,
                    request.schemaUID,
                    request.subject,
                    request.attester,
                    request.nonce,
                    request.deadline,
                    request.expirationTime,
                    keccak256(request.data)
                )
            )
        );
    }

    /// @notice The digest a `revoker` must sign for `revokeByDelegation`.
    function hashDelegatedRevocation(DelegatedRevocationRequest calldata request) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(REVOKE_TYPEHASH, request.attestationUID, request.revoker, request.nonce, request.deadline)
            )
        );
    }
}

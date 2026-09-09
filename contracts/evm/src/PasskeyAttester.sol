// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IAttestationRegistry } from "./interfaces/IAttestationRegistry.sol";
import { AttestationRequest, WebAuthnAuth } from "./lib/Types.sol";
import { SignetErrors } from "./lib/Errors.sol";
import { WebAuthn } from "./lib/WebAuthn.sol";

/// @title PasskeyAttester
/// @notice Turns a device passkey (WebAuthn / P-256) into an on-chain
///         proof-of-personhood attestation, without the holder ever needing a
///         seed phrase. Anyone can relay the transaction (they pay gas); the
///         attestation is only written if the passkey assertion verifies.
///
/// @dev This contract is the sole attester for its `personhoodSchema` — the
///      schema's `PersonhoodResolver` rejects everyone else. Two uniqueness
///      rules are enforced here:
///        - one personhood attestation per subject address, and
///        - one enrolment per passkey credential.
///
///      No admin, no upgrade path. The three deployment artefacts
///      (PasskeyAttester, PersonhoodResolver, personhood schema) are wired with
///      CREATE-address prediction so nothing needs a post-deploy setter.
contract PasskeyAttester {
    /// @notice Domain tag mixed into the WebAuthn challenge.
    bytes32 public constant CHALLENGE_DOMAIN = keccak256("SIGNET_PERSONHOOD_V1");

    /// @notice The core attestation engine personhood attestations are written to.
    IAttestationRegistry public immutable attestationRegistry;
    /// @notice The schema every personhood attestation follows.
    bytes32 public immutable personhoodSchema;
    /// @notice If true, the passkey must assert User Verified (biometric / PIN), not just presence.
    bool public immutable requireUserVerification;

    /// @dev keccak256(abi.encode(x, y)) => already enrolled.
    mapping(bytes32 credentialId => bool enrolled) public passkeyEnrolled;
    /// @dev subject => its personhood attestation UID (bytes32(0) if none).
    mapping(address subject => bytes32 attestationUID) public personhoodOf;

    event PersonhoodAttested(address indexed subject, bytes32 indexed attestationUID, bytes32 indexed credentialId);

    constructor(IAttestationRegistry attestationRegistry_, bytes32 personhoodSchema_, bool requireUserVerification_) {
        if (address(attestationRegistry_) == address(0)) revert SignetErrors.ZeroAddress();
        if (personhoodSchema_ == bytes32(0)) revert SignetErrors.InvalidUID();
        attestationRegistry = attestationRegistry_;
        personhoodSchema = personhoodSchema_;
        requireUserVerification = requireUserVerification_;
    }

    /// @notice The exact bytes a passkey must sign to enrol `subject` with key `(x, y)`.
    /// @dev The SDK builds `clientDataJSON` with `base64url(this)` as the challenge.
    function challenge(address subject, uint256 x, uint256 y) public view returns (bytes memory) {
        return abi.encode(CHALLENGE_DOMAIN, block.chainid, address(this), subject, x, y);
    }

    /// @notice Verify a passkey assertion and write a personhood attestation for `subject`.
    /// @param subject The address the attestation is about (may be a smart account or the relayer's pick).
    /// @param x P-256 public key X coordinate.
    /// @param y P-256 public key Y coordinate.
    /// @param auth The WebAuthn assertion over `challenge(subject, x, y)`.
    /// @return uid The personhood attestation UID.
    function attestPersonhood(address subject, uint256 x, uint256 y, WebAuthnAuth calldata auth)
        external
        returns (bytes32 uid)
    {
        if (x == 0 && y == 0) revert SignetErrors.InvalidPublicKey();

        bytes32 credentialId = keccak256(abi.encode(x, y));
        if (passkeyEnrolled[credentialId]) revert SignetErrors.PasskeyAlreadyEnrolled();
        if (personhoodOf[subject] != bytes32(0)) revert SignetErrors.SubjectAlreadyVerified();

        if (!WebAuthn.verify(challenge(subject, x, y), requireUserVerification, auth, x, y)) {
            revert SignetErrors.BadPasskeySignature();
        }

        // Effects before the external call into the registry.
        passkeyEnrolled[credentialId] = true;

        uid = attestationRegistry.attest(
            AttestationRequest({
                schemaUID: personhoodSchema, subject: subject, expirationTime: 0, data: abi.encode(x, y)
            })
        );
        personhoodOf[subject] = uid;

        emit PersonhoodAttested(subject, uid, credentialId);
    }
}

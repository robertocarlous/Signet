// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import { IAttestationRegistry } from "./interfaces/IAttestationRegistry.sol";
import { AttestationRequest, RevocationRequest, WebAuthnAuth } from "./lib/Types.sol";
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
///      No admin, no upgrade path — but a lost or compromised passkey still
///      needs a way out, so subjects may opt into social recovery: pick >= 2
///      guardian addresses (`setGuardians`, signed by the live passkey), and
///      later swap in a brand-new passkey (`recoverPersonhood`) once `threshold`
///      of those guardians co-sign the request. Recovery still requires the
///      *new* device to prove it holds a real passkey too — guardians vouch for
///      the person, they can't conjure a key out of thin air.
contract PasskeyAttester is EIP712 {
    /// @notice Domain tag mixed into the WebAuthn enrolment challenge.
    bytes32 public constant CHALLENGE_DOMAIN = keccak256("SIGNET_PERSONHOOD_V1");
    /// @notice Domain tag mixed into the "set guardians" WebAuthn challenge.
    bytes32 public constant SET_GUARDIANS_CHALLENGE_DOMAIN = keccak256("SIGNET_PERSONHOOD_SET_GUARDIANS_V1");
    /// @notice Domain tag mixed into the "new passkey" WebAuthn challenge signed during recovery.
    bytes32 public constant RECOVERY_CHALLENGE_DOMAIN = keccak256("SIGNET_PERSONHOOD_RECOVERY_V1");
    /// @notice Minimum guardian-set size — mirrors the "at least 2 trusted parties" recovery design.
    uint256 public constant MIN_GUARDIANS = 2;

    /// @dev keccak256("Recover(address subject,uint256 newX,uint256 newY,uint256 nonce,uint64 deadline)")
    bytes32 internal constant RECOVER_TYPEHASH =
        keccak256("Recover(address subject,uint256 newX,uint256 newY,uint256 nonce,uint64 deadline)");

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

    /// @dev subject => its recovery guardians (empty until `setGuardians` is called).
    mapping(address subject => address[] guardians) private _guardians;
    /// @dev subject => how many distinct guardian signatures `recoverPersonhood` needs.
    mapping(address subject => uint8 threshold) public guardianThreshold;
    /// @dev subject => next expected nonce for `setGuardians` (replay protection).
    mapping(address subject => uint256 nonce) public guardianNonce;
    /// @dev subject => next expected nonce for `recoverPersonhood` (replay protection).
    mapping(address subject => uint256 nonce) public recoveryNonce;

    event PersonhoodAttested(address indexed subject, bytes32 indexed attestationUID, bytes32 indexed credentialId);
    event GuardiansSet(address indexed subject, address[] guardians, uint8 threshold);
    event PersonhoodRecovered(
        address indexed subject,
        bytes32 indexed oldAttestationUID,
        bytes32 indexed newAttestationUID,
        bytes32 newCredentialId
    );

    constructor(IAttestationRegistry attestationRegistry_, bytes32 personhoodSchema_, bool requireUserVerification_)
        EIP712("SignetPasskeyAttester", "1")
    {
        if (address(attestationRegistry_) == address(0)) revert SignetErrors.ZeroAddress();
        if (personhoodSchema_ == bytes32(0)) revert SignetErrors.InvalidUID();
        attestationRegistry = attestationRegistry_;
        personhoodSchema = personhoodSchema_;
        requireUserVerification = requireUserVerification_;
    }

    // ---------------------------------------------------------------------
    // Enrolment (unchanged from M2)
    // ---------------------------------------------------------------------

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

    // ---------------------------------------------------------------------
    // Guardians (social recovery, opt-in)
    // ---------------------------------------------------------------------

    /// @notice Current recovery guardians for `subject` (empty if none configured).
    function guardiansOf(address subject) external view returns (address[] memory) {
        return _guardians[subject];
    }

    /// @notice The exact bytes the *current* passkey must sign to set `subject`'s guardians.
    function setGuardiansChallenge(address subject, address[] calldata guardians, uint8 threshold, uint256 nonce)
        public
        view
        returns (bytes memory)
    {
        return abi.encode(
            SET_GUARDIANS_CHALLENGE_DOMAIN,
            block.chainid,
            address(this),
            subject,
            keccak256(abi.encode(guardians, threshold)),
            nonce
        );
    }

    /// @notice Pick (or replace) `subject`'s recovery guardians. Requires the live passkey to sign —
    ///         so only someone who still holds their device can set who may vouch for them later.
    /// @dev Callable any time after enrolment, any number of times (e.g. right after `attestPersonhood`,
    ///      or months later to rotate guardians). `threshold` guardian signatures are then required to
    ///      call `recoverPersonhood` if the passkey is ever lost.
    function setGuardians(address subject, address[] calldata guardians, uint8 threshold, WebAuthnAuth calldata auth)
        external
    {
        bytes32 uid = personhoodOf[subject];
        if (uid == bytes32(0)) revert SignetErrors.NotEnrolled();

        (uint256 x, uint256 y) = abi.decode(attestationRegistry.getAttestation(uid).data, (uint256, uint256));

        uint256 nonce = guardianNonce[subject];
        if (!WebAuthn.verify(setGuardiansChallenge(subject, guardians, threshold, nonce), requireUserVerification, auth, x, y))
        {
            revert SignetErrors.BadPasskeySignature();
        }
        unchecked {
            guardianNonce[subject] = nonce + 1;
        }

        _setGuardians(subject, guardians, threshold);
    }

    function _setGuardians(address subject, address[] calldata guardians, uint8 threshold) private {
        uint256 n = guardians.length;
        if (n < MIN_GUARDIANS) revert SignetErrors.TooFewGuardians();
        if (threshold < 2 || threshold > n) revert SignetErrors.InvalidThreshold();

        for (uint256 i = 0; i < n; ++i) {
            if (guardians[i] == address(0)) revert SignetErrors.ZeroAddress();
            for (uint256 j = i + 1; j < n; ++j) {
                if (guardians[i] == guardians[j]) revert SignetErrors.DuplicateGuardian();
            }
        }

        _guardians[subject] = guardians;
        guardianThreshold[subject] = threshold;

        emit GuardiansSet(subject, guardians, threshold);
    }

    // ---------------------------------------------------------------------
    // Recovery — swap in a new passkey once enough guardians co-sign
    // ---------------------------------------------------------------------

    /// @notice The EIP-712 domain separator guardian signatures are computed against
    ///         (domain `"SignetPasskeyAttester"`, version `"1"`) — the SDK's local
    ///         computation should match this exactly; parity is covered by tests.
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice The digest `threshold` guardians must EIP-712-sign to approve swapping `subject`
    ///         onto a fresh passkey `(newX, newY)`.
    function recoveryDigest(address subject, uint256 newX, uint256 newY, uint256 nonce, uint64 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(RECOVER_TYPEHASH, subject, newX, newY, nonce, deadline)));
    }

    /// @notice The exact bytes the *new* passkey must sign, proving the new device actually holds it —
    ///         guardians vouch for the person, they can't hand-pick an arbitrary key on someone's behalf.
    function recoveryChallenge(address subject, uint256 newX, uint256 newY, uint256 nonce)
        public
        view
        returns (bytes memory)
    {
        return abi.encode(RECOVERY_CHALLENGE_DOMAIN, block.chainid, address(this), subject, newX, newY, nonce);
    }

    /// @notice Replace `subject`'s enrolled passkey with `(newX, newY)`, revoking the old personhood
    ///         attestation and writing a fresh one — same subject, same protocol identity.
    /// @param guardianSignatures EIP-712 signatures (any order, one per guardian) over `recoveryDigest`.
    ///        Only signatures from `subject`'s configured guardians count, and each guardian counts once;
    ///        `threshold` distinct valid signatures are required.
    /// @param newAuth The new device's WebAuthn assertion over `recoveryChallenge(subject, newX, newY, nonce)`.
    function recoverPersonhood(
        address subject,
        uint256 newX,
        uint256 newY,
        uint64 deadline,
        bytes[] calldata guardianSignatures,
        WebAuthnAuth calldata newAuth
    ) external returns (bytes32 newUid) {
        bytes32 oldUid = personhoodOf[subject];
        if (oldUid == bytes32(0)) revert SignetErrors.NotEnrolled();

        address[] memory guardians = _guardians[subject];
        uint8 threshold = guardianThreshold[subject];
        if (guardians.length == 0) revert SignetErrors.NoGuardiansConfigured();

        if (deadline < block.timestamp) revert SignetErrors.ExpiredSignature();
        if (newX == 0 && newY == 0) revert SignetErrors.InvalidPublicKey();

        bytes32 newCredentialId = keccak256(abi.encode(newX, newY));
        if (passkeyEnrolled[newCredentialId]) revert SignetErrors.PasskeyAlreadyEnrolled();

        uint256 nonce = recoveryNonce[subject];
        bytes32 digest = recoveryDigest(subject, newX, newY, nonce, deadline);

        uint256 approvals = _countGuardianApprovals(guardians, digest, guardianSignatures);
        if (approvals < threshold) revert SignetErrors.InsufficientGuardianApprovals();

        // The new device must independently prove it holds a real passkey — guardians vouch for the
        // person, they don't get to pick the key.
        if (!WebAuthn.verify(recoveryChallenge(subject, newX, newY, nonce), requireUserVerification, newAuth, newX, newY))
        {
            revert SignetErrors.BadPasskeySignature();
        }

        (uint256 oldX, uint256 oldY) = abi.decode(attestationRegistry.getAttestation(oldUid).data, (uint256, uint256));
        bytes32 oldCredentialId = keccak256(abi.encode(oldX, oldY));

        // Effects before the external calls into the registry.
        passkeyEnrolled[oldCredentialId] = false;
        passkeyEnrolled[newCredentialId] = true;
        unchecked {
            recoveryNonce[subject] = nonce + 1;
        }

        attestationRegistry.revoke(RevocationRequest({ attestationUID: oldUid }));

        newUid = attestationRegistry.attest(
            AttestationRequest({
                schemaUID: personhoodSchema, subject: subject, expirationTime: 0, data: abi.encode(newX, newY)
            })
        );
        personhoodOf[subject] = newUid;

        emit PersonhoodRecovered(subject, oldUid, newUid, newCredentialId);
    }

    /// @dev Recovers each signature's signer and counts distinct, configured guardians only —
    ///      an unrelated or duplicate signature is silently skipped, not an error, so relayers can
    ///      over-collect signatures without needing to pre-filter them.
    function _countGuardianApprovals(address[] memory guardians, bytes32 digest, bytes[] calldata signatures)
        private
        pure
        returns (uint256 approvals)
    {
        address[] memory seen = new address[](signatures.length);
        for (uint256 i = 0; i < signatures.length; ++i) {
            address signer = ECDSA.recover(digest, signatures[i]);
            if (!_isGuardian(guardians, signer)) continue;

            bool dup;
            for (uint256 j = 0; j < approvals; ++j) {
                if (seen[j] == signer) {
                    dup = true;
                    break;
                }
            }
            if (dup) continue;

            seen[approvals] = signer;
            ++approvals;
        }
    }

    function _isGuardian(address[] memory guardians, address who) private pure returns (bool) {
        for (uint256 i = 0; i < guardians.length; ++i) {
            if (guardians[i] == who) return true;
        }
        return false;
    }
}

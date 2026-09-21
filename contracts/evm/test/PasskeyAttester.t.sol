// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { SignetSchemaRegistry } from "../src/SignetSchemaRegistry.sol";
import { SignetAttestationRegistry } from "../src/SignetAttestationRegistry.sol";
import { PersonhoodResolver } from "../src/resolvers/PersonhoodResolver.sol";
import { PasskeyAttester } from "../src/PasskeyAttester.sol";
import { ISchemaRegistry } from "../src/interfaces/ISchemaRegistry.sol";
import { IAttestationRegistry } from "../src/interfaces/IAttestationRegistry.sol";
import { Attestation, AttestationRequest, WebAuthnAuth } from "../src/lib/Types.sol";
import { SignetErrors } from "../src/lib/Errors.sol";
import { PasskeySigner } from "./utils/PasskeySigner.sol";

contract PasskeyAttesterTest is Test {
    SignetSchemaRegistry internal schemas;
    SignetAttestationRegistry internal attestations;
    PersonhoodResolver internal resolver;
    PasskeyAttester internal attester;
    bytes32 internal schemaUID;

    address internal relayer = makeAddr("relayer");
    address internal alice = makeAddr("alice");

    uint256 internal constant ALICE_PK = 0xA11CE;
    uint256 internal ax;
    uint256 internal ay;

    function setUp() public {
        schemas = new SignetSchemaRegistry();
        attestations = new SignetAttestationRegistry(ISchemaRegistry(address(schemas)));

        // Mirror DeployPersonhood's CREATE-address wiring. NOTE: the script's
        // deployer is an EOA (nonce bumps on every tx, so attester = n+2), but
        // here the deployer is this test contract whose nonce only bumps on
        // CREATE — the register() call in between does not — so attester = n+1.
        uint256 n = vm.getNonce(address(this));
        address predictedAttester = vm.computeCreateAddress(address(this), n + 1);

        resolver = new PersonhoodResolver(address(attestations), predictedAttester);
        schemaUID = schemas.register("personhood-def", address(resolver), true);
        attester = new PasskeyAttester(IAttestationRegistry(address(attestations)), schemaUID, false);
        assertEq(address(attester), predictedAttester);

        (ax, ay) = PasskeySigner.publicKey(ALICE_PK);
    }

    function _enrol(address subject, uint256 pk, uint256 x, uint256 y) internal returns (bytes32 uid) {
        WebAuthnAuth memory auth = PasskeySigner.sign(pk, attester.challenge(subject, x, y), false);
        vm.prank(relayer);
        uid = attester.attestPersonhood(subject, x, y, auth);
    }

    function test_attestPersonhood_writesAttestationViaRelayer() public {
        bytes32 uid = _enrol(alice, ALICE_PK, ax, ay);

        Attestation memory a = attestations.getAttestation(uid);
        assertEq(a.schemaUID, schemaUID);
        assertEq(a.subject, alice);
        assertEq(a.attester, address(attester), "PasskeyAttester is the on-chain attester");
        assertEq(a.data, abi.encode(ax, ay));
        assertTrue(attestations.isValid(uid));
        assertEq(attester.personhoodOf(alice), uid);
        assertTrue(attester.passkeyEnrolled(keccak256(abi.encode(ax, ay))));
    }

    function test_attestPersonhood_rejectsBadSignature() public {
        WebAuthnAuth memory auth = PasskeySigner.sign(ALICE_PK, attester.challenge(alice, ax, ay), false);
        auth.r = bytes32(uint256(auth.r) ^ 1); // corrupt

        vm.expectRevert(SignetErrors.BadPasskeySignature.selector);
        attester.attestPersonhood(alice, ax, ay, auth);
    }

    function test_attestPersonhood_rejectsChallengeForDifferentSubject() public {
        // signature is over challenge(bob, ...) but submitted for alice
        WebAuthnAuth memory auth = PasskeySigner.sign(ALICE_PK, attester.challenge(address(0xB0B), ax, ay), false);

        vm.expectRevert(SignetErrors.BadPasskeySignature.selector);
        attester.attestPersonhood(alice, ax, ay, auth);
    }

    function test_attestPersonhood_oneEnrolmentPerPasskey() public {
        _enrol(alice, ALICE_PK, ax, ay);

        WebAuthnAuth memory auth = PasskeySigner.sign(ALICE_PK, attester.challenge(makeAddr("alice2"), ax, ay), false);
        vm.expectRevert(SignetErrors.PasskeyAlreadyEnrolled.selector);
        attester.attestPersonhood(makeAddr("alice2"), ax, ay, auth);
    }

    function test_attestPersonhood_oneAttestationPerSubject() public {
        _enrol(alice, ALICE_PK, ax, ay);

        (uint256 bx, uint256 by) = PasskeySigner.publicKey(0xB0B);
        WebAuthnAuth memory auth = PasskeySigner.sign(0xB0B, attester.challenge(alice, bx, by), false);
        vm.expectRevert(SignetErrors.SubjectAlreadyVerified.selector);
        attester.attestPersonhood(alice, bx, by, auth);
    }

    function test_resolver_blocksDirectAttestationBySomeoneElse() public {
        vm.prank(alice);
        vm.expectRevert(SignetErrors.ResolverRejected.selector);
        attestations.attest(
            AttestationRequest({ schemaUID: schemaUID, subject: alice, expirationTime: 0, data: hex"00" })
        );
    }

    function test_personhood_attestationCarriesRecoverablePubkey() public {
        bytes32 uid = _enrol(alice, ALICE_PK, ax, ay);
        (uint256 gotX, uint256 gotY) = abi.decode(attestations.getAttestation(uid).data, (uint256, uint256));
        assertEq(gotX, ax);
        assertEq(gotY, ay);
    }

    // ------------------------------------------------------------------
    // Guardians (social recovery, opt-in)
    // ------------------------------------------------------------------

    uint256 internal constant GUARDIAN1_PK = 0x6001;
    uint256 internal constant GUARDIAN2_PK = 0x6002;
    uint256 internal constant GUARDIAN3_PK = 0x6003;

    function _guardianSet2() internal pure returns (address[] memory guardians) {
        guardians = new address[](2);
        guardians[0] = vm.addr(GUARDIAN1_PK);
        guardians[1] = vm.addr(GUARDIAN2_PK);
    }

    function _setGuardians(address subject, uint256 pk, address[] memory guardians, uint8 threshold) internal {
        bytes memory chal = attester.setGuardiansChallenge(subject, guardians, threshold, attester.guardianNonce(subject));
        WebAuthnAuth memory auth = PasskeySigner.sign(pk, chal, false);
        vm.prank(relayer);
        attester.setGuardians(subject, guardians, threshold, auth);
    }

    function test_setGuardians_storesSetAndThreshold() public {
        _enrol(alice, ALICE_PK, ax, ay);
        address[] memory guardians = _guardianSet2();

        vm.expectEmit(true, false, false, true);
        emit PasskeyAttester.GuardiansSet(alice, guardians, 2);
        _setGuardians(alice, ALICE_PK, guardians, 2);

        assertEq(attester.guardiansOf(alice).length, 2);
        assertEq(attester.guardiansOf(alice)[0], guardians[0]);
        assertEq(attester.guardianThreshold(alice), 2);
    }

    function test_setGuardians_revertsIfNotEnrolled() public {
        address[] memory guardians = _guardianSet2();
        bytes memory chal = attester.setGuardiansChallenge(alice, guardians, 2, 0);
        WebAuthnAuth memory auth = PasskeySigner.sign(ALICE_PK, chal, false);

        vm.expectRevert(SignetErrors.NotEnrolled.selector);
        attester.setGuardians(alice, guardians, 2, auth);
    }

    function test_setGuardians_revertsBelowMinimum() public {
        _enrol(alice, ALICE_PK, ax, ay);
        address[] memory guardians = new address[](1);
        guardians[0] = vm.addr(GUARDIAN1_PK);

        bytes memory chal = attester.setGuardiansChallenge(alice, guardians, 1, 0);
        WebAuthnAuth memory auth = PasskeySigner.sign(ALICE_PK, chal, false);

        vm.expectRevert(SignetErrors.TooFewGuardians.selector);
        attester.setGuardians(alice, guardians, 1, auth);
    }

    function test_setGuardians_revertsOnBadThreshold() public {
        _enrol(alice, ALICE_PK, ax, ay);
        address[] memory guardians = _guardianSet2();

        bytes memory chal = attester.setGuardiansChallenge(alice, guardians, 3, 0);
        WebAuthnAuth memory auth = PasskeySigner.sign(ALICE_PK, chal, false);

        vm.expectRevert(SignetErrors.InvalidThreshold.selector);
        attester.setGuardians(alice, guardians, 3, auth);
    }

    function test_setGuardians_revertsOnDuplicateGuardian() public {
        _enrol(alice, ALICE_PK, ax, ay);
        address[] memory guardians = new address[](2);
        guardians[0] = vm.addr(GUARDIAN1_PK);
        guardians[1] = vm.addr(GUARDIAN1_PK);

        bytes memory chal = attester.setGuardiansChallenge(alice, guardians, 2, 0);
        WebAuthnAuth memory auth = PasskeySigner.sign(ALICE_PK, chal, false);

        vm.expectRevert(SignetErrors.DuplicateGuardian.selector);
        attester.setGuardians(alice, guardians, 2, auth);
    }

    function test_setGuardians_revertsOnWrongPasskeySignature() public {
        _enrol(alice, ALICE_PK, ax, ay);
        address[] memory guardians = _guardianSet2();

        // Signed by bob's passkey, not alice's — must fail.
        bytes memory chal = attester.setGuardiansChallenge(alice, guardians, 2, 0);
        WebAuthnAuth memory auth = PasskeySigner.sign(0xB0B, chal, false);

        vm.expectRevert(SignetErrors.BadPasskeySignature.selector);
        attester.setGuardians(alice, guardians, 2, auth);
    }

    // ------------------------------------------------------------------
    // Recovery — swap in a new passkey once enough guardians co-sign
    // ------------------------------------------------------------------

    uint256 internal constant NEW_ALICE_PK = 0xA11CE2;

    function _guardianSig(uint256 guardianPk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_recoverPersonhood_swapsPasskeyWithThresholdApprovals() public {
        bytes32 oldUid = _enrol(alice, ALICE_PK, ax, ay);
        _setGuardians(alice, ALICE_PK, _guardianSet2(), 2);

        (uint256 nx, uint256 ny) = PasskeySigner.publicKey(NEW_ALICE_PK);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 nonce = attester.recoveryNonce(alice);
        bytes32 digest = attester.recoveryDigest(alice, nx, ny, nonce, deadline);

        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _guardianSig(GUARDIAN1_PK, digest);
        sigs[1] = _guardianSig(GUARDIAN2_PK, digest);

        WebAuthnAuth memory newAuth =
            PasskeySigner.sign(NEW_ALICE_PK, attester.recoveryChallenge(alice, nx, ny, nonce), false);

        vm.prank(relayer);
        bytes32 newUid = attester.recoverPersonhood(alice, nx, ny, deadline, sigs, newAuth);

        assertTrue(newUid != oldUid);
        assertEq(attester.personhoodOf(alice), newUid);
        assertFalse(attestations.isValid(oldUid), "old attestation must be revoked");
        assertTrue(attestations.isValid(newUid), "new attestation must be valid");
        assertFalse(attester.passkeyEnrolled(keccak256(abi.encode(ax, ay))), "old credential freed");
        assertTrue(attester.passkeyEnrolled(keccak256(abi.encode(nx, ny))), "new credential enrolled");
        assertEq(attester.recoveryNonce(alice), nonce + 1);
    }

    function test_recoverPersonhood_worksWithThreeGuardiansTwoOfThree() public {
        _enrol(alice, ALICE_PK, ax, ay);

        address[] memory guardians = new address[](3);
        guardians[0] = vm.addr(GUARDIAN1_PK);
        guardians[1] = vm.addr(GUARDIAN2_PK);
        guardians[2] = vm.addr(GUARDIAN3_PK);
        _setGuardians(alice, ALICE_PK, guardians, 2);

        (uint256 nx, uint256 ny) = PasskeySigner.publicKey(NEW_ALICE_PK);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 nonce = attester.recoveryNonce(alice);
        bytes32 digest = attester.recoveryDigest(alice, nx, ny, nonce, deadline);

        // Only 2 of the 3 guardians sign — should still succeed (threshold == 2).
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _guardianSig(GUARDIAN1_PK, digest);
        sigs[1] = _guardianSig(GUARDIAN3_PK, digest);

        WebAuthnAuth memory newAuth =
            PasskeySigner.sign(NEW_ALICE_PK, attester.recoveryChallenge(alice, nx, ny, nonce), false);

        vm.prank(relayer);
        attester.recoverPersonhood(alice, nx, ny, deadline, sigs, newAuth);

        assertTrue(attester.passkeyEnrolled(keccak256(abi.encode(nx, ny))));
    }

    function test_recoverPersonhood_revertsWithoutGuardiansConfigured() public {
        _enrol(alice, ALICE_PK, ax, ay);
        (uint256 nx, uint256 ny) = PasskeySigner.publicKey(NEW_ALICE_PK);
        uint64 deadline = uint64(block.timestamp + 1 hours);

        bytes[] memory sigs = new bytes[](0);
        WebAuthnAuth memory newAuth =
            PasskeySigner.sign(NEW_ALICE_PK, attester.recoveryChallenge(alice, nx, ny, 0), false);

        vm.expectRevert(SignetErrors.NoGuardiansConfigured.selector);
        attester.recoverPersonhood(alice, nx, ny, deadline, sigs, newAuth);
    }

    function test_recoverPersonhood_revertsBelowThreshold() public {
        _enrol(alice, ALICE_PK, ax, ay);
        _setGuardians(alice, ALICE_PK, _guardianSet2(), 2);

        (uint256 nx, uint256 ny) = PasskeySigner.publicKey(NEW_ALICE_PK);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 nonce = attester.recoveryNonce(alice);
        bytes32 digest = attester.recoveryDigest(alice, nx, ny, nonce, deadline);

        // Only 1 of 2 required guardians signs.
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _guardianSig(GUARDIAN1_PK, digest);

        WebAuthnAuth memory newAuth =
            PasskeySigner.sign(NEW_ALICE_PK, attester.recoveryChallenge(alice, nx, ny, nonce), false);

        vm.expectRevert(SignetErrors.InsufficientGuardianApprovals.selector);
        attester.recoverPersonhood(alice, nx, ny, deadline, sigs, newAuth);
    }

    function test_recoverPersonhood_rejectsNonGuardianAndDuplicateSignatures() public {
        _enrol(alice, ALICE_PK, ax, ay);
        _setGuardians(alice, ALICE_PK, _guardianSet2(), 2);

        (uint256 nx, uint256 ny) = PasskeySigner.publicKey(NEW_ALICE_PK);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 nonce = attester.recoveryNonce(alice);
        bytes32 digest = attester.recoveryDigest(alice, nx, ny, nonce, deadline);

        // One real guardian signature, repeated, plus one signature from a random outsider —
        // neither counts toward the threshold of 2.
        bytes[] memory sigs = new bytes[](3);
        sigs[0] = _guardianSig(GUARDIAN1_PK, digest);
        sigs[1] = _guardianSig(GUARDIAN1_PK, digest); // duplicate signer
        sigs[2] = _guardianSig(0xDEAD, digest); // not a guardian

        WebAuthnAuth memory newAuth =
            PasskeySigner.sign(NEW_ALICE_PK, attester.recoveryChallenge(alice, nx, ny, nonce), false);

        vm.expectRevert(SignetErrors.InsufficientGuardianApprovals.selector);
        attester.recoverPersonhood(alice, nx, ny, deadline, sigs, newAuth);
    }

    function test_recoverPersonhood_revertsIfSubjectNeverEnrolled() public {
        (uint256 nx, uint256 ny) = PasskeySigner.publicKey(NEW_ALICE_PK);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes[] memory sigs = new bytes[](0);
        WebAuthnAuth memory newAuth =
            PasskeySigner.sign(NEW_ALICE_PK, attester.recoveryChallenge(alice, nx, ny, 0), false);

        vm.expectRevert(SignetErrors.NotEnrolled.selector);
        attester.recoverPersonhood(alice, nx, ny, deadline, sigs, newAuth);
    }

    function test_recoverPersonhood_revertsOnExpiredDeadline() public {
        _enrol(alice, ALICE_PK, ax, ay);
        _setGuardians(alice, ALICE_PK, _guardianSet2(), 2);

        (uint256 nx, uint256 ny) = PasskeySigner.publicKey(NEW_ALICE_PK);
        uint64 deadline = uint64(block.timestamp);
        vm.warp(block.timestamp + 1);
        uint256 nonce = attester.recoveryNonce(alice);
        bytes32 digest = attester.recoveryDigest(alice, nx, ny, nonce, deadline);

        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _guardianSig(GUARDIAN1_PK, digest);
        sigs[1] = _guardianSig(GUARDIAN2_PK, digest);

        WebAuthnAuth memory newAuth =
            PasskeySigner.sign(NEW_ALICE_PK, attester.recoveryChallenge(alice, nx, ny, nonce), false);

        vm.expectRevert(SignetErrors.ExpiredSignature.selector);
        attester.recoverPersonhood(alice, nx, ny, deadline, sigs, newAuth);
    }

    function test_recoverPersonhood_signaturesCannotBeReplayedAfterNonceBumps() public {
        _enrol(alice, ALICE_PK, ax, ay);
        _setGuardians(alice, ALICE_PK, _guardianSet2(), 2);

        (uint256 nx, uint256 ny) = PasskeySigner.publicKey(NEW_ALICE_PK);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 nonce = attester.recoveryNonce(alice);
        bytes32 digest = attester.recoveryDigest(alice, nx, ny, nonce, deadline);

        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _guardianSig(GUARDIAN1_PK, digest);
        sigs[1] = _guardianSig(GUARDIAN2_PK, digest);

        WebAuthnAuth memory newAuth =
            PasskeySigner.sign(NEW_ALICE_PK, attester.recoveryChallenge(alice, nx, ny, nonce), false);

        vm.prank(relayer);
        attester.recoverPersonhood(alice, nx, ny, deadline, sigs, newAuth);

        // Guardians re-approve moving to yet another passkey using the *same* old signatures/nonce —
        // must fail because recoveryNonce already advanced (digest no longer matches).
        (uint256 mx, uint256 my) = PasskeySigner.publicKey(0xA11CE3);
        WebAuthnAuth memory replayAuth =
            PasskeySigner.sign(0xA11CE3, attester.recoveryChallenge(alice, mx, my, nonce), false);

        vm.expectRevert(SignetErrors.InsufficientGuardianApprovals.selector);
        attester.recoverPersonhood(alice, mx, my, deadline, sigs, replayAuth);
    }
}

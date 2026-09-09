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
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { SignetSchemaRegistry } from "../src/SignetSchemaRegistry.sol";
import { SignetAttestationRegistry } from "../src/SignetAttestationRegistry.sol";
import { ISchemaRegistry } from "../src/interfaces/ISchemaRegistry.sol";
import { Attestation, AttestationRequest, RevocationRequest } from "../src/lib/Types.sol";
import { SignetErrors } from "../src/lib/Errors.sol";

contract AttestationRegistryTest is Test {
    SignetSchemaRegistry internal schemas;
    SignetAttestationRegistry internal attestations;

    address internal issuer = makeAddr("issuer");
    address internal subject = makeAddr("subject");

    bytes32 internal revocableSchema;
    bytes32 internal permanentSchema;

    function setUp() public {
        schemas = new SignetSchemaRegistry();
        attestations = new SignetAttestationRegistry(ISchemaRegistry(address(schemas)));

        vm.startPrank(issuer);
        revocableSchema = schemas.register('{"s":"revocable"}', address(0), true);
        permanentSchema = schemas.register('{"s":"permanent"}', address(0), false);
        vm.stopPrank();
    }

    function _attest(bytes32 schema) internal returns (bytes32 uid) {
        vm.prank(issuer);
        uid = attestations.attest(
            AttestationRequest({ schemaUID: schema, subject: subject, expirationTime: 0, data: hex"01" })
        );
    }

    function test_attest_writesRecordAndBumpsNonce() public {
        bytes32 uid = _attest(revocableSchema);

        Attestation memory a = attestations.getAttestation(uid);
        assertEq(a.schemaUID, revocableSchema);
        assertEq(a.subject, subject);
        assertEq(a.attester, issuer);
        assertEq(a.nonce, 0);
        assertFalse(a.revoked);
        assertTrue(attestations.isValid(uid));
        assertEq(attestations.getNonce(issuer), 1);
    }

    function test_attest_secondAttestationGetsNewUID() public {
        bytes32 first = _attest(revocableSchema);
        bytes32 second = _attest(revocableSchema);
        assertTrue(first != second, "nonce should make each UID unique");
    }

    function test_revoke_marksRevoked() public {
        bytes32 uid = _attest(revocableSchema);
        vm.prank(issuer);
        attestations.revoke(RevocationRequest({ attestationUID: uid }));

        assertFalse(attestations.isValid(uid));
        assertTrue(attestations.getAttestation(uid).revoked);
    }

    function test_revoke_revertsForNonAttester() public {
        bytes32 uid = _attest(revocableSchema);
        vm.expectRevert(SignetErrors.NotAuthorized.selector);
        attestations.revoke(RevocationRequest({ attestationUID: uid }));
    }

    function test_revoke_revertsWhenSchemaNotRevocable() public {
        bytes32 uid = _attest(permanentSchema);
        vm.prank(issuer);
        vm.expectRevert(SignetErrors.AttestationNotRevocable.selector);
        attestations.revoke(RevocationRequest({ attestationUID: uid }));
    }

    function test_attest_revertsForUnknownSchema() public {
        vm.prank(issuer);
        vm.expectRevert(SignetErrors.SchemaNotFound.selector);
        attestations.attest(
            AttestationRequest({ schemaUID: keccak256("ghost"), subject: subject, expirationTime: 0, data: "" })
        );
    }

    // TODO: delegated attest/revoke tests once EIP-712 verification is implemented.
}

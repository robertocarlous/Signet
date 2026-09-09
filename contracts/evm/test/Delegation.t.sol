// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { SignetSchemaRegistry } from "../src/SignetSchemaRegistry.sol";
import { SignetAttestationRegistry } from "../src/SignetAttestationRegistry.sol";
import { ISchemaRegistry } from "../src/interfaces/ISchemaRegistry.sol";
import { Attestation, DelegatedAttestationRequest, DelegatedRevocationRequest } from "../src/lib/Types.sol";
import { SignetErrors } from "../src/lib/Errors.sol";

contract DelegationTest is Test {
    SignetSchemaRegistry internal schemas;
    SignetAttestationRegistry internal reg;

    address internal attester;
    uint256 internal attesterPk;
    address internal subject = makeAddr("subject");
    address internal relayer = makeAddr("relayer");

    bytes32 internal schemaUID;

    function setUp() public {
        schemas = new SignetSchemaRegistry();
        reg = new SignetAttestationRegistry(ISchemaRegistry(address(schemas)));
        (attester, attesterPk) = makeAddrAndKey("attester");

        vm.prank(attester);
        schemaUID = schemas.register('{"s":"delegated"}', address(0), true);
    }

    // --- helpers ---

    function _signedAttest(uint256 pk, uint64 nonce, uint64 deadline)
        internal
        view
        returns (DelegatedAttestationRequest memory req)
    {
        req = DelegatedAttestationRequest({
            schemaUID: schemaUID,
            subject: subject,
            attester: attester,
            nonce: nonce,
            deadline: deadline,
            expirationTime: 0,
            data: hex"2a",
            signature: ""
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, reg.hashDelegatedAttestation(req));
        req.signature = abi.encodePacked(r, s, v);
    }

    function _signedRevoke(uint256 pk, bytes32 attestationUID, uint64 nonce, uint64 deadline)
        internal
        view
        returns (DelegatedRevocationRequest memory req)
    {
        req = DelegatedRevocationRequest({
            attestationUID: attestationUID, revoker: attester, nonce: nonce, deadline: deadline, signature: ""
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, reg.hashDelegatedRevocation(req));
        req.signature = abi.encodePacked(r, s, v);
    }

    // --- attest ---

    function test_attestByDelegation_relayerSubmitsForSigner() public {
        DelegatedAttestationRequest memory req = _signedAttest(attesterPk, 0, uint64(block.timestamp + 1 hours));

        vm.prank(relayer);
        bytes32 uid = reg.attestByDelegation(req);

        Attestation memory a = reg.getAttestation(uid);
        assertEq(a.attester, attester, "original signer is the attester");
        assertEq(a.subject, subject);
        assertEq(a.data, hex"2a");
        assertTrue(reg.isValid(uid));
        assertEq(reg.getNonce(attester), 1);
    }

    function test_attestByDelegation_replayReverts() public {
        DelegatedAttestationRequest memory req = _signedAttest(attesterPk, 0, uint64(block.timestamp + 1 hours));
        reg.attestByDelegation(req);

        vm.expectRevert(SignetErrors.InvalidNonce.selector);
        reg.attestByDelegation(req); // nonce is now 1
    }

    function test_attestByDelegation_expiredDeadlineReverts() public {
        vm.warp(1000);
        DelegatedAttestationRequest memory req = _signedAttest(attesterPk, 0, 999);

        vm.expectRevert(SignetErrors.ExpiredSignature.selector);
        reg.attestByDelegation(req);
    }

    function test_attestByDelegation_wrongSignerReverts() public {
        (, uint256 impostorPk) = makeAddrAndKey("impostor");
        DelegatedAttestationRequest memory req = _signedAttest(impostorPk, 0, uint64(block.timestamp + 1 hours));

        vm.expectRevert(SignetErrors.InvalidSignature.selector);
        reg.attestByDelegation(req);
    }

    function test_attestByDelegation_tamperedFieldReverts() public {
        DelegatedAttestationRequest memory req = _signedAttest(attesterPk, 0, uint64(block.timestamp + 1 hours));
        req.subject = makeAddr("someoneElse"); // signature no longer matches

        vm.expectRevert(SignetErrors.InvalidSignature.selector);
        reg.attestByDelegation(req);
    }

    function test_attestByDelegation_wrongNonceReverts() public {
        DelegatedAttestationRequest memory req = _signedAttest(attesterPk, 5, uint64(block.timestamp + 1 hours));

        vm.expectRevert(SignetErrors.InvalidNonce.selector);
        reg.attestByDelegation(req);
    }

    // --- revoke ---

    function test_revokeByDelegation_relayerSubmitsForSigner() public {
        bytes32 uid = reg.attestByDelegation(_signedAttest(attesterPk, 0, uint64(block.timestamp + 1 hours)));

        DelegatedRevocationRequest memory req = _signedRevoke(attesterPk, uid, 0, uint64(block.timestamp + 1 hours));
        vm.prank(relayer);
        reg.revokeByDelegation(req);

        assertTrue(reg.getAttestation(uid).revoked);
        assertFalse(reg.isValid(uid));
        assertEq(reg.getRevocationNonce(attester), 1);
    }

    function test_revokeByDelegation_replayReverts() public {
        bytes32 uid = reg.attestByDelegation(_signedAttest(attesterPk, 0, uint64(block.timestamp + 1 hours)));
        DelegatedRevocationRequest memory req = _signedRevoke(attesterPk, uid, 0, uint64(block.timestamp + 1 hours));
        reg.revokeByDelegation(req);

        vm.expectRevert(SignetErrors.InvalidNonce.selector);
        reg.revokeByDelegation(req);
    }

    function test_revokeByDelegation_wrongSignerReverts() public {
        bytes32 uid = reg.attestByDelegation(_signedAttest(attesterPk, 0, uint64(block.timestamp + 1 hours)));
        (, uint256 impostorPk) = makeAddrAndKey("impostor");
        DelegatedRevocationRequest memory req = _signedRevoke(impostorPk, uid, 0, uint64(block.timestamp + 1 hours));

        vm.expectRevert(SignetErrors.InvalidSignature.selector);
        reg.revokeByDelegation(req);
    }

    // --- domain ---

    function test_domainSeparator_isChainAndAddressBound() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Signet"),
                keccak256("1"),
                block.chainid,
                address(reg)
            )
        );
        assertEq(reg.DOMAIN_SEPARATOR(), expected);
    }
}

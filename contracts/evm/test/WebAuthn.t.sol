// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { WebAuthn } from "../src/lib/WebAuthn.sol";
import { WebAuthnAuth } from "../src/lib/Types.sol";
import { PasskeySigner } from "./utils/PasskeySigner.sol";

/// @dev Exercises the library through a thin harness so `internal` view is callable.
contract WebAuthnHarness {
    function verify(bytes calldata challenge, bool requireUV, WebAuthnAuth calldata auth, uint256 x, uint256 y)
        external
        view
        returns (bool)
    {
        return WebAuthn.verify(challenge, requireUV, auth, x, y);
    }
}

contract WebAuthnTest is Test {
    WebAuthnHarness internal harness;

    uint256 internal constant PK = 0xB0B; // synthetic P-256 private key
    uint256 internal x;
    uint256 internal y;

    function setUp() public {
        harness = new WebAuthnHarness();
        (x, y) = PasskeySigner.publicKey(PK);
    }

    function test_verify_validAssertion() public view {
        bytes memory challenge = abi.encode("hello", uint256(1));
        WebAuthnAuth memory auth = PasskeySigner.sign(PK, challenge, false);
        assertTrue(harness.verify(challenge, false, auth, x, y));
    }

    function test_verify_rejectsWrongChallenge() public view {
        WebAuthnAuth memory auth = PasskeySigner.sign(PK, abi.encode("signed-this"), false);
        assertFalse(harness.verify(abi.encode("expected-that"), false, auth, x, y));
    }

    function test_verify_rejectsWrongKey() public view {
        bytes memory challenge = abi.encode("hello");
        WebAuthnAuth memory auth = PasskeySigner.sign(PK, challenge, false);
        (uint256 x2, uint256 y2) = PasskeySigner.publicKey(0xACE);
        assertFalse(harness.verify(challenge, false, auth, x2, y2));
    }

    function test_verify_rejectsTamperedAuthenticatorData() public view {
        bytes memory challenge = abi.encode("hello");
        WebAuthnAuth memory auth = PasskeySigner.sign(PK, challenge, false);
        auth.authenticatorData[10] = 0xff; // flip a byte -> messageHash changes
        assertFalse(harness.verify(challenge, false, auth, x, y));
    }

    function test_verify_requiresUserPresenceFlag() public view {
        bytes memory challenge = abi.encode("hello");
        WebAuthnAuth memory auth = PasskeySigner.sign(PK, challenge, false);
        auth.authenticatorData[32] = 0x00; // clear UP
        assertFalse(harness.verify(challenge, false, auth, x, y));
    }

    function test_verify_userVerificationEnforcedWhenRequired() public view {
        bytes memory challenge = abi.encode("hello");

        WebAuthnAuth memory upOnly = PasskeySigner.sign(PK, challenge, false);
        assertFalse(harness.verify(challenge, true, upOnly, x, y), "UV required but only UP set");

        WebAuthnAuth memory verified = PasskeySigner.sign(PK, challenge, true);
        assertTrue(harness.verify(challenge, true, verified, x, y), "UV set -> ok");
    }

    function test_verify_rejectsHighSMalleability() public view {
        bytes memory challenge = abi.encode("hello");
        WebAuthnAuth memory auth = PasskeySigner.sign(PK, challenge, false);
        auth.s = bytes32(PasskeySigner.P256_N - uint256(auth.s)); // flip to high-s
        assertFalse(harness.verify(challenge, false, auth, x, y));
    }
}

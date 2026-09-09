// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { SignetSchemaRegistry } from "../src/SignetSchemaRegistry.sol";
import { ISchemaRegistry } from "../src/interfaces/ISchemaRegistry.sol";
import { Schema } from "../src/lib/Types.sol";
import { SignetErrors } from "../src/lib/Errors.sol";
import { SignetUID } from "../src/lib/SignetUID.sol";

contract SchemaRegistryTest is Test {
    SignetSchemaRegistry internal registry;
    address internal alice = makeAddr("alice");

    string internal constant DEF = '{"name":"personhood","fields":[{"name":"verified","type":"bool"}]}';

    function setUp() public {
        registry = new SignetSchemaRegistry();
    }

    function test_register_returnsExpectedUID() public {
        vm.prank(alice);
        bytes32 uid = registry.register(DEF, address(0), true);
        assertEq(uid, SignetUID.schemaUID(DEF, alice, address(0), true));
        assertTrue(registry.isRegistered(uid));

        Schema memory s = registry.getSchema(uid);
        assertEq(s.authority, alice);
        assertEq(s.resolver, address(0));
        assertTrue(s.revocable);
        assertEq(s.definition, DEF);
    }

    function test_register_revertsOnDuplicate() public {
        vm.startPrank(alice);
        registry.register(DEF, address(0), true);
        vm.expectRevert(SignetErrors.SchemaAlreadyExists.selector);
        registry.register(DEF, address(0), true);
        vm.stopPrank();
    }

    function test_register_revocabilityIsPartOfIdentity() public {
        vm.startPrank(alice);
        bytes32 a = registry.register(DEF, address(0), true);
        bytes32 b = registry.register(DEF, address(0), false);
        vm.stopPrank();
        assertTrue(a != b, "revocable flag must change the UID");
    }

    function test_register_revertsOnEmptyDefinition() public {
        vm.expectRevert(SignetErrors.InvalidSchemaDefinition.selector);
        registry.register("", address(0), true);
    }

    function test_getSchema_revertsWhenUnknown() public {
        vm.expectRevert(SignetErrors.SchemaNotFound.selector);
        registry.getSchema(keccak256("nope"));
    }
}

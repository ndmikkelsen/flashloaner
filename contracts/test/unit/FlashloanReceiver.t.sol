// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FlashloanReceiver} from "../../src/FlashloanReceiver.sol";

/// @dev Concrete implementation for testing the abstract FlashloanReceiver.
contract TestReceiver is FlashloanReceiver {
    bool public arbitrageCalled;
    bytes public lastParams;

    constructor(address _aavePool, address _balancerVault, address _owner)
        FlashloanReceiver(_aavePool, _balancerVault, _owner)
    {}

    function _executeArbitrage(bytes calldata params) internal override {
        arbitrageCalled = true;
        lastParams = params;
    }
}

/// @dev Minimal ERC20 mock for testing.
contract MockERC20 is IERC20 {
    string public name = "Mock Token";
    string public symbol = "MOCK";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

/// @title FlashloanReceiverTest
/// @notice Unit tests for the FlashloanReceiver abstract base contract.
contract FlashloanReceiverTest is Test {
    TestReceiver internal receiver;
    MockERC20 internal token;

    address internal owner = makeAddr("owner");
    address internal aavePool = makeAddr("aavePool");
    address internal balancerVault = makeAddr("balancerVault");
    address internal attacker = makeAddr("attacker");
    address internal treasury = makeAddr("treasury");

    function setUp() public {
        receiver = new TestReceiver(aavePool, balancerVault, owner);
        token = new MockERC20();
    }

    // ──────────────────────────────────────────────
    // Constructor Tests
    // ──────────────────────────────────────────────

    function test_constructorSetsImmutables() public view {
        assertEq(receiver.aavePool(), aavePool);
        assertEq(receiver.balancerVault(), balancerVault);
        assertEq(receiver.owner(), owner);
    }

    function test_revertWhen_constructorZeroAavePool() public {
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        new TestReceiver(address(0), balancerVault, owner);
    }

    function test_revertWhen_constructorZeroBalancerVault() public {
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        new TestReceiver(aavePool, address(0), owner);
    }

    // ──────────────────────────────────────────────
    // Aave V3 executeOperation Tests
    // ──────────────────────────────────────────────

    function test_executeOperation_success() public {
        uint256 amount = 100 ether;
        uint256 premium = 0.05 ether;
        bytes memory params = abi.encode("test");

        // Fund the receiver with enough to repay
        token.mint(address(receiver), amount + premium);

        // Call as Aave Pool with initiator = receiver
        vm.prank(aavePool);
        bool result =
            receiver.executeOperation(address(token), amount, premium, address(receiver), params);

        assertTrue(result);
        assertTrue(receiver.arbitrageCalled());
        assertEq(receiver.lastParams(), params);

        // Verify allowance was set for repayment
        assertGe(token.allowance(address(receiver), aavePool), amount + premium);
    }

    function test_executeOperation_emitsFlashLoanReceived() public {
        uint256 amount = 100 ether;
        uint256 premium = 0.05 ether;
        token.mint(address(receiver), amount + premium);

        vm.expectEmit(true, true, false, true);
        emit FlashloanReceiver.FlashLoanReceived(aavePool, address(token), amount, premium);

        vm.prank(aavePool);
        receiver.executeOperation(address(token), amount, premium, address(receiver), "");
    }

    function test_revertWhen_executeOperationCalledByNonPool() public {
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(FlashloanReceiver.UnauthorizedCaller.selector, attacker, aavePool)
        );
        receiver.executeOperation(address(token), 100 ether, 0, address(receiver), "");
    }

    function test_revertWhen_executeOperationWrongInitiator() public {
        vm.prank(aavePool);
        vm.expectRevert(
            abi.encodeWithSelector(FlashloanReceiver.UnauthorizedInitiator.selector, attacker)
        );
        receiver.executeOperation(address(token), 100 ether, 0, attacker, "");
    }

    // ──────────────────────────────────────────────
    // Balancer receiveFlashLoan Tests
    // ──────────────────────────────────────────────

    function test_receiveFlashLoan_success() public {
        uint256 amount = 50 ether;
        uint256 fee = 0;
        bytes memory userData = abi.encode("balancer-test");

        token.mint(address(receiver), amount + fee);

        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        uint256[] memory feeAmounts = new uint256[](1);
        feeAmounts[0] = fee;

        vm.prank(balancerVault);
        receiver.receiveFlashLoan(tokens, amounts, feeAmounts, userData);

        assertTrue(receiver.arbitrageCalled());
        assertEq(receiver.lastParams(), userData);
    }

    function test_receiveFlashLoan_emitsFlashLoanReceived() public {
        uint256 amount = 50 ether;
        token.mint(address(receiver), amount);

        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        uint256[] memory feeAmounts = new uint256[](1);
        feeAmounts[0] = 0;

        vm.expectEmit(true, true, false, true);
        emit FlashloanReceiver.FlashLoanReceived(balancerVault, address(token), amount, 0);

        vm.prank(balancerVault);
        receiver.receiveFlashLoan(tokens, amounts, feeAmounts, "");
    }

    function test_revertWhen_receiveFlashLoanCalledByNonVault() public {
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;
        uint256[] memory feeAmounts = new uint256[](1);
        feeAmounts[0] = 0;

        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(
                FlashloanReceiver.UnauthorizedCaller.selector, attacker, balancerVault
            )
        );
        receiver.receiveFlashLoan(tokens, amounts, feeAmounts, "");
    }

    // ──────────────────────────────────────────────
    // Uniswap V3 Flash Callback Tests
    // ──────────────────────────────────────────────

    function test_uniswapV3FlashCallback_callsArbitrage() public {
        bytes memory data = abi.encode("uni-v3-test");
        // Any address can call (pool validation delegated to child)
        receiver.uniswapV3FlashCallback(0, 0, data);

        assertTrue(receiver.arbitrageCalled());
        assertEq(receiver.lastParams(), data);
    }

    // ──────────────────────────────────────────────
    // dYdX callFunction Tests
    // ──────────────────────────────────────────────

    function test_callFunction_callsArbitrage() public {
        bytes memory data = abi.encode("dydx-test");
        // Any address can call (SoloMargin validation delegated to child)
        receiver.callFunction(address(this), address(this), 0, data);

        assertTrue(receiver.arbitrageCalled());
        assertEq(receiver.lastParams(), data);
    }

    // ──────────────────────────────────────────────
    // Emergency Withdrawal Tests
    // ──────────────────────────────────────────────

    function test_emergencyWithdrawToken_success() public {
        uint256 amount = 10 ether;
        token.mint(address(receiver), amount);

        vm.prank(owner);
        receiver.emergencyWithdrawToken(address(token), treasury, amount);

        assertEq(token.balanceOf(treasury), amount);
        assertEq(token.balanceOf(address(receiver)), 0);
    }

    function test_emergencyWithdrawToken_emitsEvent() public {
        uint256 amount = 10 ether;
        token.mint(address(receiver), amount);

        vm.expectEmit(true, true, false, true);
        emit FlashloanReceiver.EmergencyWithdraw(address(token), treasury, amount);

        vm.prank(owner);
        receiver.emergencyWithdrawToken(address(token), treasury, amount);
    }

    function test_revertWhen_emergencyWithdrawTokenByNonOwner() public {
        token.mint(address(receiver), 10 ether);

        vm.prank(attacker);
        vm.expectRevert();
        receiver.emergencyWithdrawToken(address(token), attacker, 10 ether);
    }

    function test_revertWhen_emergencyWithdrawTokenZeroToken() public {
        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        receiver.emergencyWithdrawToken(address(0), treasury, 1 ether);
    }

    function test_revertWhen_emergencyWithdrawTokenZeroRecipient() public {
        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        receiver.emergencyWithdrawToken(address(token), address(0), 1 ether);
    }

    function test_revertWhen_emergencyWithdrawTokenZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAmount.selector);
        receiver.emergencyWithdrawToken(address(token), treasury, 0);
    }

    function test_revertWhen_emergencyWithdrawTokenInsufficientBalance() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(FlashloanReceiver.InsufficientBalance.selector, 10 ether, 0)
        );
        receiver.emergencyWithdrawToken(address(token), treasury, 10 ether);
    }

    function test_emergencyWithdrawETH_success() public {
        uint256 amount = 5 ether;
        vm.deal(address(receiver), amount);

        vm.prank(owner);
        receiver.emergencyWithdrawETH(treasury, amount);

        assertEq(treasury.balance, amount);
        assertEq(address(receiver).balance, 0);
    }

    function test_emergencyWithdrawETH_emitsEvent() public {
        uint256 amount = 5 ether;
        vm.deal(address(receiver), amount);

        vm.expectEmit(true, false, false, true);
        emit FlashloanReceiver.EmergencyWithdrawETH(treasury, amount);

        vm.prank(owner);
        receiver.emergencyWithdrawETH(treasury, amount);
    }

    function test_revertWhen_emergencyWithdrawETHByNonOwner() public {
        vm.deal(address(receiver), 5 ether);

        vm.prank(attacker);
        vm.expectRevert();
        receiver.emergencyWithdrawETH(attacker, 5 ether);
    }

    function test_revertWhen_emergencyWithdrawETHZeroRecipient() public {
        vm.deal(address(receiver), 5 ether);

        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        receiver.emergencyWithdrawETH(address(0), 1 ether);
    }

    function test_revertWhen_emergencyWithdrawETHZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAmount.selector);
        receiver.emergencyWithdrawETH(treasury, 0);
    }

    function test_revertWhen_emergencyWithdrawETHInsufficientBalance() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(FlashloanReceiver.InsufficientBalance.selector, 10 ether, 0)
        );
        receiver.emergencyWithdrawETH(treasury, 10 ether);
    }

    // ──────────────────────────────────────────────
    // Receive ETH Test
    // ──────────────────────────────────────────────

    function test_canReceiveETH() public {
        vm.deal(address(this), 1 ether);
        (bool success,) = address(receiver).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(receiver).balance, 1 ether);
    }

    // ──────────────────────────────────────────────
    // Reentrancy Tests
    // ──────────────────────────────────────────────

    function test_revertWhen_reentrancyOnExecuteOperation() public {
        // executeOperation is protected by nonReentrant
        // Calling it again during execution should revert
        ReentrantReceiver reentrant = new ReentrantReceiver(aavePool, balancerVault, owner);
        token.mint(address(reentrant), 200 ether);

        vm.prank(aavePool);
        vm.expectRevert();
        reentrant.executeOperation(address(token), 100 ether, 0, address(reentrant), "");
    }

    // ──────────────────────────────────────────────
    // Fuzz Tests
    // ──────────────────────────────────────────────

    function testFuzz_executeOperation_variousAmounts(uint256 amount, uint256 premium) public {
        amount = bound(amount, 1, 1_000_000 ether);
        premium = bound(premium, 0, amount / 10);

        token.mint(address(receiver), amount + premium);

        vm.prank(aavePool);
        bool result =
            receiver.executeOperation(address(token), amount, premium, address(receiver), "");
        assertTrue(result);
    }

    function testFuzz_emergencyWithdrawToken_variousAmounts(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000 ether);
        token.mint(address(receiver), amount);

        vm.prank(owner);
        receiver.emergencyWithdrawToken(address(token), treasury, amount);
        assertEq(token.balanceOf(treasury), amount);
    }

    function testFuzz_emergencyWithdrawETH_variousAmounts(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000 ether);
        vm.deal(address(receiver), amount);

        vm.prank(owner);
        receiver.emergencyWithdrawETH(treasury, amount);
        assertEq(treasury.balance, amount);
    }
}

/// @dev Receiver that attempts reentrancy by calling executeOperation again.
contract ReentrantReceiver is FlashloanReceiver {
    constructor(address _aavePool, address _balancerVault, address _owner)
        FlashloanReceiver(_aavePool, _balancerVault, _owner)
    {}

    function _executeArbitrage(bytes calldata) internal override {
        // Attempt reentrancy
        this.executeOperation(address(0), 0, 0, address(this), "");
    }
}

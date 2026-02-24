// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FlashloanExecutor} from "../../src/FlashloanExecutor.sol";
import {FlashloanReceiver} from "../../src/FlashloanReceiver.sol";
import {IFlashloanExecutor} from "../../src/interfaces/IFlashloanExecutor.sol";
import {CircuitBreaker} from "../../src/safety/CircuitBreaker.sol";

// ---------------------------------------------------------------
// Mock ERC20 Token
// ---------------------------------------------------------------

contract SecurityMockToken is IERC20 {
    string public name = "Security Mock";
    string public symbol = "SEC";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
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
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        require(balanceOf[from] >= amount, "insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

// ---------------------------------------------------------------
// Mock Adapter (for testing allowance cleanup)
// ---------------------------------------------------------------

/// @dev Adapter that intentionally does NOT consume the full allowance.
///      Used to test that residual allowances are cleaned up.
contract PartialConsumeAdapter {
    uint256 public consumeRatio = 80; // consume only 80% of input

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256,
        bytes calldata
    ) external returns (uint256) {
        // Only pull 80% of the approved amount
        uint256 actualPull = (amountIn * consumeRatio) / 100;
        SecurityMockToken(tokenIn).transferFrom(msg.sender, address(this), actualPull);

        // Return output equal to amountIn (to appear profitable)
        uint256 amountOut = amountIn;
        SecurityMockToken(tokenOut).transfer(msg.sender, amountOut);
        return amountOut;
    }

    function getAmountOut(address, address, uint256 amountIn, bytes calldata) external pure returns (uint256) {
        return amountIn;
    }
}

// ---------------------------------------------------------------
// Normal Mock Adapter
// ---------------------------------------------------------------

contract SecurityMockAdapter {
    uint256 public multiplierNum = 1;
    uint256 public multiplierDen = 1;

    function setMultiplier(uint256 num, uint256 den) external {
        multiplierNum = num;
        multiplierDen = den;
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256,
        bytes calldata
    ) external returns (uint256) {
        SecurityMockToken(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        uint256 amountOut = (amountIn * multiplierNum) / multiplierDen;
        SecurityMockToken(tokenOut).transfer(msg.sender, amountOut);
        return amountOut;
    }

    function getAmountOut(address, address, uint256 amountIn, bytes calldata) external view returns (uint256) {
        return (amountIn * multiplierNum) / multiplierDen;
    }
}

// ---------------------------------------------------------------
// Mock Aave V3 Pool
// ---------------------------------------------------------------

contract SecurityMockAavePool {
    uint256 public premiumBps = 5;

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16
    ) external {
        uint256 premium = (amount * premiumBps) / 10_000;
        SecurityMockToken(asset).transfer(receiverAddress, amount);
        bool success =
            FlashloanExecutor(payable(receiverAddress)).executeOperation(asset, amount, premium, receiverAddress, params);
        require(success, "MockAavePool: executeOperation returned false");
        SecurityMockToken(asset).transferFrom(receiverAddress, address(this), amount + premium);
    }
}

// ---------------------------------------------------------------
// Concrete FlashloanReceiver for callback tests
// ---------------------------------------------------------------

contract TestableReceiver is FlashloanReceiver {
    bool public arbitrageCalled;

    constructor(address _aavePool, address _balancerVault, address _owner)
        FlashloanReceiver(_aavePool, _balancerVault, _owner)
    {}

    function _executeArbitrage(bytes calldata) internal override {
        arbitrageCalled = true;
    }

    /// @dev Expose _setFlashLoanActive for testing
    function setFlashLoanActiveForTest(bool active) external {
        _setFlashLoanActive(active);
    }
}

// =============================================================
// SECURITY AUDIT TEST SUITE
// =============================================================

/// @title Security Audit Tests - Finding F-01: CircuitBreaker recordFailure/recordSuccess Access Control
/// @notice Tests that recordFailure() and recordSuccess() are protected from unauthorized callers.
///         Previously, anyone could call recordFailure() repeatedly to trigger auto-pause (DoS),
///         or call recordSuccess() to reset failure counters, undermining the safety mechanism.
contract CircuitBreakerAccessControlTest is Test {
    CircuitBreaker internal breaker;
    address internal owner = makeAddr("owner");
    address internal attacker = makeAddr("attacker");
    address internal authorizedBot = makeAddr("authorizedBot");

    uint256 internal constant MAX_GAS = 50 gwei;
    uint256 internal constant MAX_TRADE = 100 ether;
    uint256 internal constant FAILURE_THRESHOLD = 5;

    function setUp() public {
        breaker = new CircuitBreaker(MAX_GAS, MAX_TRADE, FAILURE_THRESHOLD, owner);
    }

    /// @notice F-01a: Unauthorized caller cannot call recordFailure()
    function test_revertWhen_attackerCallsRecordFailure() public {
        vm.prank(attacker);
        vm.expectRevert(CircuitBreaker.NotAuthorizedCaller.selector);
        breaker.recordFailure();
    }

    /// @notice F-01b: Unauthorized caller cannot call recordSuccess()
    function test_revertWhen_attackerCallsRecordSuccess() public {
        vm.prank(attacker);
        vm.expectRevert(CircuitBreaker.NotAuthorizedCaller.selector);
        breaker.recordSuccess();
    }

    /// @notice F-01c: DoS attack via recordFailure() is prevented
    function test_attackerCannotDoSViaRecordFailure() public {
        // Attacker tries to call recordFailure() to trigger auto-pause
        for (uint256 i = 0; i < FAILURE_THRESHOLD + 10; i++) {
            vm.prank(attacker);
            vm.expectRevert(CircuitBreaker.NotAuthorizedCaller.selector);
            breaker.recordFailure();
        }

        // Breaker should NOT be paused
        assertFalse(breaker.paused(), "Attacker should not be able to trigger auto-pause");
        assertEq(breaker.consecutiveFailures(), 0, "Failure counter should remain at 0");
    }

    /// @notice F-01d: Attacker cannot reset failure counter via recordSuccess()
    function test_attackerCannotResetFailureCounter() public {
        // Owner records legitimate failures
        vm.startPrank(owner);
        breaker.recordFailure();
        breaker.recordFailure();
        breaker.recordFailure();
        vm.stopPrank();
        assertEq(breaker.consecutiveFailures(), 3);

        // Attacker tries to reset the counter
        vm.prank(attacker);
        vm.expectRevert(CircuitBreaker.NotAuthorizedCaller.selector);
        breaker.recordSuccess();

        // Counter should NOT be reset
        assertEq(breaker.consecutiveFailures(), 3, "Failure counter should not be reset by attacker");
    }

    /// @notice F-01e: Owner can still call recordFailure() and recordSuccess()
    function test_ownerCanRecordFailureAndSuccess() public {
        vm.startPrank(owner);
        breaker.recordFailure();
        assertEq(breaker.consecutiveFailures(), 1);

        breaker.recordSuccess();
        assertEq(breaker.consecutiveFailures(), 0);
        vm.stopPrank();
    }

    /// @notice F-01f: Authorized caller can call recordFailure() and recordSuccess()
    function test_authorizedCallerCanRecordFailureAndSuccess() public {
        vm.prank(owner);
        breaker.setAuthorizedCaller(authorizedBot, true);

        vm.startPrank(authorizedBot);
        breaker.recordFailure();
        assertEq(breaker.consecutiveFailures(), 1);

        breaker.recordSuccess();
        assertEq(breaker.consecutiveFailures(), 0);
        vm.stopPrank();
    }

    /// @notice F-01g: Revoking authorized caller prevents future calls
    function test_revokedCallerCannotRecord() public {
        vm.startPrank(owner);
        breaker.setAuthorizedCaller(authorizedBot, true);
        breaker.setAuthorizedCaller(authorizedBot, false);
        vm.stopPrank();

        vm.prank(authorizedBot);
        vm.expectRevert(CircuitBreaker.NotAuthorizedCaller.selector);
        breaker.recordFailure();
    }

    /// @notice F-01h: Fuzz - random addresses cannot call recordFailure
    function testFuzz_randomCallerCannotRecordFailure(address caller) public {
        vm.assume(caller != owner);
        vm.assume(!breaker.authorizedCallers(caller));

        vm.prank(caller);
        vm.expectRevert(CircuitBreaker.NotAuthorizedCaller.selector);
        breaker.recordFailure();
    }
}

/// @title Security Audit Tests - Finding F-02: Flash Loan Callback Guard
/// @notice Tests that uniswapV3FlashCallback and callFunction are guarded by the _flashLoanActive flag.
///         Previously, anyone could call these callbacks at any time. While the profit check
///         would prevent fund loss, this was a code smell and defense-in-depth gap.
contract FlashLoanCallbackGuardTest is Test {
    TestableReceiver internal receiver;
    address internal owner = makeAddr("owner");
    address internal aavePool = makeAddr("aavePool");
    address internal balancerVault = makeAddr("balancerVault");
    address internal attacker = makeAddr("attacker");

    function setUp() public {
        receiver = new TestableReceiver(aavePool, balancerVault, owner);
    }

    /// @notice F-02a: uniswapV3FlashCallback reverts when no flash loan is active
    function test_revertWhen_uniswapV3CallbackWithoutActiveFlashLoan() public {
        vm.prank(attacker);
        vm.expectRevert(FlashloanReceiver.NoActiveFlashLoan.selector);
        receiver.uniswapV3FlashCallback(0, 0, "");
    }

    /// @notice F-02b: callFunction reverts when no flash loan is active
    function test_revertWhen_callFunctionWithoutActiveFlashLoan() public {
        vm.prank(attacker);
        vm.expectRevert(FlashloanReceiver.NoActiveFlashLoan.selector);
        receiver.callFunction(address(0), address(0), 0, "");
    }

    /// @notice F-02c: uniswapV3FlashCallback works when flash loan IS active
    function test_uniswapV3CallbackWorksWhenFlashLoanActive() public {
        receiver.setFlashLoanActiveForTest(true);
        receiver.uniswapV3FlashCallback(0, 0, "test");
        assertTrue(receiver.arbitrageCalled(), "Callback should succeed when flash loan is active");
    }

    /// @notice F-02d: callFunction works when flash loan IS active
    function test_callFunctionWorksWhenFlashLoanActive() public {
        receiver.setFlashLoanActiveForTest(true);
        receiver.callFunction(address(0), address(0), 0, "test");
        assertTrue(receiver.arbitrageCalled(), "Callback should succeed when flash loan is active");
    }

    /// @notice F-02e: Fuzz - random callers always fail without active flash loan
    function testFuzz_randomCallerCallbackReverts(address caller) public {
        vm.prank(caller);
        vm.expectRevert(FlashloanReceiver.NoActiveFlashLoan.selector);
        receiver.uniswapV3FlashCallback(0, 0, "");
    }
}

/// @title Security Audit Tests - Finding F-03: Residual Allowance Cleanup
/// @notice Tests that residual token allowances are cleared after swap steps.
///         Previously, if an adapter didn't consume its full allowance, the remaining
///         allowance persisted, which could be exploited if the adapter were later compromised.
contract ResidualAllowanceTest is Test {
    FlashloanExecutor internal executor;
    SecurityMockToken internal token;
    PartialConsumeAdapter internal partialAdapter;
    SecurityMockAavePool internal aavePool;

    address internal balancerVault = makeAddr("balancerVault");
    address internal owner = makeAddr("owner");
    address internal botWallet = makeAddr("botWallet");

    uint256 internal constant MIN_PROFIT = 0.001 ether;
    uint256 internal constant LOAN_AMOUNT = 100 ether;

    function setUp() public {
        token = new SecurityMockToken();
        aavePool = new SecurityMockAavePool();
        partialAdapter = new PartialConsumeAdapter();

        executor = new FlashloanExecutor(
            address(aavePool), balancerVault, owner, botWallet, MIN_PROFIT
        );

        vm.prank(owner);
        executor.registerAdapter(address(partialAdapter));
    }

    /// @notice F-03a: After swap, residual allowance should be zero
    function test_residualAllowanceCleared() public {
        // Set up: adapter consumes 80% but returns 110% (profitable)
        uint256 premium = (LOAN_AMOUNT * 5) / 10_000;
        uint256 returnAmount = LOAN_AMOUNT + premium + MIN_PROFIT + 1 ether;

        token.mint(address(partialAdapter), returnAmount);
        token.mint(address(aavePool), LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(partialAdapter),
            tokenIn: address(token),
            tokenOut: address(token),
            amountIn: LOAN_AMOUNT,
            extraData: ""
        });

        vm.prank(owner);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);

        // After execution, the residual allowance should be 0
        uint256 residual = token.allowance(address(executor), address(partialAdapter));
        assertEq(residual, 0, "Residual allowance should be cleared after swap");
    }

    /// @notice F-03b: Full-consume adapter also has zero allowance after
    function test_fullConsumeAdapterNoResidual() public {
        SecurityMockAdapter fullAdapter = new SecurityMockAdapter();
        vm.prank(owner);
        executor.registerAdapter(address(fullAdapter));

        uint256 premium = (LOAN_AMOUNT * 5) / 10_000;
        uint256 returnAmount = LOAN_AMOUNT + premium + MIN_PROFIT + 1 ether;

        fullAdapter.setMultiplier(returnAmount, LOAN_AMOUNT);
        token.mint(address(fullAdapter), returnAmount);
        token.mint(address(aavePool), LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(fullAdapter),
            tokenIn: address(token),
            tokenOut: address(token),
            amountIn: LOAN_AMOUNT,
            extraData: ""
        });

        vm.prank(owner);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);

        uint256 residual = token.allowance(address(executor), address(fullAdapter));
        assertEq(residual, 0, "Full-consume adapter should also have zero residual allowance");
    }
}

/// @title Security Audit Tests - Finding F-04: Withdrawal Reentrancy Protection
/// @notice Tests that withdrawToken and withdrawETH have nonReentrant protection.
contract WithdrawalReentrancyTest is Test {
    FlashloanExecutor internal executor;
    SecurityMockToken internal token;

    address internal aavePool = makeAddr("aavePool");
    address internal balancerVault = makeAddr("balancerVault");
    address internal owner;
    address internal botWallet = makeAddr("botWallet");

    uint256 internal constant MIN_PROFIT = 0.01 ether;

    function setUp() public {
        // Owner is a contract that could potentially re-enter
        ReentrantOwner reentrantOwner = new ReentrantOwner();
        owner = address(reentrantOwner);

        token = new SecurityMockToken();

        executor = new FlashloanExecutor(
            aavePool, balancerVault, owner, botWallet, MIN_PROFIT
        );

        // Fund the executor with tokens and ETH
        token.mint(address(executor), 100 ether);
        vm.deal(address(executor), 10 ether);
    }

    /// @notice F-04a: withdrawETH is protected against reentrancy
    function test_revertWhen_withdrawETHReentered() public {
        ReentrantOwner(payable(owner)).setTarget(address(executor));
        ReentrantOwner(payable(owner)).setAttackType(1); // ETH reentrancy

        vm.prank(owner);
        vm.expectRevert(); // ReentrancyGuardReentrantCall
        executor.withdrawETH(1 ether);
    }

    /// @notice F-04b: Normal ETH withdrawal still works (sanity check)
    function test_normalWithdrawETHWorks() public {
        ReentrantOwner(payable(owner)).setAttackType(0); // no reentrancy

        vm.prank(owner);
        executor.withdrawETH(1 ether);

        assertEq(address(owner).balance, 1 ether);
    }

    /// @notice F-04c: Normal token withdrawal works (sanity check)
    function test_normalWithdrawTokenWorks() public {
        vm.prank(owner);
        executor.withdrawToken(address(token), 10 ether);

        assertEq(token.balanceOf(owner), 10 ether);
    }
}

/// @dev Contract that attempts reentrancy when receiving ETH
contract ReentrantOwner {
    address public target;
    uint8 public attackType; // 0 = none, 1 = withdrawETH reentrancy

    function setTarget(address _target) external {
        target = _target;
    }

    function setAttackType(uint8 _type) external {
        attackType = _type;
    }

    receive() external payable {
        if (attackType == 1 && target != address(0)) {
            // Attempt to re-enter withdrawETH
            attackType = 0; // prevent infinite loop
            FlashloanExecutor(payable(target)).withdrawETH(1 ether);
        }
    }
}

/// @title Security Audit Tests - Finding F-05: Emergency Withdrawal Reentrancy Protection
/// @notice Tests that emergencyWithdrawToken and emergencyWithdrawETH have nonReentrant.
contract EmergencyWithdrawalReentrancyTest is Test {
    TestableReceiver internal receiver;
    SecurityMockToken internal token;

    address internal aavePool = makeAddr("aavePool");
    address internal balancerVault = makeAddr("balancerVault");
    address internal owner;

    function setUp() public {
        ReentrantEmergencyOwner reentrantOwner = new ReentrantEmergencyOwner();
        owner = address(reentrantOwner);

        receiver = new TestableReceiver(aavePool, balancerVault, owner);
        token = new SecurityMockToken();

        token.mint(address(receiver), 100 ether);
        vm.deal(address(receiver), 10 ether);
    }

    /// @notice F-05a: emergencyWithdrawETH is protected against reentrancy
    function test_revertWhen_emergencyWithdrawETHReentered() public {
        ReentrantEmergencyOwner(payable(owner)).setReceiver(address(receiver));
        ReentrantEmergencyOwner(payable(owner)).setAttackType(1);

        vm.prank(owner);
        vm.expectRevert(); // ReentrancyGuardReentrantCall
        receiver.emergencyWithdrawETH(owner, 1 ether);
    }

    /// @notice F-05b: Normal emergency ETH withdrawal works
    function test_normalEmergencyWithdrawETHWorks() public {
        ReentrantEmergencyOwner(payable(owner)).setAttackType(0);

        vm.prank(owner);
        receiver.emergencyWithdrawETH(owner, 1 ether);

        assertEq(address(owner).balance, 1 ether);
    }
}

/// @dev Contract that attempts reentrancy on emergencyWithdrawETH
contract ReentrantEmergencyOwner {
    address public receiverAddr;
    uint8 public attackType;

    function setReceiver(address _receiver) external {
        receiverAddr = _receiver;
    }

    function setAttackType(uint8 _type) external {
        attackType = _type;
    }

    receive() external payable {
        if (attackType == 1 && receiverAddr != address(0)) {
            attackType = 0;
            TestableReceiver(payable(receiverAddr)).emergencyWithdrawETH(address(this), 1 ether);
        }
    }
}

/// @title Security Audit Tests - Finding F-06: Flash Loan Active Flag Lifecycle
/// @notice Tests that the _flashLoanActive flag is properly set and cleared during execution.
contract FlashLoanActiveFlagTest is Test {
    FlashloanExecutor internal executor;
    SecurityMockToken internal token;
    SecurityMockAdapter internal adapter;
    SecurityMockAavePool internal aavePool;

    address internal balancerVault = makeAddr("balancerVault");
    address internal owner = makeAddr("owner");
    address internal botWallet = makeAddr("botWallet");
    address internal attacker = makeAddr("attacker");

    uint256 internal constant MIN_PROFIT = 0.001 ether;
    uint256 internal constant LOAN_AMOUNT = 100 ether;

    function setUp() public {
        token = new SecurityMockToken();
        aavePool = new SecurityMockAavePool();
        adapter = new SecurityMockAdapter();

        executor = new FlashloanExecutor(
            address(aavePool), balancerVault, owner, botWallet, MIN_PROFIT
        );

        vm.prank(owner);
        executor.registerAdapter(address(adapter));
    }

    /// @notice F-06a: uniswapV3FlashCallback reverts after a successful arbitrage (flag cleared)
    function test_callbackFailsAfterArbitrageComplete() public {
        // Execute a successful arbitrage
        uint256 premium = (LOAN_AMOUNT * 5) / 10_000;
        uint256 returnAmount = LOAN_AMOUNT + premium + MIN_PROFIT + 1 ether;

        adapter.setMultiplier(returnAmount, LOAN_AMOUNT);
        token.mint(address(adapter), returnAmount);
        token.mint(address(aavePool), LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter),
            tokenIn: address(token),
            tokenOut: address(token),
            amountIn: LOAN_AMOUNT,
            extraData: ""
        });

        vm.prank(owner);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);

        // After execution, the callback should be blocked
        vm.prank(attacker);
        vm.expectRevert(FlashloanReceiver.NoActiveFlashLoan.selector);
        executor.uniswapV3FlashCallback(0, 0, "");
    }

    /// @notice F-06b: callFunction reverts after a successful arbitrage (flag cleared)
    function test_callFunctionFailsAfterArbitrageComplete() public {
        uint256 premium = (LOAN_AMOUNT * 5) / 10_000;
        uint256 returnAmount = LOAN_AMOUNT + premium + MIN_PROFIT + 1 ether;

        adapter.setMultiplier(returnAmount, LOAN_AMOUNT);
        token.mint(address(adapter), returnAmount);
        token.mint(address(aavePool), LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter),
            tokenIn: address(token),
            tokenOut: address(token),
            amountIn: LOAN_AMOUNT,
            extraData: ""
        });

        vm.prank(owner);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);

        vm.prank(attacker);
        vm.expectRevert(FlashloanReceiver.NoActiveFlashLoan.selector);
        executor.callFunction(address(0), address(0), 0, "");
    }
}

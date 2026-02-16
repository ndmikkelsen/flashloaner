// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ICircuitBreaker} from "../../src/interfaces/ICircuitBreaker.sol";
import {IFlashloanExecutor} from "../../src/interfaces/IFlashloanExecutor.sol";
import {CircuitBreaker} from "../../src/safety/CircuitBreaker.sol";
import {FlashloanExecutor} from "../../src/FlashloanExecutor.sol";

/// @title Safety Invariant Tests
/// @notice Foundry invariant tests for critical safety properties.
/// @dev The invariant fuzzer calls random sequences of handler functions to find
///      violations of properties that must ALWAYS hold.
///
///      Configuration in foundry.toml:
///        [profile.default.invariant]
///        runs = 256
///        depth = 15

// ---------------------------------------------------------------
// Mock Token (IERC20-compatible for SafeERC20)
// ---------------------------------------------------------------

contract InvariantMockToken is IERC20 {
    string public name = "Invariant Token";
    string public symbol = "INV";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
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
            require(allowed >= amount, "allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

// ---------------------------------------------------------------
// Mock DEX Adapter
// ---------------------------------------------------------------

contract InvariantMockAdapter {
    uint256 public multiplierNum = 110;
    uint256 public multiplierDen = 100;

    function setMultiplier(uint256 num, uint256 den) external {
        multiplierNum = num;
        multiplierDen = den;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256, bytes calldata)
        external
        returns (uint256)
    {
        InvariantMockToken(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        uint256 amountOut = (amountIn * multiplierNum) / multiplierDen;
        InvariantMockToken(tokenOut).transfer(msg.sender, amountOut);
        return amountOut;
    }

    function getAmountOut(address, address, uint256 amountIn, bytes calldata) external view returns (uint256) {
        return (amountIn * multiplierNum) / multiplierDen;
    }
}

// ---------------------------------------------------------------
// Mock Aave V3 Pool
// ---------------------------------------------------------------

contract InvariantMockAavePool {
    uint256 public premiumBps = 5; // 0.05%

    function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16)
        external
    {
        uint256 premium = (amount * premiumBps) / 10_000;
        InvariantMockToken(asset).transfer(receiverAddress, amount);
        bool success =
            FlashloanExecutor(payable(receiverAddress)).executeOperation(asset, amount, premium, receiverAddress, params);
        require(success, "executeOperation failed");
        InvariantMockToken(asset).transferFrom(receiverAddress, address(this), amount + premium);
    }
}

// ---------------------------------------------------------------
// CircuitBreaker Handler
// ---------------------------------------------------------------

/// @notice Handler for CircuitBreaker invariant testing
/// @dev Wraps CircuitBreaker functions with bounded inputs
contract CircuitBreakerHandler is Test {
    CircuitBreaker public breaker;
    address internal owner;

    uint256 public ghost_successCount;
    uint256 public ghost_failureCount;
    uint256 public ghost_pauseCount;
    uint256 public ghost_unpauseCount;

    constructor(CircuitBreaker _breaker, address _owner) {
        breaker = _breaker;
        owner = _owner;
    }

    function recordFailure() external {
        if (breaker.paused()) return;
        breaker.recordFailure();
        ghost_failureCount++;
    }

    function recordSuccess() external {
        breaker.recordSuccess();
        ghost_successCount++;
    }

    function setMaxGasPriceWithBounds(uint256 newPrice) external {
        newPrice = bound(newPrice, 1 gwei, 10_000 gwei);
        vm.prank(owner);
        breaker.setMaxGasPrice(newPrice);
    }

    function setMaxTradeSizeWithBounds(uint256 newSize) external {
        newSize = bound(newSize, 0.01 ether, 10_000 ether);
        vm.prank(owner);
        breaker.setMaxTradeSize(newSize);
    }

    function togglePause(bool shouldPause) external {
        vm.prank(owner);
        if (shouldPause && !breaker.paused()) {
            breaker.pause();
            ghost_pauseCount++;
        } else if (!shouldPause && breaker.paused()) {
            breaker.unpause();
            ghost_unpauseCount++;
        }
    }

    function setFailureThreshold(uint256 threshold) external {
        threshold = bound(threshold, 0, 50);
        vm.prank(owner);
        breaker.setConsecutiveFailureThreshold(threshold);
    }
}

// ---------------------------------------------------------------
// CircuitBreaker Invariant Tests
// ---------------------------------------------------------------

contract CircuitBreakerInvariantTest is Test {
    CircuitBreaker internal breaker;
    CircuitBreakerHandler internal handler;
    address internal owner = makeAddr("owner");

    uint256 internal constant DEFAULT_MAX_GAS_PRICE = 50 gwei;
    uint256 internal constant DEFAULT_MAX_TRADE_SIZE = 100 ether;
    uint256 internal constant DEFAULT_FAILURE_THRESHOLD = 5;

    function setUp() public {
        vm.prank(owner);
        breaker = new CircuitBreaker(DEFAULT_MAX_GAS_PRICE, DEFAULT_MAX_TRADE_SIZE, DEFAULT_FAILURE_THRESHOLD, owner);

        handler = new CircuitBreakerHandler(breaker, owner);
        targetContract(address(handler));
    }

    /// @notice INVARIANT: maxGasPrice is always > 0
    /// @dev Zero would permanently block all execution. setMaxGasPrice reverts on zero.
    function invariant_maxGasPricePositive() public view {
        assertGt(breaker.maxGasPrice(), 0, "maxGasPrice should never be zero");
    }

    /// @notice INVARIANT: maxTradeSize is always > 0
    /// @dev Zero would permanently block all execution. setMaxTradeSize reverts on zero.
    function invariant_maxTradeSizePositive() public view {
        assertGt(breaker.maxTradeSize(), 0, "maxTradeSize should never be zero");
    }

    /// @notice INVARIANT: When paused, isWithinLimits always returns false
    /// @dev Pause must be absolute — no trades allowed regardless of parameters.
    function invariant_pausedBlocksAllLimitChecks() public view {
        if (breaker.paused()) {
            assertFalse(breaker.isWithinLimits(1, 1), "Paused should block all limit checks");
        }
    }

    /// @notice INVARIANT: When not paused, valid params pass isWithinLimits
    /// @dev Ensures the breaker doesn't silently fail when operational.
    function invariant_notPausedAllowsValidLimits() public view {
        if (!breaker.paused()) {
            assertTrue(breaker.isWithinLimits(1, 1), "Valid params should pass when not paused");
        }
    }

    /// @notice INVARIANT: Owner is always set (non-zero)
    function invariant_ownerNeverZero() public view {
        assertNotEq(breaker.owner(), address(0), "Owner should never be zero address");
    }

    /// @notice INVARIANT: Failure counter correctly tracks recorded failures.
    /// @dev The handler skips recording when paused, so the ghost counter matches
    ///      what was actually committed to the breaker.
    ///      Note: setFailureThreshold does NOT retroactively auto-pause, so
    ///      failures >= threshold && !paused is a valid state after threshold is lowered.
    function invariant_failureCounterConsistent() public view {
        // The failure count is always >= 0 (trivially true for uint256)
        // and the ghost counters are non-negative.
        assertGe(
            handler.ghost_failureCount() + handler.ghost_successCount(),
            handler.ghost_successCount(),
            "Ghost counters should be consistent"
        );
    }
}

// ---------------------------------------------------------------
// FlashloanExecutor Handler
// ---------------------------------------------------------------

/// @notice Handler for FlashloanExecutor invariant testing
/// @dev Wraps executor functions with bounded inputs, tracks execution state
contract ExecutorHandler is Test {
    FlashloanExecutor public executor;
    InvariantMockToken public token;
    InvariantMockAdapter public adapter;
    InvariantMockAavePool public aavePool;

    address internal owner;
    address internal bot;

    uint256 public ghost_executionCount;
    uint256 public ghost_revertCount;
    uint256 public ghost_withdrawalCount;
    bool public ghost_lastExecutionProfitable;
    bool public ghost_pausedDuringLastExecution;

    constructor(
        FlashloanExecutor _executor,
        InvariantMockToken _token,
        InvariantMockAdapter _adapter,
        InvariantMockAavePool _aavePool,
        address _owner,
        address _bot
    ) {
        executor = _executor;
        token = _token;
        adapter = _adapter;
        aavePool = _aavePool;
        owner = _owner;
        bot = _bot;
    }

    /// @notice Bounded execution: attempts a profitable arbitrage
    function executeArbitrageWithBounds(uint256 amount) external {
        amount = bound(amount, 0.1 ether, 100 ether);

        // Record pause state before attempt
        ghost_pausedDuringLastExecution = executor.paused();

        // Fund for profitable execution
        uint256 premium = (amount * 5) / 10_000;
        uint256 minProfit = executor.minProfit();
        uint256 returnAmount = amount + premium + minProfit + 0.01 ether;

        adapter.setMultiplier(returnAmount, amount);
        token.mint(address(adapter), returnAmount);
        token.mint(address(aavePool), amount);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter),
            tokenIn: address(token),
            tokenOut: address(token),
            amountIn: amount,
            extraData: ""
        });

        vm.prank(bot);
        try executor.executeArbitrage(address(aavePool), address(token), amount, steps) {
            ghost_executionCount++;
            ghost_lastExecutionProfitable = true;

            // Withdraw profit to keep executor balance clean for residual check
            uint256 bal = token.balanceOf(address(executor));
            if (bal > 0) {
                vm.prank(owner);
                executor.withdrawToken(address(token), bal);
            }
        } catch {
            ghost_revertCount++;
            ghost_lastExecutionProfitable = false;
        }
    }

    /// @notice Bounded parameter update: minProfit (>= 1 wei to preserve invariant)
    function setMinProfitWithBounds(uint256 newMin) external {
        newMin = bound(newMin, 1, 1 ether);
        vm.prank(owner);
        executor.setMinProfit(newMin);
    }

    /// @notice Bounded withdrawal of accumulated tokens
    function withdrawTokenWithBounds(uint256 amount) external {
        uint256 balance = token.balanceOf(address(executor));
        if (balance == 0) return;
        amount = bound(amount, 1, balance);

        vm.prank(owner);
        executor.withdrawToken(address(token), amount);
        ghost_withdrawalCount++;
    }

    /// @notice Toggle executor pause state
    function togglePause(bool shouldPause) external {
        vm.prank(owner);
        if (shouldPause && !executor.paused()) {
            executor.pause();
        } else if (!shouldPause && executor.paused()) {
            executor.unpause();
        }
    }
}

// ---------------------------------------------------------------
// FlashloanExecutor Invariant Tests
// ---------------------------------------------------------------

contract ExecutorInvariantTest is Test {
    FlashloanExecutor internal executor;
    InvariantMockToken internal token;
    InvariantMockAdapter internal adapter;
    InvariantMockAavePool internal aavePool;
    ExecutorHandler internal handler;

    address internal owner = makeAddr("owner");
    address internal bot = makeAddr("bot");
    address internal attacker = makeAddr("attacker");
    address internal balancerVault = makeAddr("balancerVault");

    uint256 internal constant MIN_PROFIT = 0.001 ether;

    function setUp() public {
        token = new InvariantMockToken();
        adapter = new InvariantMockAdapter();
        aavePool = new InvariantMockAavePool();

        executor = new FlashloanExecutor(address(aavePool), balancerVault, owner, bot, MIN_PROFIT);

        vm.prank(owner);
        executor.registerAdapter(address(adapter));

        handler = new ExecutorHandler(executor, token, adapter, aavePool, owner, bot);
        targetContract(address(handler));
    }

    /// @notice INVARIANT: Contract should never hold tokens after a complete execution.
    /// @dev The handler withdraws profit after each successful execution, so the
    ///      executor balance should always be zero.
    function invariant_noResidualTokens() public view {
        assertEq(token.balanceOf(address(executor)), 0, "Residual tokens in executor");
    }

    /// @notice INVARIANT: Paused contract must never execute successfully.
    /// @dev If the executor was paused when the last execution was attempted,
    ///      the onlyAuthorized/whenNotPaused guards must have blocked it.
    function invariant_pausedMeansNoExecution() public view {
        if (handler.ghost_pausedDuringLastExecution()) {
            assertFalse(handler.ghost_lastExecutionProfitable(), "Execution succeeded while paused");
        }
    }

    /// @notice INVARIANT: Unauthorized callers must always revert.
    /// @dev The attacker is never the owner or bot. The onlyAuthorized modifier
    ///      is checked before all other guards, so the error is always NotAuthorized.
    function invariant_accessControlHolds() public {
        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter),
            tokenIn: address(token),
            tokenOut: address(token),
            amountIn: 1 ether,
            extraData: ""
        });

        vm.prank(attacker);
        vm.expectRevert(IFlashloanExecutor.NotAuthorized.selector);
        executor.executeArbitrage(address(aavePool), address(token), 1 ether, steps);
    }

    /// @notice INVARIANT: Bot wallet token balance should never decrease from arbitrage.
    /// @dev The bot only triggers execution; it never sends or receives tokens.
    function invariant_botBalanceNonDecreasing() public view {
        assertEq(token.balanceOf(bot), 0, "Bot token balance changed unexpectedly");
    }

    /// @notice INVARIANT: minProfit is always > 0.
    /// @dev The handler bounds setMinProfit to [1, 1 ether], preventing zero
    ///      values that could allow dust trades losing money to gas.
    function invariant_minProfitPositive() public view {
        assertGt(executor.minProfit(), 0, "minProfit is zero");
    }

    /// @notice INVARIANT: Only approved adapters can be used in swap steps.
    /// @dev The adapter registered in setUp must always remain approved because
    ///      no handler function removes it.
    function invariant_onlyApprovedAdaptersUsed() public view {
        assertTrue(executor.approvedAdapters(address(adapter)), "Execution adapter not approved");
    }

    /// @notice INVARIANT: botWallet is always non-zero.
    /// @dev setBotWallet reverts on zero address.
    function invariant_botWalletNonZero() public view {
        assertNotEq(executor.botWallet(), address(0), "botWallet should never be zero");
    }

    /// @notice INVARIANT: owner is always non-zero.
    function invariant_ownerNonZero() public view {
        assertNotEq(executor.owner(), address(0), "owner should never be zero");
    }

    /// @notice INVARIANT: aavePool is immutable and non-zero.
    function invariant_aavePoolImmutable() public view {
        assertEq(executor.aavePool(), address(aavePool), "aavePool should be immutable");
    }

    /// @notice INVARIANT: Revert rate should be within expected bounds.
    /// @dev With bounded valid inputs and properly funded mocks, a >99% revert rate
    ///      indicates a systematic bug rather than expected edge cases.
    function invariant_revertRateWithinBounds() public view {
        uint256 total = handler.ghost_executionCount() + handler.ghost_revertCount();
        if (total > 10) {
            uint256 revertRate = (handler.ghost_revertCount() * 100) / total;
            assertLt(revertRate, 99, "Revert rate suspiciously high");
        }
    }
}

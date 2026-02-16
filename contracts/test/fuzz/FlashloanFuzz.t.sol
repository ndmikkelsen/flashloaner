// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FlashloanExecutor} from "../../src/FlashloanExecutor.sol";
import {FlashloanReceiver} from "../../src/FlashloanReceiver.sol";
import {IFlashloanExecutor} from "../../src/interfaces/IFlashloanExecutor.sol";
import {CircuitBreaker} from "../../src/safety/CircuitBreaker.sol";
import {ProfitValidator} from "../../src/safety/ProfitValidator.sol";
import {ICircuitBreaker} from "../../src/interfaces/ICircuitBreaker.sol";
import {IProfitValidator} from "../../src/interfaces/IProfitValidator.sol";

// ---------------------------------------------------------------
// Mock ERC20 Token
// ---------------------------------------------------------------

contract FuzzMockToken is IERC20 {
    string public name = "Fuzz Token";
    string public symbol = "FUZZ";
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
// Mock DEX Adapter (configurable multiplier)
// ---------------------------------------------------------------

contract FuzzMockAdapter {
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
        FuzzMockToken(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        uint256 amountOut = (amountIn * multiplierNum) / multiplierDen;
        FuzzMockToken(tokenOut).transfer(msg.sender, amountOut);
        return amountOut;
    }

    function getAmountOut(address, address, uint256 amountIn, bytes calldata) external view returns (uint256) {
        return (amountIn * multiplierNum) / multiplierDen;
    }
}

// ---------------------------------------------------------------
// Mock Aave V3 Pool
// ---------------------------------------------------------------

contract FuzzMockAavePool {
    uint256 public premiumBps = 5; // 0.05%

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16
    ) external {
        uint256 premium = (amount * premiumBps) / 10_000;
        FuzzMockToken(asset).transfer(receiverAddress, amount);
        bool success = FlashloanExecutor(payable(receiverAddress)).executeOperation(
            asset, amount, premium, receiverAddress, params
        );
        require(success, "MockAavePool: executeOperation returned false");
        FuzzMockToken(asset).transferFrom(receiverAddress, address(this), amount + premium);
    }
}

/// @title FlashloanExecutor Fuzz Tests
/// @notice Advanced fuzz tests for critical arbitrage paths
contract FlashloanExecutorFuzzTest is Test {
    FlashloanExecutor internal executor;
    FuzzMockToken internal tokenA;
    FuzzMockToken internal tokenB;
    FuzzMockToken internal tokenC;
    FuzzMockAdapter internal adapter1;
    FuzzMockAdapter internal adapter2;
    FuzzMockAavePool internal aavePool;

    address internal balancerVault = makeAddr("balancerVault");
    address internal owner = makeAddr("owner");
    address internal botWallet = makeAddr("botWallet");
    address internal attacker = makeAddr("attacker");

    uint256 internal constant MIN_PROFIT = 0.001 ether;

    function setUp() public {
        tokenA = new FuzzMockToken();
        tokenB = new FuzzMockToken();
        tokenC = new FuzzMockToken();
        aavePool = new FuzzMockAavePool();
        adapter1 = new FuzzMockAdapter();
        adapter2 = new FuzzMockAdapter();

        executor = new FlashloanExecutor(
            address(aavePool), balancerVault, owner, botWallet, MIN_PROFIT
        );

        vm.startPrank(owner);
        executor.registerAdapter(address(adapter1));
        executor.registerAdapter(address(adapter2));
        vm.stopPrank();
    }

    // ---------------------------------------------------------------
    // Fuzz: Single-Hop Arbitrage with Variable Amounts
    // ---------------------------------------------------------------

    /// @notice Fuzz: profitable single-hop with any valid loan amount
    function testFuzz_singleHopProfitable(uint256 loanAmount, uint256 profitBps) public {
        loanAmount = bound(loanAmount, 0.01 ether, 100_000 ether);
        profitBps = bound(profitBps, 10, 5000); // 0.1% to 50% profit

        uint256 premium = (loanAmount * 5) / 10_000; // Aave 0.05%
        uint256 returnAmount = loanAmount + premium + MIN_PROFIT + (loanAmount * profitBps) / 10_000;

        adapter1.setMultiplier(returnAmount, loanAmount);
        tokenA.mint(address(adapter1), returnAmount);
        tokenA.mint(address(aavePool), loanAmount);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(tokenA),
            tokenOut: address(tokenA),
            amountIn: loanAmount,
            extraData: ""
        });

        vm.prank(botWallet);
        executor.executeArbitrage(address(aavePool), address(tokenA), loanAmount, steps);

        assertGt(tokenA.balanceOf(address(executor)), 0, "Should have profit");
    }

    /// @notice Fuzz: unprofitable swap always reverts
    function testFuzz_unprofitableSwapReverts(uint256 loanAmount, uint256 lossBps) public {
        loanAmount = bound(loanAmount, 1 ether, 10_000 ether);
        lossBps = bound(lossBps, 1, 5000); // 0.01% to 50% loss

        uint256 returnAmount = loanAmount - (loanAmount * lossBps) / 10_000;
        if (returnAmount == 0) returnAmount = 1;

        adapter1.setMultiplier(returnAmount, loanAmount);
        tokenA.mint(address(adapter1), returnAmount);
        tokenA.mint(address(aavePool), loanAmount);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(tokenA),
            tokenOut: address(tokenA),
            amountIn: loanAmount,
            extraData: ""
        });

        vm.prank(botWallet);
        vm.expectRevert(); // InsufficientProfit or Aave repayment failure
        executor.executeArbitrage(address(aavePool), address(tokenA), loanAmount, steps);
    }

    // ---------------------------------------------------------------
    // Fuzz: Multi-Hop Arbitrage
    // ---------------------------------------------------------------

    /// @notice Fuzz: two-hop arbitrage with variable multipliers
    function testFuzz_twoHopArbitrage(uint256 loanAmount, uint256 mul1Num, uint256 mul2Num) public {
        loanAmount = bound(loanAmount, 1 ether, 10_000 ether);
        // Both multipliers > 1.0 to ensure profit
        mul1Num = bound(mul1Num, 110, 200); // 1.1x to 2.0x
        mul2Num = bound(mul2Num, 100, 200); // 1.0x to 2.0x

        // Combined effect must cover Aave premium + minProfit
        uint256 premium = (loanAmount * 5) / 10_000;
        uint256 afterHop1 = (loanAmount * mul1Num) / 100;
        uint256 afterHop2 = (afterHop1 * mul2Num) / 100;
        // Skip if not profitable enough
        vm.assume(afterHop2 > loanAmount + premium + MIN_PROFIT);

        adapter1.setMultiplier(mul1Num, 100);
        adapter2.setMultiplier(mul2Num, 100);

        // Fund adapters
        tokenB.mint(address(adapter1), afterHop1);
        tokenA.mint(address(adapter2), afterHop2);
        tokenA.mint(address(aavePool), loanAmount);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](2);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(tokenA),
            tokenOut: address(tokenB),
            amountIn: loanAmount,
            extraData: ""
        });
        steps[1] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter2),
            tokenIn: address(tokenB),
            tokenOut: address(tokenA),
            amountIn: 0, // use full balance
            extraData: ""
        });

        vm.prank(botWallet);
        executor.executeArbitrage(address(aavePool), address(tokenA), loanAmount, steps);

        assertGt(tokenA.balanceOf(address(executor)), 0, "Should have profit from multi-hop");
    }

    // ---------------------------------------------------------------
    // Fuzz: Access Control
    // ---------------------------------------------------------------

    /// @notice Fuzz: random callers always revert on executeArbitrage
    function testFuzz_unauthorizedCallerReverts(address caller) public {
        vm.assume(caller != owner && caller != botWallet);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(tokenA),
            tokenOut: address(tokenA),
            amountIn: 1 ether,
            extraData: ""
        });

        vm.prank(caller);
        vm.expectRevert(IFlashloanExecutor.NotAuthorized.selector);
        executor.executeArbitrage(address(aavePool), address(tokenA), 1 ether, steps);
    }

    /// @notice Fuzz: random callers cannot call admin functions
    function testFuzz_unauthorizedAdminFunctions(address caller) public {
        vm.assume(caller != owner);

        vm.startPrank(caller);

        vm.expectRevert();
        executor.registerAdapter(makeAddr("adapter"));

        vm.expectRevert();
        executor.removeAdapter(address(adapter1));

        vm.expectRevert();
        executor.setBotWallet(makeAddr("newBot"));

        vm.expectRevert();
        executor.setMinProfit(1 ether);

        vm.expectRevert();
        executor.pause();

        vm.expectRevert();
        executor.withdrawToken(address(tokenA), 1);

        vm.expectRevert();
        executor.withdrawETH(1);

        vm.stopPrank();
    }

    // ---------------------------------------------------------------
    // Fuzz: Flash Loan Callback Security
    // ---------------------------------------------------------------

    /// @notice Fuzz: executeOperation rejects random callers
    function testFuzz_executeOperationRejectsRandomCaller(address caller) public {
        vm.assume(caller != address(aavePool));

        vm.prank(caller);
        vm.expectRevert(
            abi.encodeWithSelector(FlashloanReceiver.UnauthorizedCaller.selector, caller, address(aavePool))
        );
        executor.executeOperation(address(tokenA), 1 ether, 0, address(executor), "");
    }

    /// @notice Fuzz: executeOperation rejects wrong initiator
    function testFuzz_executeOperationRejectsWrongInitiator(address initiator) public {
        vm.assume(initiator != address(executor));

        vm.prank(address(aavePool));
        vm.expectRevert(
            abi.encodeWithSelector(FlashloanReceiver.UnauthorizedInitiator.selector, initiator)
        );
        executor.executeOperation(address(tokenA), 1 ether, 0, initiator, "");
    }

    /// @notice Fuzz: receiveFlashLoan rejects random callers
    function testFuzz_receiveFlashLoanRejectsRandomCaller(address caller) public {
        vm.assume(caller != balancerVault);

        address[] memory tokens = new address[](1);
        tokens[0] = address(tokenA);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;
        uint256[] memory fees = new uint256[](1);
        fees[0] = 0;

        vm.prank(caller);
        vm.expectRevert(
            abi.encodeWithSelector(FlashloanReceiver.UnauthorizedCaller.selector, caller, balancerVault)
        );
        executor.receiveFlashLoan(tokens, amounts, fees, "");
    }

    // ---------------------------------------------------------------
    // Fuzz: Withdrawal
    // ---------------------------------------------------------------

    /// @notice Fuzz: owner can withdraw any amount of deposited tokens
    function testFuzz_withdrawToken(uint256 depositAmount, uint256 withdrawAmount) public {
        depositAmount = bound(depositAmount, 1, type(uint128).max);
        withdrawAmount = bound(withdrawAmount, 1, depositAmount);

        tokenA.mint(address(executor), depositAmount);

        vm.prank(owner);
        executor.withdrawToken(address(tokenA), withdrawAmount);

        assertEq(tokenA.balanceOf(owner), withdrawAmount);
        assertEq(tokenA.balanceOf(address(executor)), depositAmount - withdrawAmount);
    }

    /// @notice Fuzz: owner can withdraw any amount of deposited ETH
    function testFuzz_withdrawETH(uint256 depositAmount, uint256 withdrawAmount) public {
        depositAmount = bound(depositAmount, 1, 10_000 ether);
        withdrawAmount = bound(withdrawAmount, 1, depositAmount);

        vm.deal(address(executor), depositAmount);

        vm.prank(owner);
        executor.withdrawETH(withdrawAmount);

        assertEq(owner.balance, withdrawAmount);
        assertEq(address(executor).balance, depositAmount - withdrawAmount);
    }

    // ---------------------------------------------------------------
    // Fuzz: MinProfit Threshold Enforcement
    // ---------------------------------------------------------------

    /// @notice Fuzz: profit exactly at minProfit boundary succeeds
    function testFuzz_profitAtMinProfitBoundary(uint256 loanAmount, uint256 minProfitVal) public {
        loanAmount = bound(loanAmount, 1 ether, 10_000 ether);
        minProfitVal = bound(minProfitVal, 1, 1 ether);

        // Set minProfit
        vm.prank(owner);
        executor.setMinProfit(minProfitVal);

        uint256 premium = (loanAmount * 5) / 10_000;
        // Return exactly loan + premium + minProfit
        uint256 returnAmount = loanAmount + premium + minProfitVal;

        adapter1.setMultiplier(returnAmount, loanAmount);
        tokenA.mint(address(adapter1), returnAmount);
        tokenA.mint(address(aavePool), loanAmount);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(tokenA),
            tokenOut: address(tokenA),
            amountIn: loanAmount,
            extraData: ""
        });

        vm.prank(botWallet);
        executor.executeArbitrage(address(aavePool), address(tokenA), loanAmount, steps);

        assertGe(tokenA.balanceOf(address(executor)), minProfitVal);
    }

    /// @notice Fuzz: profit just below minProfit reverts
    /// @dev Profit is checked in _executeArbitrage as (balanceAfter - balanceBefore) where
    ///      balanceBefore = loanAmount (received from Aave, before swaps).
    ///      The Aave premium is repaid AFTER _executeArbitrage, so gross profit must exceed minProfit.
    ///      To trigger InsufficientProfit, returnAmount must be < loanAmount + minProfit.
    function testFuzz_profitBelowMinProfitReverts(uint256 loanAmount) public {
        loanAmount = bound(loanAmount, 1 ether, 1_000 ether);

        // Return loanAmount + half of MIN_PROFIT: gross profit = MIN_PROFIT/2 < MIN_PROFIT
        uint256 halfMinProfit = MIN_PROFIT / 2;
        uint256 returnAmount = loanAmount + halfMinProfit;

        adapter1.setMultiplier(returnAmount, loanAmount);
        tokenA.mint(address(adapter1), returnAmount);
        tokenA.mint(address(aavePool), loanAmount);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(tokenA),
            tokenOut: address(tokenA),
            amountIn: loanAmount,
            extraData: ""
        });

        vm.prank(botWallet);
        vm.expectRevert(); // InsufficientProfit
        executor.executeArbitrage(address(aavePool), address(tokenA), loanAmount, steps);
    }

    // ---------------------------------------------------------------
    // Fuzz: Paused State
    // ---------------------------------------------------------------

    /// @notice Fuzz: paused contract rejects execution from owner
    function testFuzz_pausedRejectsExecutionOwner(uint256 loanAmount) public {
        loanAmount = bound(loanAmount, 0.01 ether, 10_000 ether);

        vm.prank(owner);
        executor.pause();

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(tokenA),
            tokenOut: address(tokenA),
            amountIn: loanAmount,
            extraData: ""
        });

        vm.prank(owner);
        vm.expectRevert(FlashloanExecutor.ContractPaused.selector);
        executor.executeArbitrage(address(aavePool), address(tokenA), loanAmount, steps);
    }

    /// @notice Fuzz: paused contract rejects execution from bot
    function testFuzz_pausedRejectsExecutionBot(uint256 loanAmount) public {
        loanAmount = bound(loanAmount, 0.01 ether, 10_000 ether);

        vm.prank(owner);
        executor.pause();

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(tokenA),
            tokenOut: address(tokenA),
            amountIn: loanAmount,
            extraData: ""
        });

        vm.prank(botWallet);
        vm.expectRevert(FlashloanExecutor.ContractPaused.selector);
        executor.executeArbitrage(address(aavePool), address(tokenA), loanAmount, steps);
    }
}

/// @title CircuitBreaker Advanced Fuzz Tests
/// @notice Fuzz tests for consecutive failure tracking and combined limit checks
contract CircuitBreakerFuzzTest is Test {
    CircuitBreaker internal breaker;
    address internal owner = makeAddr("owner");

    uint256 internal constant MAX_GAS = 50 gwei;
    uint256 internal constant MAX_TRADE = 100 ether;
    uint256 internal constant FAILURE_THRESHOLD = 5;

    function setUp() public {
        vm.prank(owner);
        breaker = new CircuitBreaker(MAX_GAS, MAX_TRADE, FAILURE_THRESHOLD, owner);
    }

    /// @notice Fuzz: consecutive failures exactly at threshold triggers auto-pause
    function testFuzz_autoPauseAtExactThreshold(uint256 threshold) public {
        threshold = bound(threshold, 1, 100);

        vm.prank(owner);
        breaker.setConsecutiveFailureThreshold(threshold);

        for (uint256 i = 0; i < threshold - 1; i++) {
            breaker.recordFailure();
            assertFalse(breaker.paused(), "Should not pause before threshold");
        }

        breaker.recordFailure();
        assertTrue(breaker.paused(), "Should auto-pause at threshold");
        assertEq(breaker.consecutiveFailures(), threshold);
    }

    /// @notice Fuzz: success always resets failure counter regardless of count
    function testFuzz_successResetsFailureCounter(uint256 failureCount) public {
        failureCount = bound(failureCount, 1, 100);

        // Disable auto-pause so we can accumulate failures
        vm.prank(owner);
        breaker.setConsecutiveFailureThreshold(0);

        for (uint256 i = 0; i < failureCount; i++) {
            breaker.recordFailure();
        }
        assertEq(breaker.consecutiveFailures(), failureCount);

        breaker.recordSuccess();
        assertEq(breaker.consecutiveFailures(), 0);
    }

    /// @notice Fuzz: interleaved failures and successes never cause false auto-pause
    function testFuzz_interleavedNeverFalsePause(uint256 seed) public {
        // Sequence of random failures/successes, each less than threshold
        uint256 ops = bound(seed, 10, 50);

        for (uint256 i = 0; i < ops; i++) {
            // Record 1 to (threshold-1) failures, then a success
            uint256 failures = (uint256(keccak256(abi.encodePacked(seed, i))) % (FAILURE_THRESHOLD - 1)) + 1;
            for (uint256 j = 0; j < failures; j++) {
                breaker.recordFailure();
            }
            breaker.recordSuccess();
            assertFalse(breaker.paused(), "Should never auto-pause with interleaved success");
            assertEq(breaker.consecutiveFailures(), 0);
        }
    }

    /// @notice Fuzz: combined gas and trade size limits with random parameters
    function testFuzz_combinedLimitCheck(uint256 gasPrice, uint256 amount) public view {
        bool expectedResult = (gasPrice <= MAX_GAS) && (amount <= MAX_TRADE);
        assertEq(breaker.isWithinLimits(gasPrice, amount), expectedResult);
    }

    /// @notice Fuzz: updated parameters are enforced immediately
    function testFuzz_updatedParametersEnforced(uint256 newGas, uint256 newTrade, uint256 testGas, uint256 testTrade)
        public
    {
        newGas = bound(newGas, 1, type(uint128).max);
        newTrade = bound(newTrade, 1, type(uint128).max);

        vm.startPrank(owner);
        breaker.setMaxGasPrice(newGas);
        breaker.setMaxTradeSize(newTrade);
        vm.stopPrank();

        bool expected = (testGas <= newGas) && (testTrade <= newTrade);
        assertEq(breaker.isWithinLimits(testGas, testTrade), expected);
    }
}

/// @title ProfitValidator Advanced Fuzz Tests
/// @notice Additional edge case fuzz tests for profit validation
contract ProfitValidatorFuzzTest is Test {
    ProfitValidator internal validator;
    address internal token = makeAddr("token");

    function setUp() public {
        validator = new ProfitValidator();
    }

    /// @notice Fuzz: overflow safety with large balances
    function testFuzz_largeBalancesNoOverflow(uint256 balanceBefore, uint256 profit) public {
        // Ensure no overflow: balanceBefore + profit must not exceed uint256 max
        balanceBefore = bound(balanceBefore, 0, type(uint128).max);
        profit = bound(profit, 1, type(uint128).max);
        uint256 balanceAfter = balanceBefore + profit;

        uint256 result = validator.validateProfit(token, balanceBefore, balanceAfter, 1);
        assertEq(result, profit);
    }

    /// @notice Fuzz: minProfit = 0 accepts any positive profit
    function testFuzz_zeroMinProfitAcceptsAnyProfit(uint256 balanceBefore, uint256 profit) public {
        balanceBefore = bound(balanceBefore, 0, type(uint128).max);
        profit = bound(profit, 1, type(uint128).max);
        uint256 balanceAfter = balanceBefore + profit;

        uint256 result = validator.validateProfit(token, balanceBefore, balanceAfter, 0);
        assertEq(result, profit);
    }

    /// @notice Fuzz: any loss always reverts regardless of minProfit
    function testFuzz_lossAlwaysReverts(uint256 balanceBefore, uint256 loss, uint256 minProfit) public {
        balanceBefore = bound(balanceBefore, 1, type(uint128).max);
        loss = bound(loss, 1, balanceBefore);
        uint256 balanceAfter = balanceBefore - loss;

        vm.expectRevert(
            abi.encodeWithSelector(IProfitValidator.ExecutionLoss.selector, balanceBefore, balanceAfter)
        );
        validator.validateProfit(token, balanceBefore, balanceAfter, minProfit);
    }
}

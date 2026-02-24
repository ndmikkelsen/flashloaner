// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FlashloanExecutor} from "../../src/FlashloanExecutor.sol";
import {FlashloanReceiver} from "../../src/FlashloanReceiver.sol";
import {IFlashloanExecutor} from "../../src/interfaces/IFlashloanExecutor.sol";

// ---------------------------------------------------------------
// Mock ERC20 Token (with approve/transferFrom support for SafeERC20)
// ---------------------------------------------------------------

contract MockToken is IERC20 {
    string public name = "Mock Token";
    string public symbol = "MOCK";
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
// Mock DEX Adapter (implements IDEXAdapter.swap)
// ---------------------------------------------------------------

/// @dev Simulates a swap: pulls tokenIn, sends tokenOut at a configured rate.
contract MockAdapter {
    /// @dev Multiplier numerator (amountOut = amountIn * multiplierNum / multiplierDen)
    uint256 public multiplierNum = 1;
    uint256 public multiplierDen = 1;
    bool public shouldRevert;

    function setMultiplier(uint256 num, uint256 den) external {
        multiplierNum = num;
        multiplierDen = den;
    }

    function setRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256, /* amountOutMin */
        bytes calldata /* extraData */
    ) external returns (uint256) {
        require(!shouldRevert, "MockAdapter: swap reverted");

        // Pull tokenIn from caller
        MockToken(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        // Calculate output
        uint256 amountOut = (amountIn * multiplierNum) / multiplierDen;

        // Send tokenOut to caller
        MockToken(tokenOut).transfer(msg.sender, amountOut);

        return amountOut;
    }

    function getAmountOut(address, address, uint256 amountIn, bytes calldata) external view returns (uint256) {
        return (amountIn * multiplierNum) / multiplierDen;
    }
}

// ---------------------------------------------------------------
// Mock Aave V3 Pool
// ---------------------------------------------------------------

/// @dev Simulates Aave V3 Pool.flashLoanSimple: sends tokens, calls
///      executeOperation on the receiver, then pulls back loan + premium.
contract MockAavePool {
    uint256 public premiumBps = 5; // 0.05% like real Aave

    function setPremiumBps(uint256 bps) external {
        premiumBps = bps;
    }

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 /* referralCode */
    ) external {
        uint256 premium = (amount * premiumBps) / 10_000;

        // Send the loan amount to the receiver
        MockToken(asset).transfer(receiverAddress, amount);

        // Call executeOperation on the receiver
        bool success = FlashloanExecutor(payable(receiverAddress)).executeOperation(
            asset, amount, premium, receiverAddress, params
        );
        require(success, "MockAavePool: executeOperation returned false");

        // Pull back the loan + premium
        MockToken(asset).transferFrom(receiverAddress, address(this), amount + premium);
    }
}

// ---------------------------------------------------------------
// Mock Balancer Vault
// ---------------------------------------------------------------

/// @dev Simulates Balancer Vault.flashLoan: sends tokens, calls
///      receiveFlashLoan on the receiver, then expects tokens to be returned.
///      Balancer V2 charges 0% fee on flash loans.
contract MockBalancerVault {
    function flashLoan(
        address recipient,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata userData
    ) external {
        // Send the loan amount to the recipient
        MockToken(tokens[0]).transfer(recipient, amounts[0]);

        // Prepare fee amounts (Balancer = 0%)
        uint256[] memory feeAmounts = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            feeAmounts[i] = 0;
        }

        // Call receiveFlashLoan on the recipient
        FlashloanExecutor(payable(recipient)).receiveFlashLoan(
            tokens, amounts, feeAmounts, userData
        );

        // Verify tokens were returned (Balancer pulls via transfer in the callback)
        // The receiver's receiveFlashLoan already does safeTransfer back to vault
    }
}

// ---------------------------------------------------------------
// FlashloanExecutorTest
// ---------------------------------------------------------------

contract FlashloanExecutorTest is Test {
    FlashloanExecutor internal executor;
    MockToken internal token;
    MockToken internal tokenB;
    MockAdapter internal adapter1;
    MockAdapter internal adapter2;
    MockAavePool internal aavePool;
    MockBalancerVault internal balancerVault;
    address internal owner = makeAddr("owner");
    address internal botWallet = makeAddr("botWallet");
    address internal attacker = makeAddr("attacker");
    address internal treasury = makeAddr("treasury");

    uint256 internal constant MIN_PROFIT = 0.01 ether;
    uint256 internal constant LOAN_AMOUNT = 100 ether;

    function setUp() public {
        // Deploy mocks
        token = new MockToken();
        tokenB = new MockToken();
        aavePool = new MockAavePool();
        balancerVault = new MockBalancerVault();
        adapter1 = new MockAdapter();
        adapter2 = new MockAdapter();

        // Deploy executor
        executor = new FlashloanExecutor(
            address(aavePool),
            address(balancerVault),
            owner,
            botWallet,
            MIN_PROFIT
        );

        // Register adapter1 as approved
        vm.prank(owner);
        executor.registerAdapter(address(adapter1));
    }

    // ---------------------------------------------------------------
    // Constructor Tests
    // ---------------------------------------------------------------

    function test_constructorSetsState() public view {
        assertEq(executor.owner(), owner);
        assertEq(executor.botWallet(), botWallet);
        assertEq(executor.minProfit(), MIN_PROFIT);
        assertEq(executor.aavePool(), address(aavePool));
        assertEq(executor.balancerVault(), address(balancerVault));
        assertFalse(executor.paused());
    }

    function test_revertWhen_constructorZeroBotWallet() public {
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        new FlashloanExecutor(
            address(aavePool), address(balancerVault), owner, address(0), MIN_PROFIT
        );
    }

    function test_revertWhen_constructorZeroAavePool() public {
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        new FlashloanExecutor(
            address(0), address(balancerVault), owner, botWallet, MIN_PROFIT
        );
    }

    function test_revertWhen_constructorZeroBalancerVault() public {
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        new FlashloanExecutor(
            address(aavePool), address(0), owner, botWallet, MIN_PROFIT
        );
    }

    function test_constructorAllowsZeroMinProfit() public {
        FlashloanExecutor ex = new FlashloanExecutor(
            address(aavePool), address(balancerVault), owner, botWallet, 0
        );
        assertEq(ex.minProfit(), 0);
    }

    // ---------------------------------------------------------------
    // Adapter Management Tests
    // ---------------------------------------------------------------

    function test_registerAdapter() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit IFlashloanExecutor.AdapterRegistered(address(adapter2));
        executor.registerAdapter(address(adapter2));

        assertTrue(executor.approvedAdapters(address(adapter2)));
    }

    function test_revertWhen_registerAdapterByNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        executor.registerAdapter(address(adapter2));
    }

    function test_revertWhen_registerAdapterZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        executor.registerAdapter(address(0));
    }

    function test_removeAdapter() public {
        assertTrue(executor.approvedAdapters(address(adapter1)));

        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit IFlashloanExecutor.AdapterRemoved(address(adapter1));
        executor.removeAdapter(address(adapter1));

        assertFalse(executor.approvedAdapters(address(adapter1)));
    }

    function test_revertWhen_removeAdapterByNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        executor.removeAdapter(address(adapter1));
    }

    function test_revertWhen_removeAdapterZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        executor.removeAdapter(address(0));
    }

    // ---------------------------------------------------------------
    // Access Control Tests
    // ---------------------------------------------------------------

    function test_executeArbitrage_ownerCanCall() public {
        // Set up a profitable single-hop swap
        _setupProfitableSwap(adapter1, LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(owner);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);
    }

    function test_executeArbitrage_botWalletCanCall() public {
        _setupProfitableSwap(adapter1, LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(botWallet);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);
    }

    function test_revertWhen_executeArbitrageByAttacker() public {
        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(attacker);
        vm.expectRevert(IFlashloanExecutor.NotAuthorized.selector);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);
    }

    // ---------------------------------------------------------------
    // Input Validation Tests
    // ---------------------------------------------------------------

    function test_revertWhen_zeroFlashLoanProvider() public {
        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        executor.executeArbitrage(address(0), address(token), LOAN_AMOUNT, steps);
    }

    function test_revertWhen_zeroFlashLoanToken() public {
        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        executor.executeArbitrage(address(aavePool), address(0), LOAN_AMOUNT, steps);
    }

    function test_revertWhen_zeroFlashLoanAmount() public {
        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAmount.selector);
        executor.executeArbitrage(address(aavePool), address(token), 0, steps);
    }

    function test_revertWhen_emptySwapSteps() public {
        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](0);

        vm.prank(owner);
        vm.expectRevert(IFlashloanExecutor.EmptySwapSteps.selector);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);
    }

    function test_revertWhen_unapprovedAdapter() public {
        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter2), // not registered
            tokenIn: address(token),
            tokenOut: address(tokenB),
            amountIn: LOAN_AMOUNT,
            extraData: ""
        });

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(IFlashloanExecutor.AdapterNotApproved.selector, address(adapter2))
        );
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);
    }

    // ---------------------------------------------------------------
    // Single-Hop Arbitrage Tests
    // ---------------------------------------------------------------

    function test_executeArbitrage_singleHopProfitable() public {
        _setupProfitableSwap(adapter1, LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(owner);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);

        // Executor should hold the profit (minus Aave premium)
        uint256 executorBalance = token.balanceOf(address(executor));
        assertGt(executorBalance, 0, "Executor should have profit");
    }

    function test_executeArbitrage_emitsArbitrageExecuted() public {
        _setupProfitableSwap(adapter1, LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        // We expect the ArbitrageExecuted event
        vm.expectEmit(true, false, false, false);
        emit IFlashloanExecutor.ArbitrageExecuted(address(token), 0, 0);

        vm.prank(owner);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);
    }

    function test_revertWhen_swapNotProfitable() public {
        // Set adapter to return less than input (losing swap)
        adapter1.setMultiplier(90, 100); // 90% return = loss

        // Fund adapter with tokenB, fund pool with token
        tokenB.mint(address(adapter1), LOAN_AMOUNT);
        token.mint(address(aavePool), LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](2);
        // Step 1: token -> tokenB (at loss)
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(token),
            tokenOut: address(tokenB),
            amountIn: LOAN_AMOUNT,
            extraData: ""
        });
        // Step 2: tokenB -> token (at loss)
        steps[1] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(tokenB),
            tokenOut: address(token),
            amountIn: 0, // use full balance
            extraData: ""
        });

        // Fund adapter with tokens for the return swap
        token.mint(address(adapter1), LOAN_AMOUNT);

        vm.prank(owner);
        vm.expectRevert(); // InsufficientProfit
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);
    }

    function test_revertWhen_profitBelowMinimum() public {
        // Profit check in _executeArbitrage compares balanceAfter vs balanceBefore + minProfit
        // balanceBefore = LOAN_AMOUNT (received from Aave)
        // We need: returnAmount - LOAN_AMOUNT < minProfit (so it reverts)
        // returnAmount = LOAN_AMOUNT + tinyProfit where tinyProfit < minProfit
        uint256 tinyProfit = MIN_PROFIT / 2; // Half of min profit
        uint256 returnAmount = LOAN_AMOUNT + tinyProfit;

        MockAdapter directAdapter = new MockAdapter();
        token.mint(address(directAdapter), returnAmount);
        token.mint(address(aavePool), LOAN_AMOUNT);

        directAdapter.setMultiplier(returnAmount, LOAN_AMOUNT);

        vm.prank(owner);
        executor.registerAdapter(address(directAdapter));

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(directAdapter),
            tokenIn: address(token),
            tokenOut: address(token),
            amountIn: LOAN_AMOUNT,
            extraData: ""
        });

        vm.prank(owner);
        vm.expectRevert(); // InsufficientProfit
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);
    }

    // ---------------------------------------------------------------
    // Balancer Flash Loan Provider Tests
    // ---------------------------------------------------------------

    function test_executeArbitrage_balancerProvider() public {
        // Set up a profitable swap via Balancer (0% fee)
        _setupProfitableBalancerSwap(adapter1, LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(owner);
        executor.executeArbitrage(address(balancerVault), address(token), LOAN_AMOUNT, steps);

        // Executor should hold the profit (no Balancer premium)
        uint256 executorBalance = token.balanceOf(address(executor));
        assertGt(executorBalance, 0, "Executor should have profit from Balancer flash loan");
    }

    function test_executeArbitrage_balancerZeroFee() public {
        // Balancer charges 0% fee, so profit should be higher than with Aave's 0.05%
        _setupProfitableBalancerSwap(adapter1, LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(owner);
        executor.executeArbitrage(address(balancerVault), address(token), LOAN_AMOUNT, steps);

        uint256 balancerProfit = token.balanceOf(address(executor));

        // Compare: Aave would have taken a 0.05% premium from the same setup
        // Balancer profit should be at least minProfit
        assertGe(balancerProfit, MIN_PROFIT, "Balancer profit should meet minimum threshold");
    }

    function test_executeArbitrage_balancerEmitsArbitrageExecuted() public {
        _setupProfitableBalancerSwap(adapter1, LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.expectEmit(true, false, false, false);
        emit IFlashloanExecutor.ArbitrageExecuted(address(token), 0, 0);

        vm.prank(owner);
        executor.executeArbitrage(address(balancerVault), address(token), LOAN_AMOUNT, steps);
    }

    function test_revertWhen_unsupportedFlashLoanProvider() public {
        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        address unsupported = makeAddr("unsupportedProvider");

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(FlashloanExecutor.UnsupportedFlashLoanProvider.selector, unsupported)
        );
        executor.executeArbitrage(unsupported, address(token), LOAN_AMOUNT, steps);
    }

    function test_executeArbitrage_balancerMultiHop() public {
        // Register adapter2
        vm.prank(owner);
        executor.registerAdapter(address(adapter2));

        // Set up: token -> tokenB -> token
        adapter1.setMultiplier(110, 100);
        adapter2.setMultiplier(100, 100);

        // Fund adapters and Balancer vault
        tokenB.mint(address(adapter1), 200 ether);
        token.mint(address(adapter2), 200 ether);
        token.mint(address(balancerVault), LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](2);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(token),
            tokenOut: address(tokenB),
            amountIn: LOAN_AMOUNT,
            extraData: ""
        });
        steps[1] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter2),
            tokenIn: address(tokenB),
            tokenOut: address(token),
            amountIn: 0, // use full balance
            extraData: ""
        });

        vm.prank(owner);
        executor.executeArbitrage(address(balancerVault), address(token), LOAN_AMOUNT, steps);

        // 100 * 1.1 = 110 tokenB, 110 * 1.0 = 110 token
        // Repay: 100 + 0 (Balancer 0% fee) = 100
        // Profit: 110 - 100 = 10 ether (more than Aave's ~9.95 due to no fee)
        uint256 executorBalance = token.balanceOf(address(executor));
        assertGt(executorBalance, 9 ether, "Should have ~10 ether profit with Balancer");
    }

    // ---------------------------------------------------------------
    // Multi-Hop Arbitrage Tests
    // ---------------------------------------------------------------

    function test_executeArbitrage_multiHop() public {
        // Register adapter2
        vm.prank(owner);
        executor.registerAdapter(address(adapter2));

        // Set up: token -> tokenB -> token
        // adapter1: token -> tokenB at 1.1x (10% gain)
        adapter1.setMultiplier(110, 100);
        // adapter2: tokenB -> token at 1.0x (no gain/loss)
        adapter2.setMultiplier(100, 100);

        // Fund adapters
        tokenB.mint(address(adapter1), 200 ether);
        token.mint(address(adapter2), 200 ether);
        // Fund Aave pool with loan amount
        token.mint(address(aavePool), LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](2);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(token),
            tokenOut: address(tokenB),
            amountIn: LOAN_AMOUNT,
            extraData: ""
        });
        steps[1] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter2),
            tokenIn: address(tokenB),
            tokenOut: address(token),
            amountIn: 0, // use full balance of tokenB
            extraData: ""
        });

        vm.prank(owner);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);

        // 100 * 1.1 = 110 tokenB, 110 * 1.0 = 110 token
        // Repay: 100 + premium (0.05%) = 100.05
        // Profit: 110 - 100.05 = ~9.95 ether
        uint256 executorBalance = token.balanceOf(address(executor));
        assertGt(executorBalance, 9 ether, "Should have ~9.95 ether profit");
    }

    function test_executeArbitrage_amountInZeroUsesFullBalance() public {
        // This tests that when amountIn = 0, the swap uses full token balance
        vm.prank(owner);
        executor.registerAdapter(address(adapter2));

        adapter1.setMultiplier(110, 100);
        adapter2.setMultiplier(100, 100);

        tokenB.mint(address(adapter1), 200 ether);
        token.mint(address(adapter2), 200 ether);
        token.mint(address(aavePool), LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](2);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(token),
            tokenOut: address(tokenB),
            amountIn: LOAN_AMOUNT,
            extraData: ""
        });
        steps[1] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter2),
            tokenIn: address(tokenB),
            tokenOut: address(token),
            amountIn: 0, // <-- use full balance
            extraData: ""
        });

        vm.prank(owner);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);

        // If amountIn=0 works, adapter2 should have received 110 ether of tokenB
        // and returned 110 ether of token
        uint256 executorBalance = token.balanceOf(address(executor));
        assertGt(executorBalance, 9 ether);
    }

    // ---------------------------------------------------------------
    // Pause Tests
    // ---------------------------------------------------------------

    function test_pause() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit FlashloanExecutor.Paused(owner);
        executor.pause();

        assertTrue(executor.paused());
    }

    function test_unpause() public {
        vm.startPrank(owner);
        executor.pause();

        vm.expectEmit(true, false, false, false);
        emit FlashloanExecutor.Unpaused(owner);
        executor.unpause();
        vm.stopPrank();

        assertFalse(executor.paused());
    }

    function test_revertWhen_pauseByNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        executor.pause();
    }

    function test_revertWhen_unpauseByNonOwner() public {
        vm.prank(owner);
        executor.pause();

        vm.prank(attacker);
        vm.expectRevert();
        executor.unpause();
    }

    function test_revertWhen_executeArbitrageWhilePaused() public {
        vm.prank(owner);
        executor.pause();

        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(owner);
        vm.expectRevert(FlashloanExecutor.ContractPaused.selector);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);
    }

    function test_executeArbitrage_worksAfterUnpause() public {
        vm.startPrank(owner);
        executor.pause();
        executor.unpause();
        vm.stopPrank();

        _setupProfitableSwap(adapter1, LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(owner);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);
    }

    // ---------------------------------------------------------------
    // Admin: setBotWallet
    // ---------------------------------------------------------------

    function test_setBotWallet() public {
        address newBot = makeAddr("newBot");

        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit IFlashloanExecutor.BotWalletUpdated(botWallet, newBot);
        executor.setBotWallet(newBot);

        assertEq(executor.botWallet(), newBot);
    }

    function test_revertWhen_setBotWalletZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        executor.setBotWallet(address(0));
    }

    function test_revertWhen_setBotWalletByNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        executor.setBotWallet(makeAddr("newBot"));
    }

    function test_newBotWalletCanExecute() public {
        address newBot = makeAddr("newBot");
        vm.prank(owner);
        executor.setBotWallet(newBot);

        _setupProfitableSwap(adapter1, LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(newBot);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);
    }

    function test_oldBotWalletCannotExecuteAfterChange() public {
        address newBot = makeAddr("newBot");
        vm.prank(owner);
        executor.setBotWallet(newBot);

        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(botWallet); // old bot
        vm.expectRevert(IFlashloanExecutor.NotAuthorized.selector);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);
    }

    // ---------------------------------------------------------------
    // Admin: setMinProfit
    // ---------------------------------------------------------------

    function test_setMinProfit() public {
        uint256 newMin = 1 ether;

        vm.prank(owner);
        vm.expectEmit(false, false, false, true);
        emit IFlashloanExecutor.MinProfitUpdated(MIN_PROFIT, newMin);
        executor.setMinProfit(newMin);

        assertEq(executor.minProfit(), newMin);
    }

    function test_revertWhen_setMinProfitByNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        executor.setMinProfit(1 ether);
    }

    function test_setMinProfitToZero() public {
        vm.prank(owner);
        executor.setMinProfit(0);
        assertEq(executor.minProfit(), 0);
    }

    // ---------------------------------------------------------------
    // Withdrawal Tests
    // ---------------------------------------------------------------

    function test_withdrawToken() public {
        uint256 amount = 10 ether;
        token.mint(address(executor), amount);

        vm.prank(owner);
        vm.expectEmit(true, true, false, true);
        emit IFlashloanExecutor.ProfitWithdrawn(address(token), owner, amount);
        executor.withdrawToken(address(token), amount);

        assertEq(token.balanceOf(owner), amount);
        assertEq(token.balanceOf(address(executor)), 0);
    }

    function test_revertWhen_withdrawTokenByNonOwner() public {
        token.mint(address(executor), 10 ether);

        vm.prank(attacker);
        vm.expectRevert();
        executor.withdrawToken(address(token), 10 ether);
    }

    function test_revertWhen_withdrawTokenZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAddress.selector);
        executor.withdrawToken(address(0), 1 ether);
    }

    function test_revertWhen_withdrawTokenZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAmount.selector);
        executor.withdrawToken(address(token), 0);
    }

    function test_withdrawETH() public {
        uint256 amount = 5 ether;
        vm.deal(address(executor), amount);

        vm.prank(owner);
        vm.expectEmit(true, true, false, true);
        emit IFlashloanExecutor.ProfitWithdrawn(address(0), owner, amount);
        executor.withdrawETH(amount);

        assertEq(owner.balance, amount);
        assertEq(address(executor).balance, 0);
    }

    function test_revertWhen_withdrawETHByNonOwner() public {
        vm.deal(address(executor), 5 ether);

        vm.prank(attacker);
        vm.expectRevert();
        executor.withdrawETH(5 ether);
    }

    function test_revertWhen_withdrawETHZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(FlashloanReceiver.ZeroAmount.selector);
        executor.withdrawETH(0);
    }

    // ---------------------------------------------------------------
    // Flash Loan Callback Security Tests
    // ---------------------------------------------------------------

    function test_revertWhen_executeOperationCalledByNonPool() public {
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(FlashloanReceiver.UnauthorizedCaller.selector, attacker, address(aavePool))
        );
        executor.executeOperation(address(token), LOAN_AMOUNT, 0, address(executor), "");
    }

    function test_revertWhen_executeOperationWrongInitiator() public {
        vm.prank(address(aavePool));
        vm.expectRevert(
            abi.encodeWithSelector(FlashloanReceiver.UnauthorizedInitiator.selector, attacker)
        );
        executor.executeOperation(address(token), LOAN_AMOUNT, 0, attacker, "");
    }

    // ---------------------------------------------------------------
    // Temporary Storage Cleanup Tests
    // ---------------------------------------------------------------

    function test_pendingStepsCleanedAfterExecution() public {
        _setupProfitableSwap(adapter1, LOAN_AMOUNT);

        IFlashloanExecutor.SwapStep[] memory steps = _singleSwapStep(adapter1);

        vm.prank(owner);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);

        // After successful execution, calling again should work (steps are cleaned)
        // Re-fund for another round
        _setupProfitableSwap(adapter1, LOAN_AMOUNT);

        vm.prank(owner);
        executor.executeArbitrage(address(aavePool), address(token), LOAN_AMOUNT, steps);
    }

    // ---------------------------------------------------------------
    // Fuzz Tests
    // ---------------------------------------------------------------

    function testFuzz_executeArbitrage_variousAmounts(uint256 loanAmount) public {
        loanAmount = bound(loanAmount, 1 ether, 10_000 ether);

        _setupProfitableSwap(adapter1, loanAmount);

        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter1),
            tokenIn: address(token),
            tokenOut: address(token),
            amountIn: loanAmount,
            extraData: ""
        });

        vm.prank(owner);
        executor.executeArbitrage(address(aavePool), address(token), loanAmount, steps);

        assertGt(token.balanceOf(address(executor)), 0, "Should have profit");
    }

    function testFuzz_setMinProfit_variousValues(uint256 newMin) public {
        vm.prank(owner);
        executor.setMinProfit(newMin);
        assertEq(executor.minProfit(), newMin);
    }

    function testFuzz_registerAndRemoveAdapter(address adapterAddr) public {
        vm.assume(adapterAddr != address(0));

        vm.startPrank(owner);
        executor.registerAdapter(adapterAddr);
        assertTrue(executor.approvedAdapters(adapterAddr));

        executor.removeAdapter(adapterAddr);
        assertFalse(executor.approvedAdapters(adapterAddr));
        vm.stopPrank();
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    /// @dev Set up a profitable single-hop token -> token swap.
    ///      The adapter returns 110% of input, giving ~10% profit minus Aave fee.
    function _setupProfitableSwap(MockAdapter adapter, uint256 amount) internal {
        // adapter swaps token -> token at 1.1x + enough to cover premium + minProfit
        uint256 premium = (amount * 5) / 10_000; // 0.05% Aave fee
        uint256 returnAmount = amount + premium + MIN_PROFIT + 0.01 ether; // guarantee profit

        adapter.setMultiplier(returnAmount, amount);

        // Fund adapter with enough token to pay out
        token.mint(address(adapter), returnAmount);

        // Fund Aave pool with enough token for the loan
        token.mint(address(aavePool), amount);
    }

    /// @dev Set up a profitable single-hop swap funded via Balancer (0% fee).
    function _setupProfitableBalancerSwap(MockAdapter adapter, uint256 amount) internal {
        // Balancer charges 0% fee, so no premium needed
        uint256 returnAmount = amount + MIN_PROFIT + 0.01 ether; // guarantee profit

        adapter.setMultiplier(returnAmount, amount);

        // Fund adapter with enough token to pay out
        token.mint(address(adapter), returnAmount);

        // Fund Balancer vault with enough token for the loan
        token.mint(address(balancerVault), amount);
    }

    /// @dev Create a single swap step: token -> token through the given adapter
    function _singleSwapStep(MockAdapter adapter) internal view returns (IFlashloanExecutor.SwapStep[] memory) {
        IFlashloanExecutor.SwapStep[] memory steps = new IFlashloanExecutor.SwapStep[](1);
        steps[0] = IFlashloanExecutor.SwapStep({
            adapter: address(adapter),
            tokenIn: address(token),
            tokenOut: address(token),
            amountIn: LOAN_AMOUNT,
            extraData: ""
        });
        return steps;
    }
}

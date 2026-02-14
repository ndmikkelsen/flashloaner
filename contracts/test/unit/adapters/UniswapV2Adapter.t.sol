// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDEXAdapter} from "../../../src/interfaces/IDEXAdapter.sol";
import {UniswapV2Adapter, IUniswapV2Router02} from "../../../src/adapters/UniswapV2Adapter.sol";

/// @dev Minimal ERC20 mock for adapter tests.
contract MockToken is IERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "ERC20: transfer exceeds balance");
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
        require(allowance[from][msg.sender] >= amount, "ERC20: insufficient allowance");
        require(balanceOf[from] >= amount, "ERC20: transfer exceeds balance");
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

/// @dev Mock Uniswap V2 Router that simulates swaps at a configurable rate.
contract MockUniswapV2Router is IUniswapV2Router02 {
    /// @dev Output rate as basis points (10000 = 1:1). Set per-test.
    uint256 public outputRate = 9970; // 99.7% (simulates 0.3% fee)

    /// @dev If true, the next swap will return 0 output.
    bool public returnZero;

    address private _factory;

    function factory() external pure returns (address) {
        return address(0);
    }

    function setOutputRate(uint256 _rate) external {
        outputRate = _rate;
    }

    function setReturnZero(bool _returnZero) external {
        returnZero = _returnZero;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256, /* amountOutMin */
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external returns (uint256[] memory amounts) {
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];

        // Pull input tokens from adapter
        MockToken(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        // Calculate output
        uint256 amountOut = returnZero ? 0 : (amountIn * outputRate) / 10_000;

        // For multi-hop, apply rate per hop
        for (uint256 i = 1; i < path.length - 1;) {
            amountOut = (amountOut * outputRate) / 10_000;
            unchecked {
                ++i;
            }
        }

        // Mint output tokens to recipient
        MockToken(tokenOut).mint(to, amountOut);

        // Build amounts array
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        uint256 currentAmount = amountIn;
        for (uint256 i = 1; i < path.length;) {
            currentAmount = (currentAmount * outputRate) / 10_000;
            amounts[i] = currentAmount;
            unchecked {
                ++i;
            }
        }
    }
}

/// @title UniswapV2AdapterTest
/// @notice Unit tests for UniswapV2Adapter DEX adapter.
contract UniswapV2AdapterTest is Test {
    UniswapV2Adapter internal adapter;
    MockUniswapV2Router internal mockRouter;
    MockToken internal tokenA;
    MockToken internal tokenB;
    MockToken internal weth;

    address internal caller = makeAddr("caller");

    uint256 internal constant SWAP_AMOUNT = 100 ether;

    function setUp() public {
        mockRouter = new MockUniswapV2Router();
        adapter = new UniswapV2Adapter(address(mockRouter));
        tokenA = new MockToken("Token A", "TKNA");
        tokenB = new MockToken("Token B", "TKNB");
        weth = new MockToken("Wrapped ETH", "WETH");
    }

    // ---------------------------------------------------------------
    // Constructor Tests
    // ---------------------------------------------------------------

    function test_constructorSetsRouter() public view {
        assertEq(address(adapter.router()), address(mockRouter));
    }

    function test_revertWhen_constructorZeroRouter() public {
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        new UniswapV2Adapter(address(0));
    }

    function test_deadlineOffsetIs300() public view {
        assertEq(adapter.DEADLINE_OFFSET(), 300);
    }

    // ---------------------------------------------------------------
    // Direct Swap Tests (no extraData)
    // ---------------------------------------------------------------

    function test_swap_directSuccess() public {
        // Fund caller and approve adapter
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, "");
        vm.stopPrank();

        // 99.7% of 100 ether = 99.7 ether
        uint256 expected = (SWAP_AMOUNT * 9970) / 10_000;
        assertEq(amountOut, expected);
        assertEq(tokenB.balanceOf(caller), expected);
        assertEq(tokenA.balanceOf(caller), 0);
    }

    function test_swap_emitsSwapExecuted() public {
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        uint256 expected = (SWAP_AMOUNT * 9970) / 10_000;
        vm.expectEmit(true, true, false, true);
        emit IDEXAdapter.SwapExecuted(address(tokenA), address(tokenB), SWAP_AMOUNT, expected);

        adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, "");
        vm.stopPrank();
    }

    function test_swap_respectsAmountOutMin() public {
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        uint256 expected = (SWAP_AMOUNT * 9970) / 10_000;
        // amountOutMin <= actual output should succeed
        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, expected, "");
        vm.stopPrank();

        assertEq(amountOut, expected);
    }

    // ---------------------------------------------------------------
    // Multi-hop Swap Tests (with extraData)
    // ---------------------------------------------------------------

    function test_swap_multiHopViaWETH() public {
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        // Encode WETH as intermediate
        bytes memory extraData = abi.encode(_toArray(address(weth)));

        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, extraData);
        vm.stopPrank();

        // Two hops: 100 * 0.997 * 0.997 = ~99.4009
        uint256 afterFirstHop = (SWAP_AMOUNT * 9970) / 10_000;
        uint256 expected = (afterFirstHop * 9970) / 10_000;
        assertEq(amountOut, expected);
        assertEq(tokenB.balanceOf(caller), expected);
    }

    // ---------------------------------------------------------------
    // getAmountOut Tests
    // ---------------------------------------------------------------

    function test_getAmountOut_directPath() public view {
        uint256 quote = adapter.getAmountOut(address(tokenA), address(tokenB), SWAP_AMOUNT, "");
        uint256 expected = (SWAP_AMOUNT * 9970) / 10_000;
        assertEq(quote, expected);
    }

    function test_getAmountOut_multiHop() public view {
        bytes memory extraData = abi.encode(_toArray(address(weth)));
        uint256 quote = adapter.getAmountOut(address(tokenA), address(tokenB), SWAP_AMOUNT, extraData);

        uint256 afterFirstHop = (SWAP_AMOUNT * 9970) / 10_000;
        uint256 expected = (afterFirstHop * 9970) / 10_000;
        assertEq(quote, expected);
    }

    // ---------------------------------------------------------------
    // Revert Tests
    // ---------------------------------------------------------------

    function test_revertWhen_swapZeroTokenIn() public {
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        adapter.swap(address(0), address(tokenB), SWAP_AMOUNT, 0, "");
    }

    function test_revertWhen_swapZeroTokenOut() public {
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        adapter.swap(address(tokenA), address(0), SWAP_AMOUNT, 0, "");
    }

    function test_revertWhen_swapZeroAmountIn() public {
        vm.expectRevert(IDEXAdapter.ZeroAmountIn.selector);
        adapter.swap(address(tokenA), address(tokenB), 0, 0, "");
    }

    function test_revertWhen_getAmountOutZeroTokenIn() public {
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        adapter.getAmountOut(address(0), address(tokenB), SWAP_AMOUNT, "");
    }

    function test_revertWhen_getAmountOutZeroTokenOut() public {
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        adapter.getAmountOut(address(tokenA), address(0), SWAP_AMOUNT, "");
    }

    function test_revertWhen_getAmountOutZeroAmountIn() public {
        vm.expectRevert(IDEXAdapter.ZeroAmountIn.selector);
        adapter.getAmountOut(address(tokenA), address(tokenB), 0, "");
    }

    function test_revertWhen_swapReturnsZeroOutput() public {
        mockRouter.setReturnZero(true);

        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        vm.expectRevert(IDEXAdapter.ZeroAmountOut.selector);
        adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, "");
        vm.stopPrank();
    }

    function test_revertWhen_slippageExceeded() public {
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        // Set amountOutMin higher than what the swap returns
        uint256 expected = (SWAP_AMOUNT * 9970) / 10_000;
        uint256 tooHighMin = expected + 1;

        vm.expectRevert(abi.encodeWithSelector(IDEXAdapter.SlippageExceeded.selector, expected, tooHighMin));
        adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, tooHighMin, "");
        vm.stopPrank();
    }

    // ---------------------------------------------------------------
    // Fuzz Tests
    // ---------------------------------------------------------------

    function testFuzz_swap_variousAmounts(uint256 amountIn) public {
        amountIn = bound(amountIn, 1, 1_000_000 ether);

        tokenA.mint(caller, amountIn);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), amountIn);

        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), amountIn, 0, "");
        vm.stopPrank();

        uint256 expected = (amountIn * 9970) / 10_000;
        assertEq(amountOut, expected);
        assertEq(tokenB.balanceOf(caller), expected);
    }

    function testFuzz_getAmountOut_matchesSwap(uint256 amountIn) public {
        amountIn = bound(amountIn, 1, 1_000_000 ether);

        // Get quote
        uint256 quote = adapter.getAmountOut(address(tokenA), address(tokenB), amountIn, "");

        // Execute swap
        tokenA.mint(caller, amountIn);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), amountIn);
        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), amountIn, 0, "");
        vm.stopPrank();

        // Quote should match actual output
        assertEq(quote, amountOut);
    }

    function testFuzz_swap_variousOutputRates(uint256 rate) public {
        rate = bound(rate, 1, 20_000); // 0.01% to 200%
        mockRouter.setOutputRate(rate);

        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        uint256 expected = (SWAP_AMOUNT * rate) / 10_000;
        if (expected == 0) {
            vm.expectRevert(IDEXAdapter.ZeroAmountOut.selector);
            adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, "");
        } else {
            uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, "");
            assertEq(amountOut, expected);
        }
        vm.stopPrank();
    }

    // ---------------------------------------------------------------
    // Integration-style: Adapter called by executor pattern
    // ---------------------------------------------------------------

    function test_swap_calledByExecutorPattern() public {
        // Simulate how FlashloanExecutor calls the adapter:
        // 1. Executor holds tokens
        // 2. Executor approves adapter
        // 3. Executor calls adapter.swap()
        // 4. Output goes back to executor (msg.sender)
        address executor = makeAddr("executor");

        tokenA.mint(executor, SWAP_AMOUNT);
        vm.startPrank(executor);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, "");
        vm.stopPrank();

        // Output should be in executor's balance
        assertEq(tokenB.balanceOf(executor), amountOut);
        assertEq(tokenA.balanceOf(executor), 0);
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    function _toArray(address addr) internal pure returns (address[] memory) {
        address[] memory arr = new address[](1);
        arr[0] = addr;
        return arr;
    }
}

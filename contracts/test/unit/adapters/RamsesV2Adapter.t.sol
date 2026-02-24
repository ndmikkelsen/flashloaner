// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDEXAdapter} from "../../../src/interfaces/IDEXAdapter.sol";
import {RamsesV2Adapter, ISwapRouter, IQuoterV2} from "../../../src/adapters/RamsesV2Adapter.sol";

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

/// @dev Mock Ramses V3 SwapRouter that simulates swaps with fee-dependent rates.
contract MockSwapRouter is ISwapRouter {
    /// @dev Fee tier to output rate mapping (basis points, 10000 = 100%).
    /// Default: fee 500 -> 99.95%, fee 3000 -> 99.7%, fee 10000 -> 99.0%
    mapping(uint24 => uint256) public feeToRate;

    /// @dev If true, the next swap will return 0 output.
    bool public returnZero;

    constructor() {
        feeToRate[100] = 9999; // 0.01% fee -> 99.99%
        feeToRate[500] = 9995; // 0.05% fee -> 99.95%
        feeToRate[3000] = 9970; // 0.3% fee -> 99.7%
        feeToRate[10_000] = 9900; // 1% fee -> 99.0%
    }

    function setReturnZero(bool _returnZero) external {
        returnZero = _returnZero;
    }

    function setFeeRate(uint24 fee, uint256 rate) external {
        feeToRate[fee] = rate;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        // Pull tokens from adapter
        MockToken(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);

        // Calculate output based on fee tier
        uint256 rate = feeToRate[params.fee];
        amountOut = returnZero ? 0 : (params.amountIn * rate) / 10_000;

        // Mint output tokens to recipient
        MockToken(params.tokenOut).mint(params.recipient, amountOut);
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut) {
        // Decode path to get tokenIn and tokenOut
        (address tokenIn, address tokenOut, uint256 hops) = _decodePathEndpoints(params.path);

        // Pull tokens
        MockToken(tokenIn).transferFrom(msg.sender, address(this), params.amountIn);

        // Apply rate per hop
        amountOut = params.amountIn;
        bytes memory path = params.path;
        uint256 offset = 20; // skip first token address
        for (uint256 i = 0; i < hops;) {
            uint24 fee;
            assembly {
                fee := shr(232, mload(add(path, add(32, offset))))
            }
            uint256 rate = feeToRate[fee];
            amountOut = returnZero ? 0 : (amountOut * rate) / 10_000;
            offset += 23; // 3 bytes fee + 20 bytes next token
            unchecked {
                ++i;
            }
        }

        // Mint output to recipient
        MockToken(tokenOut).mint(params.recipient, amountOut);
    }

    function _decodePathEndpoints(bytes memory path) internal pure returns (address tokenIn, address tokenOut, uint256 hops) {
        require(path.length >= 43, "Invalid path"); // min: 20 + 3 + 20
        assembly {
            tokenIn := shr(96, mload(add(path, 32)))
            tokenOut := shr(96, mload(add(path, add(32, sub(mload(path), 20)))))
        }
        // Each hop is 23 bytes (3 fee + 20 token), path = 20 + n*23
        hops = (path.length - 20) / 23;
    }
}

/// @dev Mock QuoterV2 that returns deterministic quotes matching the MockSwapRouter.
contract MockQuoterV2 is IQuoterV2 {
    mapping(uint24 => uint256) public feeToRate;

    constructor() {
        feeToRate[100] = 9999;
        feeToRate[500] = 9995;
        feeToRate[3000] = 9970;
        feeToRate[10_000] = 9900;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        view
        returns (uint256 amountOut, uint160, uint32, uint256)
    {
        uint256 rate = feeToRate[params.fee];
        amountOut = (params.amountIn * rate) / 10_000;
    }

    function quoteExactInput(bytes memory path, uint256 amountIn)
        external
        view
        returns (uint256 amountOut, uint160[] memory, uint32[] memory, uint256)
    {
        amountOut = amountIn;
        uint256 offset = 20;
        while (offset < path.length - 20) {
            uint24 fee;
            assembly {
                fee := shr(232, mload(add(path, add(32, offset))))
            }
            uint256 rate = feeToRate[fee];
            amountOut = (amountOut * rate) / 10_000;
            offset += 23;
        }
    }
}

/// @title RamsesV2AdapterTest
/// @notice Unit tests for RamsesV2Adapter DEX adapter.
contract RamsesV2AdapterTest is Test {
    RamsesV2Adapter internal adapter;
    MockSwapRouter internal mockRouter;
    MockQuoterV2 internal mockQuoter;
    MockToken internal tokenA;
    MockToken internal tokenB;
    MockToken internal weth;

    address internal caller = makeAddr("caller");

    uint256 internal constant SWAP_AMOUNT = 100 ether;
    uint24 internal constant FEE_LOW = 500; // 0.05%
    uint24 internal constant FEE_MEDIUM = 3000; // 0.3%
    uint24 internal constant FEE_HIGH = 10_000; // 1%

    function setUp() public {
        mockRouter = new MockSwapRouter();
        mockQuoter = new MockQuoterV2();
        adapter = new RamsesV2Adapter(address(mockRouter), address(mockQuoter));
        tokenA = new MockToken("Token A", "TKNA");
        tokenB = new MockToken("Token B", "TKNB");
        weth = new MockToken("Wrapped ETH", "WETH");
    }

    // ---------------------------------------------------------------
    // Constructor Tests
    // ---------------------------------------------------------------

    function test_constructorSetsAddresses() public view {
        assertEq(address(adapter.swapRouter()), address(mockRouter));
        assertEq(address(adapter.quoter()), address(mockQuoter));
    }

    function test_revertWhen_constructorZeroRouter() public {
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        new RamsesV2Adapter(address(0), address(mockQuoter));
    }

    function test_revertWhen_constructorZeroQuoter() public {
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        new RamsesV2Adapter(address(mockRouter), address(0));
    }

    function test_deadlineOffsetIs300() public view {
        assertEq(adapter.DEADLINE_OFFSET(), 300);
    }

    // ---------------------------------------------------------------
    // Single-hop Swap Tests
    // ---------------------------------------------------------------

    function test_swap_singleHopMediumFee() public {
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        bytes memory extraData = abi.encode(FEE_MEDIUM);
        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, extraData);
        vm.stopPrank();

        uint256 expected = (SWAP_AMOUNT * 9970) / 10_000;
        assertEq(amountOut, expected);
        assertEq(tokenB.balanceOf(caller), expected);
    }

    function test_swap_singleHopLowFee() public {
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        bytes memory extraData = abi.encode(FEE_LOW);
        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, extraData);
        vm.stopPrank();

        uint256 expected = (SWAP_AMOUNT * 9995) / 10_000;
        assertEq(amountOut, expected);
    }

    function test_swap_singleHopHighFee() public {
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        bytes memory extraData = abi.encode(FEE_HIGH);
        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, extraData);
        vm.stopPrank();

        uint256 expected = (SWAP_AMOUNT * 9900) / 10_000;
        assertEq(amountOut, expected);
    }

    function test_swap_emitsSwapExecuted() public {
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        uint256 expected = (SWAP_AMOUNT * 9970) / 10_000;
        vm.expectEmit(true, true, false, true);
        emit IDEXAdapter.SwapExecuted(address(tokenA), address(tokenB), SWAP_AMOUNT, expected);

        adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, abi.encode(FEE_MEDIUM));
        vm.stopPrank();
    }

    function test_swap_respectsAmountOutMin() public {
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        uint256 expected = (SWAP_AMOUNT * 9970) / 10_000;
        uint256 amountOut =
            adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, expected, abi.encode(FEE_MEDIUM));
        vm.stopPrank();

        assertEq(amountOut, expected);
    }

    // ---------------------------------------------------------------
    // Multi-hop Swap Tests
    // ---------------------------------------------------------------

    function test_swap_multiHopTwoFees() public {
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        // tokenA --(3000)--> WETH --(500)--> tokenB
        uint24[] memory fees = new uint24[](2);
        fees[0] = FEE_MEDIUM;
        fees[1] = FEE_LOW;
        address[] memory intermediates = new address[](1);
        intermediates[0] = address(weth);

        bytes memory extraData = abi.encode(fees, intermediates);
        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, extraData);
        vm.stopPrank();

        // Two hops: 100 * 0.997 * 0.9995 = ~99.6501
        uint256 afterFirstHop = (SWAP_AMOUNT * 9970) / 10_000;
        uint256 expected = (afterFirstHop * 9995) / 10_000;
        assertEq(amountOut, expected);
        assertEq(tokenB.balanceOf(caller), expected);
    }

    function test_revertWhen_multiHopPathLengthMismatch() public {
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        // 3 fees but only 1 intermediate (should be 2)
        uint24[] memory fees = new uint24[](3);
        fees[0] = FEE_MEDIUM;
        fees[1] = FEE_LOW;
        fees[2] = FEE_HIGH;
        address[] memory intermediates = new address[](1);
        intermediates[0] = address(weth);

        bytes memory extraData = abi.encode(fees, intermediates);
        vm.expectRevert(RamsesV2Adapter.PathLengthMismatch.selector);
        adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, extraData);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------
    // getAmountOut Tests
    // ---------------------------------------------------------------

    function test_getAmountOut_singleHop() public view {
        bytes memory extraData = abi.encode(FEE_MEDIUM);
        uint256 quote = adapter.getAmountOut(address(tokenA), address(tokenB), SWAP_AMOUNT, extraData);

        uint256 expected = (SWAP_AMOUNT * 9970) / 10_000;
        assertEq(quote, expected);
    }

    function test_getAmountOut_multiHop() public view {
        uint24[] memory fees = new uint24[](2);
        fees[0] = FEE_MEDIUM;
        fees[1] = FEE_LOW;
        address[] memory intermediates = new address[](1);
        intermediates[0] = address(weth);

        bytes memory extraData = abi.encode(fees, intermediates);
        uint256 quote = adapter.getAmountOut(address(tokenA), address(tokenB), SWAP_AMOUNT, extraData);

        uint256 afterFirstHop = (SWAP_AMOUNT * 9970) / 10_000;
        uint256 expected = (afterFirstHop * 9995) / 10_000;
        assertEq(quote, expected);
    }

    function test_getAmountOut_matchesSwap() public {
        // Get quote
        bytes memory extraData = abi.encode(FEE_MEDIUM);
        uint256 quote = adapter.getAmountOut(address(tokenA), address(tokenB), SWAP_AMOUNT, extraData);

        // Execute swap
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);
        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, extraData);
        vm.stopPrank();

        assertEq(quote, amountOut);
    }

    // ---------------------------------------------------------------
    // Revert Tests
    // ---------------------------------------------------------------

    function test_revertWhen_swapZeroTokenIn() public {
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        adapter.swap(address(0), address(tokenB), SWAP_AMOUNT, 0, abi.encode(FEE_MEDIUM));
    }

    function test_revertWhen_swapZeroTokenOut() public {
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        adapter.swap(address(tokenA), address(0), SWAP_AMOUNT, 0, abi.encode(FEE_MEDIUM));
    }

    function test_revertWhen_swapZeroAmountIn() public {
        vm.expectRevert(IDEXAdapter.ZeroAmountIn.selector);
        adapter.swap(address(tokenA), address(tokenB), 0, 0, abi.encode(FEE_MEDIUM));
    }

    function test_revertWhen_getAmountOutZeroTokenIn() public {
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        adapter.getAmountOut(address(0), address(tokenB), SWAP_AMOUNT, abi.encode(FEE_MEDIUM));
    }

    function test_revertWhen_getAmountOutZeroTokenOut() public {
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        adapter.getAmountOut(address(tokenA), address(0), SWAP_AMOUNT, abi.encode(FEE_MEDIUM));
    }

    function test_revertWhen_getAmountOutZeroAmountIn() public {
        vm.expectRevert(IDEXAdapter.ZeroAmountIn.selector);
        adapter.getAmountOut(address(tokenA), address(tokenB), 0, abi.encode(FEE_MEDIUM));
    }

    function test_revertWhen_swapReturnsZeroOutput() public {
        mockRouter.setReturnZero(true);

        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        vm.expectRevert(IDEXAdapter.ZeroAmountOut.selector);
        adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, abi.encode(FEE_MEDIUM));
        vm.stopPrank();
    }

    function test_revertWhen_slippageExceeded() public {
        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        uint256 expected = (SWAP_AMOUNT * 9970) / 10_000;
        uint256 tooHighMin = expected + 1;

        vm.expectRevert(abi.encodeWithSelector(IDEXAdapter.SlippageExceeded.selector, expected, tooHighMin));
        adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, tooHighMin, abi.encode(FEE_MEDIUM));
        vm.stopPrank();
    }

    // ---------------------------------------------------------------
    // Fee Tier Tests
    // ---------------------------------------------------------------

    function test_differentFeeTiersProduceDifferentOutputs() public {
        // Low fee = higher output
        bytes memory lowFeeData = abi.encode(FEE_LOW);
        uint256 lowFeeQuote = adapter.getAmountOut(address(tokenA), address(tokenB), SWAP_AMOUNT, lowFeeData);

        // Medium fee = lower output
        bytes memory medFeeData = abi.encode(FEE_MEDIUM);
        uint256 medFeeQuote = adapter.getAmountOut(address(tokenA), address(tokenB), SWAP_AMOUNT, medFeeData);

        // High fee = lowest output
        bytes memory highFeeData = abi.encode(FEE_HIGH);
        uint256 highFeeQuote = adapter.getAmountOut(address(tokenA), address(tokenB), SWAP_AMOUNT, highFeeData);

        assertGt(lowFeeQuote, medFeeQuote);
        assertGt(medFeeQuote, highFeeQuote);
    }

    // ---------------------------------------------------------------
    // Executor Integration Pattern Test
    // ---------------------------------------------------------------

    function test_swap_calledByExecutorPattern() public {
        address executor = makeAddr("executor");

        tokenA.mint(executor, SWAP_AMOUNT);
        vm.startPrank(executor);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        uint256 amountOut =
            adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, abi.encode(FEE_MEDIUM));
        vm.stopPrank();

        assertEq(tokenB.balanceOf(executor), amountOut);
        assertEq(tokenA.balanceOf(executor), 0);
    }

    // ---------------------------------------------------------------
    // Fuzz Tests
    // ---------------------------------------------------------------

    function testFuzz_swap_variousAmounts(uint256 amountIn) public {
        // Min 10_000 to avoid rounding to zero
        amountIn = bound(amountIn, 10_000, 1_000_000 ether);

        tokenA.mint(caller, amountIn);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), amountIn);

        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), amountIn, 0, abi.encode(FEE_MEDIUM));
        vm.stopPrank();

        uint256 expected = (amountIn * 9970) / 10_000;
        assertEq(amountOut, expected);
    }

    function testFuzz_getAmountOut_matchesSwap(uint256 amountIn) public {
        amountIn = bound(amountIn, 10_000, 1_000_000 ether);

        bytes memory extraData = abi.encode(FEE_MEDIUM);
        uint256 quote = adapter.getAmountOut(address(tokenA), address(tokenB), amountIn, extraData);

        tokenA.mint(caller, amountIn);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), amountIn);
        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), amountIn, 0, extraData);
        vm.stopPrank();

        assertEq(quote, amountOut);
    }

    function testFuzz_swap_allFeeTiers(uint8 feeIdx) public {
        uint24[4] memory tiers = [uint24(100), uint24(500), uint24(3000), uint24(10_000)];
        uint24 fee = tiers[feeIdx % 4];

        tokenA.mint(caller, SWAP_AMOUNT);
        vm.startPrank(caller);
        tokenA.approve(address(adapter), SWAP_AMOUNT);

        uint256 amountOut = adapter.swap(address(tokenA), address(tokenB), SWAP_AMOUNT, 0, abi.encode(fee));
        vm.stopPrank();

        assertGt(amountOut, 0);
        assertEq(tokenB.balanceOf(caller), amountOut);
    }
}

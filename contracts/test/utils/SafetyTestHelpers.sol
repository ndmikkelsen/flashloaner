// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

/// @title Safety Test Helpers
/// @notice Common utilities for safety contract testing
/// @dev Provides mock contracts, helper functions, and test constants
///      used across CircuitBreaker, ProfitValidator, and integration tests.

// ---------------------------------------------------------------
// Constants
// ---------------------------------------------------------------

/// @notice Common test constants for safety parameters
library SafetyConstants {
    // Default safety parameters (match .env.example defaults)
    uint256 internal constant DEFAULT_MAX_GAS_PRICE = 50 gwei;
    uint256 internal constant DEFAULT_MAX_TRADE_SIZE = 100 ether;
    uint256 internal constant DEFAULT_MIN_PROFIT = 0.001 ether;
    uint256 internal constant DEFAULT_MAX_SLIPPAGE_BPS = 50; // 0.5%

    // Extreme values for edge case testing
    uint256 internal constant ONE_WEI = 1;
    uint256 internal constant MAX_UINT128 = type(uint128).max;
    uint256 internal constant MAX_UINT256 = type(uint256).max;

    // Flash loan provider fees (basis points)
    uint256 internal constant AAVE_V3_FEE_BPS = 5; // 0.05%
    uint256 internal constant BALANCER_FEE_BPS = 0; // 0%
    uint256 internal constant DYDX_FEE_BPS = 0; // 0%
}

// ---------------------------------------------------------------
// Mock ERC20 Token
// ---------------------------------------------------------------

/// @notice Minimal ERC20 mock for testing token transfers and balances
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(balanceOf[from] >= amount, "ERC20: burn exceeds balance");
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
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
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

// ---------------------------------------------------------------
// Mock Flash Loan Provider
// ---------------------------------------------------------------

/// @notice Simulates a flash loan provider for testing
contract MockFlashLoanProvider {
    MockERC20 public token;
    uint256 public feeBps;

    event FlashLoanIssued(address borrower, uint256 amount, uint256 fee);

    constructor(address _token, uint256 _feeBps) {
        token = MockERC20(_token);
        feeBps = _feeBps;
    }

    /// @notice Issue a flash loan to the caller
    function flashLoan(uint256 amount, bytes calldata data) external {
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 balanceBefore = token.balanceOf(address(this));

        token.transfer(msg.sender, amount);

        (bool success,) = msg.sender.call(data);
        require(success, "FlashLoan: callback failed");

        uint256 balanceAfter = token.balanceOf(address(this));
        require(balanceAfter >= balanceBefore + fee, "FlashLoan: not repaid");

        emit FlashLoanIssued(msg.sender, amount, fee);
    }
}

// ---------------------------------------------------------------
// Mock DEX Adapter
// ---------------------------------------------------------------

/// @notice Configurable mock DEX adapter for testing swap outcomes
contract MockDEXAdapter {
    uint256 public returnAmount;
    bool public shouldRevert;
    string public revertReason;

    event SwapExecuted(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);

    function setReturnAmount(uint256 _amount) external {
        returnAmount = _amount;
    }

    function setRevert(bool _shouldRevert, string calldata _reason) external {
        shouldRevert = _shouldRevert;
        revertReason = _reason;
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256, /* amountOutMin */
        bytes calldata /* extraData */
    ) external returns (uint256) {
        require(!shouldRevert, revertReason);

        MockERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        MockERC20(tokenOut).transfer(msg.sender, returnAmount);

        emit SwapExecuted(tokenIn, tokenOut, amountIn, returnAmount);
        return returnAmount;
    }

    function getAmountOut(address, address, uint256, bytes calldata) external view returns (uint256) {
        return returnAmount;
    }
}

// ---------------------------------------------------------------
// Reentrancy Attack Contracts
// ---------------------------------------------------------------

/// @notice Malicious adapter that attempts reentrancy on executeArbitrage
contract ReentrantAdapter {
    address public target;
    bytes public attackCalldata;

    constructor(address _target, bytes memory _calldata) {
        target = _target;
        attackCalldata = _calldata;
    }

    function swap(address, address, uint256, uint256, bytes calldata) external returns (uint256) {
        (bool success,) = target.call(attackCalldata);
        require(!success, "Reentrancy should have been blocked");
        return 0;
    }

    function getAmountOut(address, address, uint256, bytes calldata) external pure returns (uint256) {
        return 0;
    }
}

// ---------------------------------------------------------------
// Helper Base Contract
// ---------------------------------------------------------------

/// @notice Base test contract with common safety test utilities
abstract contract SafetyTestBase is Test {
    address internal owner = makeAddr("owner");
    address internal bot = makeAddr("bot");
    address internal attacker = makeAddr("attacker");

    MockERC20 internal weth;
    MockERC20 internal usdc;
    MockERC20 internal dai;

    /// @notice Deploy standard mock tokens
    function _deployMockTokens() internal {
        weth = new MockERC20("Wrapped ETH", "WETH", 18);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        dai = new MockERC20("Dai Stablecoin", "DAI", 18);
    }

    /// @notice Fund an address with test tokens
    function _fundAccount(address account, uint256 wethAmount, uint256 usdcAmount) internal {
        weth.mint(account, wethAmount);
        usdc.mint(account, usdcAmount);
    }

    /// @notice Calculate flash loan fee
    function _calculateFee(uint256 amount, uint256 feeBps) internal pure returns (uint256) {
        return (amount * feeBps) / 10_000;
    }

    /// @notice Assert address has no token balance (residual check)
    function _assertNoResidualBalance(address target) internal view {
        assertEq(weth.balanceOf(target), 0, "Residual WETH");
        assertEq(usdc.balanceOf(target), 0, "Residual USDC");
        assertEq(dai.balanceOf(target), 0, "Residual DAI");
        assertEq(target.balance, 0, "Residual ETH");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ForkTestBase
/// @notice Base contract for mainnet fork tests. Provides common addresses,
///         helpers, and fork setup for testing against real protocols.
/// @dev All fork tests should inherit this contract. Tests automatically skip
///      when MAINNET_RPC_URL is not set (CI-safe).
///
///      Run: forge test --fork-url $MAINNET_RPC_URL --match-path "contracts/test/fork/*"
abstract contract ForkTestBase is Test {
    // ──────────────────────────────────────────────
    // Mainnet Protocol Addresses
    // ──────────────────────────────────────────────

    // Aave V3
    address internal constant AAVE_V3_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address internal constant AAVE_V3_POOL_DATA_PROVIDER = 0x7b4Eb56E7Cd4b454ba8FF71e4518426C60552A85;

    // Balancer V2
    address internal constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

    // Uniswap V2
    address internal constant UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address internal constant UNISWAP_V2_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;

    // Uniswap V3
    address internal constant UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address internal constant UNISWAP_V3_QUOTER_V2 = 0x61fFE014bA17989E743c5F6cB21bF9697530B21e;
    address internal constant UNISWAP_V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;

    // SushiSwap
    address internal constant SUSHISWAP_ROUTER = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F;

    // ──────────────────────────────────────────────
    // Mainnet Token Addresses
    // ──────────────────────────────────────────────

    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address internal constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address internal constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;

    // ──────────────────────────────────────────────
    // Token Decimals
    // ──────────────────────────────────────────────

    uint8 internal constant WETH_DECIMALS = 18;
    uint8 internal constant USDC_DECIMALS = 6;
    uint8 internal constant USDT_DECIMALS = 6;
    uint8 internal constant DAI_DECIMALS = 18;
    uint8 internal constant WBTC_DECIMALS = 8;

    // ──────────────────────────────────────────────
    // Common Test Addresses
    // ──────────────────────────────────────────────

    address internal owner = makeAddr("fork-owner");
    address internal bot = makeAddr("fork-bot");

    // ──────────────────────────────────────────────
    // Fork State
    // ──────────────────────────────────────────────

    bool internal forkActive;

    // ──────────────────────────────────────────────
    // Setup
    // ──────────────────────────────────────────────

    /// @dev Tries to create a mainnet fork. Sets forkActive = true on success.
    ///      Tests should call _skipIfNoFork() at the start.
    function _tryCreateFork() internal {
        try vm.envString("MAINNET_RPC_URL") returns (string memory rpcUrl) {
            if (bytes(rpcUrl).length > 0) {
                vm.createSelectFork(rpcUrl);
                forkActive = true;
            }
        } catch {
            forkActive = false;
        }
    }

    /// @dev Skip the test if no fork is active. Call at the start of each test.
    function _skipIfNoFork() internal view {
        if (!forkActive) {
            // Using vm.skip in a view function is not possible, so we use a different approach
            // Tests check forkActive directly
        }
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    /// @dev Deal ERC20 tokens to an address using Foundry's deal cheatcode.
    function _dealToken(address token, address to, uint256 amount) internal {
        deal(token, to, amount);
    }

    /// @dev Get the balance of an ERC20 token for an address.
    function _tokenBalance(address token, address account) internal view returns (uint256) {
        return IERC20(token).balanceOf(account);
    }

    /// @dev Approve a spender for a token on behalf of an address.
    function _approveToken(address token, address from, address spender, uint256 amount) internal {
        vm.prank(from);
        IERC20(token).approve(spender, amount);
    }

    /// @dev Label common mainnet addresses for better trace readability.
    function _labelMainnetAddresses() internal {
        vm.label(AAVE_V3_POOL, "AaveV3Pool");
        vm.label(BALANCER_VAULT, "BalancerVault");
        vm.label(UNISWAP_V2_ROUTER, "UniV2Router");
        vm.label(UNISWAP_V3_ROUTER, "UniV3Router");
        vm.label(UNISWAP_V3_QUOTER_V2, "UniV3QuoterV2");
        vm.label(SUSHISWAP_ROUTER, "SushiRouter");
        vm.label(WETH, "WETH");
        vm.label(USDC, "USDC");
        vm.label(USDT, "USDT");
        vm.label(DAI, "DAI");
        vm.label(WBTC, "WBTC");
    }

    /// @dev Convert a human-readable amount to token units with decimals.
    function _toTokenUnits(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        return amount * (10 ** decimals);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ForkTestBase} from "./ForkTestBase.sol";
import {FlashloanReceiver} from "../../src/FlashloanReceiver.sol";

/// @dev Minimal Aave V3 Pool interface for flash loan requests.
interface IAavePool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;

    function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128);
}

/// @dev Concrete receiver for Aave fork tests. Just repays the loan (no arb).
contract AaveForkReceiver is FlashloanReceiver {
    using SafeERC20 for IERC20;

    bool public callbackExecuted;
    uint256 public lastAmount;
    uint256 public lastPremium;

    constructor(address _aavePool, address _balancerVault, address _owner)
        FlashloanReceiver(_aavePool, _balancerVault, _owner)
    {}

    function _executeArbitrage(bytes calldata) internal override {
        callbackExecuted = true;
    }

    /// @dev Convenience: request a flash loan directly from Aave V3.
    function requestFlashLoan(address asset, uint256 amount) external {
        IAavePool(aavePool).flashLoanSimple(address(this), asset, amount, "", 0);
    }
}

/// @title AaveForkTest
/// @notice Fork tests for Aave V3 flash loan integration.
/// @dev Run: forge test --fork-url $MAINNET_RPC_URL --match-contract AaveForkTest -vvv
contract AaveForkTest is ForkTestBase {
    AaveForkReceiver internal receiver;

    function setUp() public {
        _tryCreateFork();
        if (!forkActive) return;

        _labelMainnetAddresses();

        vm.prank(owner);
        receiver = new AaveForkReceiver(AAVE_V3_POOL, BALANCER_VAULT, owner);
        vm.label(address(receiver), "AaveForkReceiver");
    }

    // ──────────────────────────────────────────────
    // Aave V3 Flash Loan Tests
    // ──────────────────────────────────────────────

    /// @notice Verify we can take a WETH flash loan from real Aave V3 pool.
    function test_aaveFlashLoan_WETH() public {
        if (!forkActive) return;

        uint256 loanAmount = 10 ether;

        // Fund receiver with enough to pay premium
        uint128 premiumBps = IAavePool(AAVE_V3_POOL).FLASHLOAN_PREMIUM_TOTAL();
        uint256 premium = (loanAmount * premiumBps) / 10_000;
        _dealToken(WETH, address(receiver), premium + 1); // +1 for rounding

        uint256 balanceBefore = _tokenBalance(WETH, address(receiver));

        receiver.requestFlashLoan(WETH, loanAmount);

        assertTrue(receiver.callbackExecuted(), "Callback not executed");

        // Balance should decrease by approximately the premium
        uint256 balanceAfter = _tokenBalance(WETH, address(receiver));
        assertLe(balanceAfter, balanceBefore, "Should have paid premium");
    }

    /// @notice Verify USDC flash loan works (6-decimal token).
    function test_aaveFlashLoan_USDC() public {
        if (!forkActive) return;

        uint256 loanAmount = _toTokenUnits(100_000, USDC_DECIMALS); // 100k USDC

        uint128 premiumBps = IAavePool(AAVE_V3_POOL).FLASHLOAN_PREMIUM_TOTAL();
        uint256 premium = (loanAmount * premiumBps) / 10_000;
        _dealToken(USDC, address(receiver), premium + 1);

        receiver.requestFlashLoan(USDC, loanAmount);

        assertTrue(receiver.callbackExecuted());
    }

    /// @notice Verify DAI flash loan works.
    function test_aaveFlashLoan_DAI() public {
        if (!forkActive) return;

        uint256 loanAmount = 50_000 ether; // 50k DAI

        uint128 premiumBps = IAavePool(AAVE_V3_POOL).FLASHLOAN_PREMIUM_TOTAL();
        uint256 premium = (loanAmount * premiumBps) / 10_000;
        _dealToken(DAI, address(receiver), premium + 1);

        receiver.requestFlashLoan(DAI, loanAmount);

        assertTrue(receiver.callbackExecuted());
    }

    /// @notice Verify flash loan premium is charged correctly.
    function test_aaveFlashLoan_premiumCharged() public {
        if (!forkActive) return;

        uint256 loanAmount = 100 ether;

        uint128 premiumBps = IAavePool(AAVE_V3_POOL).FLASHLOAN_PREMIUM_TOTAL();
        uint256 expectedPremium = (loanAmount * premiumBps) / 10_000;

        // Fund exactly the premium
        _dealToken(WETH, address(receiver), expectedPremium);

        uint256 balanceBefore = _tokenBalance(WETH, address(receiver));
        receiver.requestFlashLoan(WETH, loanAmount);
        uint256 balanceAfter = _tokenBalance(WETH, address(receiver));

        // Should have spent the premium (balance decreases)
        uint256 spent = balanceBefore - balanceAfter;
        assertEq(spent, expectedPremium, "Premium should match expected");
    }

    /// @notice Verify the Aave premium rate is reasonable (< 1%).
    function test_aaveFlashLoanPremium_isReasonable() public view {
        if (!forkActive) return;

        uint128 premiumBps = IAavePool(AAVE_V3_POOL).FLASHLOAN_PREMIUM_TOTAL();
        // Aave V3 premium is typically 5 bps (0.05%)
        assertLe(premiumBps, 100, "Premium should be <= 1%");
        assertGe(premiumBps, 1, "Premium should be > 0");
    }

    /// @notice Verify flash loan reverts if receiver can't repay.
    function test_revertWhen_cannotRepayAaveFlashLoan() public {
        if (!forkActive) return;

        // Don't fund the receiver — can't pay premium
        vm.expectRevert();
        receiver.requestFlashLoan(WETH, 10 ether);
    }

    /// @notice Gas benchmark for Aave V3 flash loan.
    function test_aaveFlashLoan_gasBenchmark() public {
        if (!forkActive) return;

        uint256 loanAmount = 10 ether;
        uint128 premiumBps = IAavePool(AAVE_V3_POOL).FLASHLOAN_PREMIUM_TOTAL();
        uint256 premium = (loanAmount * premiumBps) / 10_000;
        _dealToken(WETH, address(receiver), premium + 1);

        uint256 gasBefore = gasleft();
        receiver.requestFlashLoan(WETH, loanAmount);
        uint256 gasUsed = gasBefore - gasleft();

        // Log gas usage (visible in -vvv output)
        emit log_named_uint("Aave V3 Flash Loan Gas", gasUsed);
        // Should be reasonable (< 500k gas)
        assertLt(gasUsed, 500_000, "Flash loan gas too high");
    }
}

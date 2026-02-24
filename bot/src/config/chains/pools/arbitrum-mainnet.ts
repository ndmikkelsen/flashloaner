import type { PoolDefinition } from "../../types.js";

/**
 * Arbitrum mainnet pool definitions.
 *
 * These are pre-configured high-liquidity pools for cross-DEX arbitrage monitoring.
 * Addresses verified from Phase 1 research (ARBITRUM.md).
 */
export const ARBITRUM_MAINNET_POOLS: PoolDefinition[] = [
  // ──── WETH/USDC.e (bridged) ────────────────────────────────────

  {
    label: "WETH/USDC.e UniV3 (0.05%)",
    dex: "uniswap_v3",
    poolAddress: "0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e (bridged)
    decimals0: 18,
    decimals1: 6,
    feeTier: 500,
  },

  {
    label: "WETH/USDC.e SushiV2",
    dex: "sushiswap",
    // 148.8 WETH + $295K USDC.e (verified 2026-02-21)
    poolAddress: "0x905dfCD5649217c42684f23958568e533C711Aa3",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e (bridged)
    decimals0: 18,
    decimals1: 6,
  },

  // ──── WETH/USDC (native) ─────────────────────────────────────
  // Native USDC (Circle-issued) has replaced USDC.e as primary stablecoin on Arbitrum.
  // These pools have 10x+ the liquidity of the USDC.e versions.

  {
    label: "WETH/USDC UniV3 (0.05%)",
    dex: "uniswap_v3",
    // 17,675 WETH + $10M USDC — largest WETH/USDC pool on Arbitrum
    // NOTE: Was previously mislabeled as USDC.e 0.3%. Verified on-chain 2026-02-21.
    poolAddress: "0xC6962004f452bE9203591991D15f6b388e09E8D0",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC (native)
    decimals0: 18,
    decimals1: 6,
    feeTier: 500,
  },

  {
    label: "WETH/USDC Camelot V3",
    dex: "camelot_v3",
    // 215 WETH + $77.8K USDC (verified 2026-02-21)
    poolAddress: "0xB1026b8e7276e7AC75410F1fcbbe21796e8f7526",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC (native)
    decimals0: 18,
    decimals1: 6,
  },

  // WETH/USDC(native) TJ LB (0.15%) — NOT ADDED (~$33K TVL, too competitive for WETH/stablecoin arb)

  // ──── WETH/USDT ────────────────────────────────────────────────

  {
    label: "WETH/USDT UniV3 (0.05%)",
    dex: "uniswap_v3",
    poolAddress: "0x641c00a822e8b671738d32a431a4fb6074e5c79d",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
    decimals0: 18,
    decimals1: 6,
    feeTier: 500,
  },

  {
    label: "WETH/USDT UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0xc82819F72A9e77E2c0c3A69B3196478f44303cf4",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
    decimals0: 18,
    decimals1: 6,
    feeTier: 3000,
  },

  // Ramses V3 WETH/USDT: REMOVED — no pool exists on Ramses V3 CL factory
  // (verified 2026-02-21). Re-add if Ramses deploys WETH/USDT CL pool.

  // ──── ARB/WETH ─────────────────────────────────────────────────

  {
    label: "ARB/WETH UniV3 (0.05%)",
    dex: "uniswap_v3",
    poolAddress: "0xc6f780497a95e246eb9449f5e4770916dcd6396a",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0x912ce59144191c1204e64559fe8253a0e49e6548", // ARB
    decimals0: 18,
    decimals1: 18,
    feeTier: 500,
  },

  {
    label: "ARB/WETH UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0x92c63d0e701caae670c9415d91c474f686298f00",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0x912ce59144191c1204e64559fe8253a0e49e6548", // ARB
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000,
  },

  {
    label: "ARB/WETH SushiV3 (0.3%)",
    dex: "sushiswap_v3",
    poolAddress: "0xB3942c9FFA04efBC1Fa746e146bE7565c76E3dC1",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0x912ce59144191c1204e64559fe8253a0e49e6548", // ARB
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000,
  },

  {
    label: "ARB/WETH SushiV2",
    dex: "sushiswap",
    poolAddress: "0xBF6CBb1F40a542aF50839CaD01b0dc1747F11e18",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0x912ce59144191c1204e64559fe8253a0e49e6548", // ARB
    decimals0: 18,
    decimals1: 18,
  },

  {
    label: "ARB/WETH Camelot V3",
    dex: "camelot_v3",
    // 2.6 WETH — dynamic fee creates arb windows vs fixed UniV3 tiers
    // Pool verified on-chain 2026-02-21 via poolByPair()
    poolAddress: "0xe51635ae8136aBAc44906A8f230C2D235E9c195F",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0x912ce59144191c1204e64559fe8253a0e49e6548", // ARB
    decimals0: 18,
    decimals1: 18,
  },

  // ──── LINK/WETH ────────────────────────────────────────────────

  {
    label: "LINK/WETH UniV3 (0.05%)",
    dex: "uniswap_v3",
    poolAddress: "0x91308bC9Ce8Ca2db82aA30C65619856cC939d907",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4", // LINK
    decimals0: 18,
    decimals1: 18,
    feeTier: 500,
  },

  {
    label: "LINK/WETH UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0x468b88941e7cc0b88c1869d68ab6b570bcef62ff",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4", // LINK
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000,
  },

  {
    label: "LINK/WETH SushiV3 (0.3%)",
    dex: "sushiswap_v3",
    poolAddress: "0x55A7E0ab34038D75d0E2118254Fd84FdedCd4E65",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4", // LINK
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000,
  },

  {
    label: "LINK/WETH Camelot V3",
    dex: "camelot_v3",
    // 20.3 WETH — best Camelot V3 liquidity of the mid-cap tokens
    // Pool verified on-chain 2026-02-21 via poolByPair()
    poolAddress: "0xe8795cF9c2309eCfe05Df028eB0F21D5D6e3a951",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4", // LINK
    decimals0: 18,
    decimals1: 18,
  },

  // ──── GMX/WETH ─────────────────────────────────────────────────

  {
    label: "GMX/WETH UniV3 (0.05%)",
    dex: "uniswap_v3",
    poolAddress: "0xb435ebfE0BF4CE66810AA4d44e3a5CA875D40DB1",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a", // GMX
    decimals0: 18,
    decimals1: 18,
    feeTier: 500,
  },

  {
    label: "GMX/WETH UniV3 (1%)",
    dex: "uniswap_v3",
    poolAddress: "0x80A9ae39310abf666A87C743d6ebBD0E8C42158E",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a", // GMX
    decimals0: 18,
    decimals1: 18,
    feeTier: 10000,
  },

  {
    label: "GMX/WETH Camelot V3",
    dex: "camelot_v3",
    // 8.3 WETH — GMX community concentrates LPing on Camelot
    // Pool verified on-chain 2026-02-21 via poolByPair()
    poolAddress: "0xC99be44383BC8d82357F5A1D9ae9976EE9d75bee",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a", // GMX
    decimals0: 18,
    decimals1: 18,
  },

  // ──── MAGIC/WETH ───────────────────────────────────────────────

  {
    label: "MAGIC/WETH UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0x59d72ddb29da32847a4665d08ffc8464a7185fae",
    token0: "0x539bde0d7dbd336b79148aa742883198bbf60342", // MAGIC
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000,
  },

  {
    label: "MAGIC/WETH SushiV2",
    dex: "sushiswap",
    poolAddress: "0xb7e50106a5bd3cf21af210a755f9c8740890a8c9",
    token0: "0x539bde0d7dbd336b79148aa742883198bbf60342", // MAGIC
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
  },

  {
    label: "MAGIC/WETH Camelot V3",
    dex: "camelot_v3",
    // 8.0 WETH — 3rd venue alongside UniV3 + SushiV2
    // Pool verified on-chain 2026-02-21 via poolByPair()
    poolAddress: "0x1106dB7165A8d4a8559B441eCdEe14a5d5070DbC",
    token0: "0x539bde0d7dbd336b79148aa742883198bbf60342", // MAGIC
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
  },

  // ──── PENDLE/WETH ────────────────────────────────────────────

  {
    label: "PENDLE/WETH Camelot V2",
    dex: "camelot_v2",
    poolAddress: "0xBfCa4230115DE8341F3A3d5e8845fFb3337B2Be3",
    token0: "0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8", // PENDLE
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
  },

  {
    label: "PENDLE/WETH UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0xdbaeB7f0DFe3a0AAFD798CCECB5b22E708f7852c",
    token0: "0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8", // PENDLE
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000,
  },

  // ──── GNS/WETH ───────────────────────────────────────────────

  {
    label: "GNS/WETH Camelot V3",
    dex: "camelot_v3",
    poolAddress: "0x9b6FF025AeE245D314c09F57B72f0dE6E231c3a6",
    token0: "0x18c11FD286C5EC11c3b683Caa813B77f5163A122", // GNS
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
  },

  {
    label: "GNS/WETH UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0xC91B7b39BBB2c733f0e7459348FD0c80259c8471",
    token0: "0x18c11FD286C5EC11c3b683Caa813B77f5163A122", // GNS
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000,
  },

  // PREMIA/WETH — REMOVED (single-pool monitor, no cross-DEX arb possible)
  // Camelot V3 0xc3e254E3... was only pool; UniV3 pool had zero in-range liquidity.

  // JONES/WETH — REMOVED (single-pool monitor, no cross-DEX arb possible)
  // Camelot V2 0x460c2c07... was only viable pool; SushiV2 had 3.4 WETH (too thin).

  // ──── DPX/WETH ───────────────────────────────────────────────

  {
    label: "DPX/WETH SushiV2",
    dex: "sushiswap",
    poolAddress: "0x0C1Cf6883efA1B496B01f654E247B9b419873054",
    token0: "0x6C2C06790b3E3E3c38e12Ee22F8183b37a13EE55", // DPX
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
  },

  {
    label: "DPX/WETH Camelot V3",
    dex: "camelot_v3",
    poolAddress: "0x59A327d948db1810324a04D69CBe9fe9884F8F28",
    token0: "0x6C2C06790b3E3E3c38e12Ee22F8183b37a13EE55", // DPX
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
  },

  // SPELL/WETH — REMOVED (single-pool monitor, no cross-DEX arb possible)
  // SushiV2 0x8f93Eaae... was only viable pool; Camelot V2 had 0.285 WETH (too thin).

  // WBTC/WETH — NOT ADDED (too competitive, heavily arbed by MEV bots)
  // wstETH/WETH — NOT ADDED (correlated asset pair, razor-thin margins, MEV dominated)

  // ──── Trader Joe Liquidity Book ────────────────────────────

  {
    label: "WETH/USDC.e Trader Joe LB (0.15%)",
    dex: "traderjoe_lb",
    // Verified via LBFactory.getLBPairInformation() 2026-02-21
    // tokenX=WETH, tokenY=USDC.e, activeId=8375236
    poolAddress: "0x94d53BE52706a155d27440C4a2434BEa772a6f7C",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH (tokenX)
    token1: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e bridged (tokenY)
    decimals0: 18,
    decimals1: 6,
    feeTier: 15, // binStep in basis points (0.15%)
  },

  {
    label: "WETH/USDT Trader Joe LB (0.15%)",
    dex: "traderjoe_lb",
    // Verified via LBFactory.getLBPairInformation() 2026-02-21
    // tokenX=WETH, tokenY=USDT, activeId=8375236
    poolAddress: "0xd387c40a72703B38A5181573724bcaF2Ce6038a5",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH (tokenX)
    token1: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT (tokenY)
    decimals0: 18,
    decimals1: 6,
    feeTier: 15, // binStep in basis points (0.15%)
  },

  // ARB/WETH Trader Joe LB (0.10%) — REMOVED
  // Pool 0x0Be4aC7dA6cd4bAD60d96FbC6d091e1098aFA358 has stale pricing:
  // active bin stuck at ~4674 ARB/WETH while market is ~19950 ARB/WETH.
  // Low liquidity means active bin doesn't move. Creates phantom 327% spread
  // that would fail on execution. Re-add when liquidity improves.
];

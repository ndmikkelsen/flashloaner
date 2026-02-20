import type { PoolDefinition } from "../../types.js";

/**
 * Arbitrum mainnet pool definitions.
 *
 * These are pre-configured high-liquidity pools for cross-DEX arbitrage monitoring.
 * Addresses verified from Phase 1 research (ARBITRUM.md).
 */
export const ARBITRUM_MAINNET_POOLS: PoolDefinition[] = [
  // ──── WETH/USDC ────────────────────────────────────────────────

  {
    label: "WETH/USDC UniV3 (0.05%)",
    dex: "uniswap_v3",
    poolAddress: "0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH (lower address = token0)
    token1: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e
    decimals0: 18,
    decimals1: 6,
    feeTier: 500,
  },

  {
    label: "WETH/USDC UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0xC6962004f452bE9203591991D15f6b388e09E8D0",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH (lower address = token0)
    token1: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e
    decimals0: 18,
    decimals1: 6,
    feeTier: 3000,
  },

  {
    label: "WETH/USDC Ramses V3 (0.05%)",
    dex: "ramses_v3",
    // TODO: Verify pool address from Ramses Factory getPool() call:
    // cast call 0xd0019e86edB35E1fedaaB03aED5c3c60f115d28b \
    //   "getPool(address,address,uint24)(address)" \
    //   0x82af49447d8a07e3bd95bd0d56f35241523fbab1 \
    //   0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8 \
    //   500 --rpc-url $ARBITRUM_RPC_URL
    poolAddress: "0x0000000000000000000000000000000000000000", // PLACEHOLDER - needs verification
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH (lower address = token0)
    token1: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e
    decimals0: 18,
    decimals1: 6,
    feeTier: 500,
  },

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

  {
    label: "WETH/USDT Ramses V3 (0.05%)",
    dex: "ramses_v3",
    // TODO: Verify pool address from Ramses Factory getPool() call:
    // cast call 0xd0019e86edB35E1fedaaB03aED5c3c60f115d28b \
    //   "getPool(address,address,uint24)(address)" \
    //   0x82af49447d8a07e3bd95bd0d56f35241523fbab1 \
    //   0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9 \
    //   500 --rpc-url $ARBITRUM_RPC_URL
    poolAddress: "0x0000000000000000000000000000000000000000", // PLACEHOLDER - needs verification
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
    decimals0: 18,
    decimals1: 6,
    feeTier: 500,
  },

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

  // ──── PREMIA/WETH ────────────────────────────────────────────

  {
    label: "PREMIA/WETH Camelot V3",
    dex: "camelot_v3",
    poolAddress: "0xc3e254E39c45c7886A12455cb8207c808486FAC3",
    token0: "0x51fC0f6660482Ea73330E414eFd7808811a57Fa2", // PREMIA
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
  },

  // PREMIA/WETH UniV3 (0.3%) removed — pool 0x4d834a9b has zero in-range
  // liquidity (stale sqrtPriceX96 produces phantom 42% spread vs Camelot V3).
  // PREMIA Camelot V3 kept as single-pool monitor for future cross-DEX pairing.

  // ──── JONES/WETH ─────────────────────────────────────────────

  {
    label: "JONES/WETH Camelot V2",
    dex: "camelot_v2",
    poolAddress: "0x460c2c075340EbC19Cf4af68E5d83C194E7D21D0",
    token0: "0x10393c20975cF177a3513071bC110f7962CD67da", // JONES
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
  },

  // JONES/WETH SushiV2 removed — 3.4 WETH reserve ($9K), too thin for 5 ETH trades.
  // JONES Camelot V2 kept as single-pool monitor (47.4 WETH, viable for future pairing).

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

  // ──── SPELL/WETH ─────────────────────────────────────────────

  {
    label: "SPELL/WETH SushiV2",
    dex: "sushiswap",
    poolAddress: "0x8f93Eaae544e8f5EB077A1e09C1554067d9e2CA8",
    token0: "0x3E6648C5a70A150A88bCE65F4aD4d506Fe15d2AF", // SPELL
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
  },

  // SPELL/WETH Camelot V2 removed — 0.285 WETH reserve ($770 TVL). A 5 ETH trade
  // drains 94% of the pool, causing catastrophic price impact. The 1.03% spread is
  // real but unexecutable. SPELL SushiV2 kept for monitoring (37 WETH reserve).
];

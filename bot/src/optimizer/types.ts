/** Configuration for InputOptimizer */
export interface InputOptimizerConfig {
  /** Maximum iterations for ternary search. Default: 3 */
  maxIterations?: number;
  /** Timeout in milliseconds. Default: 100 */
  timeoutMs?: number;
  /** Fallback input amount when optimization fails or times out. Default: 10 */
  fallbackAmount?: number;
  /** Minimum input amount to consider. Default: 1 */
  minAmount?: number;
  /** Maximum input amount to consider. Default: 1000 */
  maxAmount?: number;
  /** Convergence threshold (stop when search space < this). Default: 0.01 */
  convergenceThreshold?: number;
}

/** Result from input optimization */
export interface OptimizationResult {
  /** Optimal input amount in base token units */
  optimalAmount: number;
  /** Expected net profit at optimal amount */
  expectedProfit: number;
  /** Number of iterations used */
  iterations: number;
  /** Time taken in milliseconds */
  durationMs: number;
  /** Whether optimization completed successfully */
  converged: boolean;
  /** Reason for fallback if converged=false */
  fallbackReason?: "timeout" | "max_iterations" | "no_profitable_size";
}

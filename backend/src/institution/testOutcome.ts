/** Rejection-only test institution; KYT_RISK is a scenario, not a risk assessment. */
export function testOutcome(amount: string, limit: string) {
  return {
    decision: 'REJECT',
    reason_code: BigInt(amount) > BigInt(limit) ? 'LIMIT_EXCEEDED' : 'KYT_RISK',
  } as const;
}

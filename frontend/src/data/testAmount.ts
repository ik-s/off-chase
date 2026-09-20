/** Convert USDC text without floating-point rounding. */
export function testAmountBaseUnits(input: string): string {
  const value = input.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value)) throw new Error('양수 금액을 소수점 6자리 이내로 입력해 주세요.');
  const [whole, fraction = ''] = value.split('.');
  const units = (BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'))).toString();
  if (units === '0' || units.length > 30) throw new Error('0보다 크고 24자리 이하인 USDC 금액을 입력해 주세요.');
  return units;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { testAmountBaseUnits } from '../src/data/testAmount.ts';

test('test request amounts preserve USDC precision', () => {
  assert.equal(testAmountBaseUnits('3500'), '3500000000');
  assert.equal(testAmountBaseUnits('0.000001'), '1');
  assert.equal(testAmountBaseUnits('9007199254740993.123456'), '9007199254740993123456');
  assert.equal(testAmountBaseUnits(' 4000.5 '), '4000500000');
});
test('invalid or oversized requests are rejected before submission', () => {
  for (const value of ['', '0', '-1', 'NaN', '1e3', '3,500', '0.0000001', '1.2345678', '01', '9'.repeat(25)]) {
    assert.throws(() => testAmountBaseUnits(value));
  }
});

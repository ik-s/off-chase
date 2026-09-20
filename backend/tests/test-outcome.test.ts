import test from 'node:test';
import assert from 'node:assert/strict';
import { testOutcome } from '../src/institution/testOutcome.ts';

test('over-limit requests reject with LIMIT_EXCEEDED', () => {
  assert.deepEqual(testOutcome('4000000001', '4000000000'), { decision: 'REJECT', reason_code: 'LIMIT_EXCEEDED' });
});
test('within-limit and equal-limit requests reject with KYT_RISK', () => {
  for (const amount of ['1', '3500000000', '4000000000']) {
    assert.deepEqual(testOutcome(amount, '4000000000'), { decision: 'REJECT', reason_code: 'KYT_RISK' });
  }
});

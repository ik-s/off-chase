import assert from 'node:assert/strict';
import test from 'node:test';
import { GatewayService } from '../src/verification/service.ts';

test('gateway service is loadable by the production Node TypeScript runtime', () => {
  assert.equal(typeof GatewayService, 'function');
});

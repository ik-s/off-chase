import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { KeyRegistry } from '../institution/mockWallet.ts';
import { verifyEvidence, type AnchorReader, type VerificationReport } from './verifier.ts';

const RegistrySchema = z.record(z.string(), z.string().regex(/^0x[0-9a-fA-F]{40}$/));

export async function verifyEvidenceFile(
  bundlePath: string,
  registryPath: string,
  chain: AnchorReader,
): Promise<VerificationReport> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(bundlePath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) return { status: 'INVALID', errors: ['INVALID_EVIDENCE_SCHEMA'] };
    throw error;
  }
  const registry = RegistrySchema.parse(JSON.parse(await readFile(registryPath, 'utf8'))) as KeyRegistry;
  return verifyEvidence(input, registry, chain);
}

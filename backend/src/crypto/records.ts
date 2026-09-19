import { randomBytes } from 'node:crypto';
import canonicalize from 'canonicalize';
import { keccak256, toBytes, verifyMessage, type Hex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';

export function hashRecord(record: object, signatureField: string): Hex {
  const payload: Record<string, unknown> = { ...record };
  delete payload[signatureField];
  const canonical = canonicalize(payload);
  if (canonical === undefined) throw new Error('INVALID_RECORD');
  return keccak256(toBytes(canonical));
}

export async function signRecord<T extends object>(
  record: T,
  signatureField: string,
  account: PrivateKeyAccount,
): Promise<T & Record<string, Hex>> {
  const hash = hashRecord(record, signatureField);
  const signature = await account.signMessage({ message: { raw: hash } });
  return { ...record, [signatureField]: signature };
}

export async function verifyRecordSignature(
  record: object,
  signatureField: string,
  address: `0x${string}`,
): Promise<boolean> {
  const signature = (record as Record<string, unknown>)[signatureField];
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return false;
  try {
    return await verifyMessage({
      address,
      message: { raw: hashRecord(record, signatureField) },
      signature: signature as Hex,
    });
  } catch {
    return false;
  }
}

export function randomNonce(): Hex {
  return `0x${randomBytes(32).toString('hex')}`;
}

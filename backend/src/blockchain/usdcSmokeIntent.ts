import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';

export async function reserveSmokeIntent(path: string, intent: object): Promise<void> {
  await writeFile(path, `${JSON.stringify(intent)}\n`, { flag: 'wx', mode: 0o600 });
}

export async function saveSmokeIntent(path: string, intent: object): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(intent)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

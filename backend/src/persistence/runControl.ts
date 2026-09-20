import { createClient } from '@supabase/supabase-js';
import type { RunControl } from '../api/cases.ts';

export function createRunControl(env: NodeJS.ProcessEnv): RunControl {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_CONFIGURATION_MISSING');
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const limit = Number(env.DEMO_DAILY_LIMIT ?? '30');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('INVALID_DEMO_DAILY_LIMIT');
  return {
    async acquire(id) {
      const { data, error } = await client.rpc('acquire_demo_writer', { p_run_id: id, p_daily_limit: limit });
      if (error) throw new Error('RUN_CONTROL_UNAVAILABLE');
      if (data !== 'ACQUIRED') throw new Error(data === 'DAILY_LIMIT' ? 'DEMO_DAILY_LIMIT_REACHED' : 'DEMO_RUN_IN_PROGRESS');
    },
    async release(id) {
      const { error } = await client.rpc('release_demo_writer', { p_run_id: id });
      if (error) throw new Error('RUN_CONTROL_UNAVAILABLE');
    },
    async isActive(id) {
      const { data, error } = await client.from('demo_writer_control').select('run_id,started_at').eq('id', 1).maybeSingle();
      if (error) throw new Error('RUN_CONTROL_UNAVAILABLE');
      // Only the reported status ages out; the writer lock stays fail-closed.
      return data?.run_id === id && Date.now() - Date.parse(data.started_at) < 360_000;
    },
  };
}

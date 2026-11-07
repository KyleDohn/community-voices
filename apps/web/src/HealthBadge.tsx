import type { HealthResponse } from '@cv/contracts';
import { useEffect, useState } from 'react';
import { fetchHealth } from './api';

type HealthState = HealthResponse | 'loading' | 'unreachable';

const label = (health: HealthState) => {
  if (health === 'loading') return 'Checking API…';
  if (health === 'unreachable') return 'API unreachable';
  const detail = `database ${health.database}, embedder ${health.embedder}`;
  if (health.status !== 'ok') return `API degraded (${detail})`;
  return health.embedder === 'loading' ? 'API healthy, embedder loading…' : 'API healthy';
};

const isHealthy = (health: HealthState) => typeof health === 'object' && health.status === 'ok';

export const HealthBadge = () => {
  const [health, setHealth] = useState<HealthState>('loading');

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth('unreachable'));
  }, []);

  return (
    <span
      className={`rounded-full px-3 py-1 text-sm ${isHealthy(health) ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
    >
      {label(health)}
    </span>
  );
};

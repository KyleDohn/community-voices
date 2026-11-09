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
    <span className="exif flex items-center gap-2" role="status">
      <span
        aria-hidden
        className={`size-2 rounded-full ${isHealthy(health) ? 'bg-[#4fae6a]' : 'bg-warn'}`}
      />
      {label(health)}
    </span>
  );
};

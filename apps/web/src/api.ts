import { HealthResponse } from '@cv/contracts';

/** Fetches health; a 503 still carries a valid body describing what is down. */
export const fetchHealth = async (): Promise<HealthResponse> => {
  const res = await fetch('/api/v1/health');
  return HealthResponse.parse(await res.json());
};

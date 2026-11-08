import {
  AcceptedResponse,
  ErrorResponse,
  HealthResponse,
  ReportListResponse,
  ReportRunResponse,
  WeeksResponse,
} from '@cv/contracts';

/** A non-2xx answer, carrying the API's error code and message. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const parseError = async (res: Response) => {
  const body = ErrorResponse.safeParse(await res.json().catch(() => undefined));
  return body.success
    ? new ApiError(body.data.error, body.data.message)
    : new ApiError('http_error', `The API answered ${res.status}`);
};

const getJson = async <T>(path: string, schema: { parse: (v: unknown) => T }) => {
  const res = await fetch(path);
  if (!res.ok) throw await parseError(res);
  return schema.parse(await res.json());
};

/** Fetches health; a 503 still carries a valid body describing what is down. */
export const fetchHealth = async (): Promise<HealthResponse> => {
  const res = await fetch('/api/v1/health');
  return HealthResponse.parse(await res.json());
};

export const fetchWeeks = () => getJson('/api/v1/weeks', WeeksResponse);

export const listReports = (week: string) =>
  getJson(`/api/v1/reports?week=${encodeURIComponent(week)}`, ReportListResponse);

export const fetchReport = (id: string) =>
  getJson(`/api/v1/reports/${encodeURIComponent(id)}`, ReportRunResponse);

export const startReport = async (week: string) => {
  const res = await fetch('/api/v1/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ week }),
  });
  if (res.status !== 202) throw await parseError(res);
  return AcceptedResponse.parse(await res.json());
};

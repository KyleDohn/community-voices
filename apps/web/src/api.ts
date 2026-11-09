import {
  AbRunListResponse,
  AbRunResponse,
  AcceptedResponse,
  CostStatsResponse,
  ErrorResponse,
  HealthResponse,
  MapResponse,
  MAX_MEDIA_IDS,
  PostMediaResponse,
  ReportListResponse,
  ReportRunResponse,
  RetrievalStatsResponse,
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

/** Author and images for up to MAX_MEDIA_IDS posts; the rest are dropped, not an error. */
export const fetchPostMedia = (ids: number[]) =>
  getJson(`/api/v1/posts/media?ids=${ids.slice(0, MAX_MEDIA_IDS).join(',')}`, PostMediaResponse);

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

// fetch rejects with a TypeError when the server is down; anything else is a bad response body.
export const messageOf = (error: unknown) => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return 'The API could not be reached. Is the server running?';
  return 'The API sent a response this page could not read. Check the server log.';
};

export const listAbRuns = () => getJson('/api/v1/ab-runs', AbRunListResponse);

export const fetchAbRun = (id: string) =>
  getJson(`/api/v1/ab-runs/${encodeURIComponent(id)}`, AbRunResponse);

export const startAbRun = async (week: string) => {
  const res = await fetch('/api/v1/ab-runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ week }),
  });
  if (res.status !== 202) throw await parseError(res);
  return AcceptedResponse.parse(await res.json());
};

export const fetchRetrievalStats = (limit = 20) =>
  getJson(`/api/v1/stats/retrievals?limit=${limit}`, RetrievalStatsResponse);

export const fetchCostStats = () => getJson('/api/v1/stats/costs', CostStatsResponse);

export const fetchMap = (reportId?: string) =>
  getJson(
    `/api/v1/embeddings/map${reportId ? `?reportId=${encodeURIComponent(reportId)}` : ''}`,
    MapResponse,
  );

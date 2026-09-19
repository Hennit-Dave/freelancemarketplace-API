export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
export function success<T>(data: T[], total = data.length, limit = data.length, offset = 0, status = 200) {
  return Response.json({ data, meta: { total, limit, offset, hasMore: offset + data.length < total } }, { status });
}
export function failure(status: number, code: string, message: string, headers?: HeadersInit) {
  return Response.json({ error: { code, message } }, { status, headers });
}

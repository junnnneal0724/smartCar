/** 统一响应体与业务异常 */

export interface ApiResult<T> {
  code: number;
  message: string;
  data: T;
  traceId: string;
}

export function ok<T>(data: T, traceId = ''): ApiResult<T> {
  return { code: 0, message: 'ok', data, traceId };
}

export function fail(code: number, message: string, traceId = ''): ApiResult<null> {
  return { code, message, data: null, traceId };
}

/**
 * 业务异常：被全局过滤器统一转成 ApiResult。
 * 默认仍然是 HTTP 200（车机只关心 code），需要真实状态码时传第三个参数。
 */
export class BizError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly httpStatus: number = 200,
  ) {
    super(message);
    this.name = 'BizError';
  }
}

export const ErrorCode = {
  BAD_REQUEST: 40000,
  UNAUTHORIZED: 40100,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  CONFLICT: 40900,
  INTERNAL: 50000,

  /** 行程域业务码（车内场景：没有派单/支付，所以码表也精简了） */
  RIDE_STATE_INVALID: 42001,
  RIDE_ACTIVE_EXISTS: 42002,
  UNLOCK_CODE_WRONG: 42003,
  CABIN_OUT_OF_RANGE: 42004,
  DOOR_NOT_ALLOWED: 42005,
  ASSIST_UNAVAILABLE: 42006,
  DEST_NOT_ALLOWED: 42007,
} as const;

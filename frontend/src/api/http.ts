/**
 * HTTP 客户端。
 *
 * 后端所有响应（含异常）都是 { code, message, data, traceId }，
 * 所以这里统一拆包：成功返回 data，失败抛 ApiError（带 code 与人话 message）。
 * 页面因此不需要写 try/catch 去分辨不同的错误形状。
 */

export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  traceId: string;
}

export class ApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly traceId = '',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 网关地址：走 Vite 代理，生产环境由网关同源提供 */
const BASE = '/api';

let authToken = '';
export function setAuthToken(t: string): void {
  authToken = t ?? '';
  if (t) sessionStorage.setItem('robotaxi.ride.token', t);
  else sessionStorage.removeItem('robotaxi.ride.token');
}
export function getAuthToken(): string {
  if (!authToken) authToken = sessionStorage.getItem('robotaxi.ride.token') ?? '';
  return authToken;
}

/** 网络层错误（区别于业务错误）：车机会把它显示成"连接不稳定"而不是弹窗报错 */
export class NetworkError extends Error {
  constructor(message = '网络连接不稳定') {
    super(message);
    this.name = 'NetworkError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const hasBody = init.body !== undefined && init.body !== null;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new NetworkError();
  }

  let json: ApiEnvelope<T>;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new NetworkError(`服务返回了无法解析的内容（HTTP ${res.status}）`);
  }

  if (json.code !== 0) throw new ApiError(json.code, json.message, json.traceId);
  return json.data;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
};

/* ------------------------------------------------------------------ SSE */

export interface RealtimeMessage<T = unknown> {
  topic: string;
  data: T;
  ts: number;
}

export type RealtimeHandler = (msg: RealtimeMessage) => void;

/**
 * 订阅实时事件流。
 * 用 EventSource 而不是 WebSocket：车内只需要"服务端推、客户端收"，
 * 而且 EventSource 自带断线重连，弱网下更省心。
 */
export function subscribeRealtime(topics: string[], onMessage: RealtimeHandler): () => void {
  const qs = topics.length ? `?topics=${encodeURIComponent(topics.join(','))}` : '';
  const es = new EventSource(`${BASE}/realtime/subscribe${qs}`);

  es.onmessage = (ev) => {
    try {
      onMessage(JSON.parse(ev.data) as RealtimeMessage);
    } catch {
      /* 忽略坏帧 */
    }
  };

  es.onerror = () => {
    // EventSource 会自动重连，这里只上报状态
    onMessage({ topic: 'connection', data: { state: 'reconnecting' }, ts: Date.now() });
  };

  return () => es.close();
}

/** 只读订阅（供 EventSource 无法解析的异常帧使用） */
export function subscribeRaw(url: string): EventSource {
  return new EventSource(`${BASE}${url}`);
}

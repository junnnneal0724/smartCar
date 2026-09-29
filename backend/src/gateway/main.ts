/**
 * 网关进程（:8080）—— 纯 Node http 实现的反向代理。
 *
 * 为什么不用 Fastify/Nest：网关只做三件事（转发、健康检查、CORS），
 * 而 SSE 需要把上游响应原样流式透传。用裸 http 可以做到零缓冲、
 * 零依赖，也不会出现"框架先解析了 body 导致转发丢包"这类问题。
 *
 * 前端统一打 8080，业务进程（:8081）不直接对外 —— 与真实微服务部署一致。
 */
import http from 'node:http';
import { request as httpRequest } from 'node:http';

const PORT = Number(process.env.GATEWAY_PORT ?? 8080);
const APP_ORIGIN = process.env.APP_ORIGIN ?? 'http://127.0.0.1:8081';
const startedAt = Date.now();

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-requested-with',
  'access-control-expose-headers': 'x-trace-id',
  'access-control-max-age': '86400',
};

const target = new URL(APP_ORIGIN);

function proxy(req: http.IncomingMessage, res: http.ServerResponse): void {
  const path = req.url ?? '/';
  const upstream = httpRequest(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (up) => {
      const headers: Record<string, string | number | string[]> = { ...CORS };
      for (const [k, v] of Object.entries(up.headers)) {
        if (v === undefined) continue;
        headers[k] = v as string | number | string[];
      }
      // SSE 关键：不要缓冲，也不要被中间层改写成长连接之外的形态
      if (String(up.headers['content-type'] ?? '').includes('text/event-stream')) {
        headers['cache-control'] = 'no-cache, no-transform';
        headers['x-accel-buffering'] = 'no';
        delete headers['content-length'];
      }
      res.writeHead(up.statusCode ?? 502, headers);
      up.pipe(res);
    },
  );

  upstream.on('error', (e) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.writeHead(502, { ...CORS, 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ code: 50200, message: `业务服务未就绪：${e.message}`, data: null, traceId: '' }));
  });

  // 请求体原样透传（不解析，避免破坏 multipart 等）
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS).end();
    return;
  }

  if (url === '/health' || url === '/api/health') {
    res.writeHead(200, { ...CORS, 'content-type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        code: 0,
        message: 'ok',
        data: { gateway: 'up', uptimeS: Math.round((Date.now() - startedAt) / 1000), upstream: APP_ORIGIN },
        traceId: '',
      }),
    );
    return;
  }

  if (url.startsWith('/api/')) {
    proxy(req, res);
    return;
  }

  if (url === '/' || url.startsWith('/?')) {
    res.writeHead(200, { ...CORS, 'content-type': 'text/html; charset=utf-8' });
    res.end(landingHtml());
    return;
  }

  res.writeHead(404, { ...CORS, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ code: 40400, message: '网关没有这条路由', data: null, traceId: '' }));
});

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`[gateway] 已启动 → http://127.0.0.1:${PORT}  (→ ${APP_ORIGIN})`);
});

function landingHtml(): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>智行 · 车内终端 网关</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;
    background:radial-gradient(1200px 600px at 50% -10%,#1A2437 0%,#0F1319 60%);
    color:#EDF1F7;font:16px/1.7 "Plus Jakarta Sans","PingFang SC","Microsoft YaHei",sans-serif}
  .card{max-width:560px;padding:40px 44px;border:1px solid #262D38;border-radius:28px;
    background:#161B22;box-shadow:0 24px 60px rgba(0,0,0,.45)}
  h1{margin:0 0 6px;font-size:26px;letter-spacing:.2px}
  p.sub{margin:0 0 26px;color:#A3ADBD;font-size:14px}
  a{display:block;padding:14px 18px;margin-bottom:10px;border-radius:16px;text-decoration:none;
    color:#EDF1F7;background:#1D232C;border:1px solid #262D38;transition:.2s}
  a:hover{background:#1A2437;border-color:#6E9BFF;transform:translateY(-1px)}
  a b{display:block;font-size:15px}
  a span{font-size:13px;color:#6C7686}
  code{color:#6E9BFF}
</style></head>
<body><div class="card">
  <h1>智行 · 车内交互终端</h1>
  <p class="sub">网关已在 <code>:8080</code> 运行，所有 <code>/api/**</code> 请求都会转发到业务进程 <code>:8081</code>。</p>
  <a href="http://127.0.0.1:5173/"><b>打开车机界面 →</b><span>http://127.0.0.1:5173 （Vite 开发服务器）</span></a>
  <a href="/health"><b>网关健康检查</b><span>/health</span></a>
  <a href="/api/vehicle/current"><b>车辆状态</b><span>/api/vehicle/current</span></a>
  <a href="/api/session/bootstrap"><b>车机启动接口</b><span>/api/session/bootstrap</span></a>
  <a href="/api/realtime/subscribe"><b>实时事件流（SSE）</b><span>/api/realtime/subscribe</span></a>
</div></body></html>`;
}

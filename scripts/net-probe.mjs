// 网络探测：确认哪些 HTTPS 主机可以从 Node 侧访问
const targets = [
  'https://registry.npmjs.org/vue',
  'https://github.com/Leonxlnx/taste-skill',
  'https://codeload.github.com/Leonxlnx/taste-skill/zip/refs/heads/main',
  'https://api.github.com/repos/Leonxlnx/taste-skill',
  'https://ghfast.top/https://github.com/Leonxlnx/taste-skill/archive/refs/heads/main.zip',
  'https://ghproxy.net/https://github.com/Leonxlnx/taste-skill/archive/refs/heads/main.zip',
  'https://gitclone.com/github.com/Leonxlnx/taste-skill',
  'https://gitee.com'
];

for (const url of targets) {
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: ctl.signal });
    clearTimeout(timer);
    console.log(`OK   ${res.status} ${res.headers.get('content-type') || '-'} ${Date.now() - t0}ms  ${url}`);
    if (res.status >= 300 && res.status < 400) console.log(`       -> location: ${res.headers.get('location')}`);
  } catch (e) {
    console.log(`FAIL ${String(e.message || e).slice(0, 90)}  ${url}`);
  }
}

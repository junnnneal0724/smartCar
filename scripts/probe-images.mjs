// 探测可用图床（本机网络受限，只走 Node）
const hosts = [
  'https://picsum.photos/seed/robotaxi/400/300',
  'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=400',
  'https://source.unsplash.com/400x300/?car',
  'https://cdn.simpleicons.org/vercel/ffffff',
  'https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1/assets/regular/car.svg',
  'https://unpkg.com/@phosphor-icons/core@2.1.1/assets/regular/car.svg',
  'https://api.dicebear.com/7.x/initials/svg?seed=Zhang',
  'https://placehold.co/400x300/png',
  'https://images.pexels.com/photos/120049/pexels-photo-120049.jpeg?w=400',
];

for (const url of hosts) {
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(timer);
    const buf = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    console.log(
      `${res.ok ? 'OK  ' : 'BAD '} ${String(res.status).padEnd(4)} ${(res.headers.get('content-type') || '-').padEnd(28)} ${buf ? (buf.length / 1024).toFixed(1) + 'KB' : ''} ${Date.now() - t0}ms  ${url.slice(0, 70)}`
    );
  } catch (e) {
    console.log(`FAIL      ${String(e.message || e).slice(0, 40).padEnd(30)} ${url.slice(0, 70)}`);
  }
}

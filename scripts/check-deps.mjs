// 核实几个关键依赖的当前版本与能力，避免文档里写错
const pkgs = ['drizzle-orm', '@nestjs/core', '@nestjs/platform-fastify', 'vue', 'echarts', 'naive-ui', 'pinia', 'vite'];

for (const p of pkgs) {
  try {
    const r = await fetch(`https://registry.npmjs.org/${encodeURIComponent(p)}/latest`);
    const j = await r.json();
    console.log(`${p.padEnd(30)} ${String(j.version).padEnd(12)} ${j.description ? String(j.description).slice(0, 60) : ''}`);
    if (p === 'drizzle-orm' && j.exports) {
      const keys = Object.keys(j.exports).filter((k) => /sqlite/i.test(k));
      console.log(`   -> sqlite 相关导出: ${keys.join(', ') || '(无)'}`);
    }
  } catch (e) {
    console.log(`${p.padEnd(30)} FAIL ${e.message}`);
  }
}

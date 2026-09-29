// 通过 api.github.com / codeload.github.com（这两个域名可用）下载 taste-skill 仓库
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'Leonxlnx/taste-skill';
// 相对脚本位置解析，项目整体挪目录后不用改这里
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, 'skills', '_download');

await mkdir(OUT_DIR, { recursive: true });

// 1. 仓库元信息
const meta = await (await fetch(`https://api.github.com/repos/${REPO}`)).json();
const branch = meta.default_branch || 'main';
console.log('=== REPO META ===');
console.log('name        :', meta.full_name);
console.log('description :', meta.description);
console.log('default br. :', branch);
console.log('stars       :', meta.stargazers_count, '| size:', meta.size, 'KB | pushed:', meta.pushed_at);
console.log('license     :', meta.license?.spdx_id, '| topics:', (meta.topics || []).join(', '));

// 2. 文件树
const tree = await (await fetch(`https://api.github.com/repos/${REPO}/git/trees/${branch}?recursive=1`)).json();
console.log('\n=== FILE TREE ===');
for (const n of tree.tree || []) {
  console.log(`${n.type === 'tree' ? '[D]' : '   '} ${n.path}${n.size ? `  (${n.size}B)` : ''}`);
}

// 3. 下载 zip
console.log('\n=== DOWNLOAD ===');
const zipUrl = `https://codeload.github.com/${REPO}/zip/refs/heads/${branch}`;
const res = await fetch(zipUrl);
if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
const zipPath = path.join(OUT_DIR, 'taste-skill.zip');
await writeFile(zipPath, buf);
console.log(`saved: ${zipPath}  (${(buf.length / 1024).toFixed(1)} KB)`);

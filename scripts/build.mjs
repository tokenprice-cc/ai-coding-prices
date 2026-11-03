/**
 * 从 TokenPrice（https://tokenprice.cc）拉各页面的 Markdown 版，生成本仓库的 README.md 和 docs/（GitHub Pages 网页）。
 * GitHub Actions 每天跑一次（.github/workflows/sync.yml）；本地也能跑：node scripts/build.mjs
 * 只用 Node 自带的 fetch，不装依赖。
 */
import { mkdir, writeFile } from 'node:fs/promises';

const SITE = 'https://tokenprice.cc';
// 仓库地址和网页地址跟着仓库走（Actions 里有 GITHUB_REPOSITORY=账号/仓库名），换账号、改仓库名都不用改代码
const [OWNER, REPO] = (process.env.GITHUB_REPOSITORY || 'tokenprice/ai-coding-prices').split('/');
const PAGES = `https://${OWNER.toLowerCase()}.github.io/${REPO}/`;

const FAMILIES = [
  { slug: 'claude', path: '/relay', name: 'Claude' },
  { slug: 'gpt', path: '/relay/gpt', name: 'GPT（Codex）' },
  { slug: 'gemini', path: '/relay/gemini', name: 'Gemini' },
  { slug: 'deepseek', path: '/relay/deepseek', name: 'DeepSeek' },
  { slug: 'glm', path: '/relay/glm', name: '智谱 GLM' },
  { slug: 'kimi', path: '/relay/kimi', name: 'Kimi' },
  { slug: 'qwen', path: '/relay/qwen', name: '通义千问 Qwen' },
  { slug: 'minimax', path: '/relay/minimax', name: 'MiniMax' },
  { slug: 'grok', path: '/relay/grok', name: 'Grok' },
];
/** README 里 Claude 中转站列前几名；各系列网页列前几名（完整榜单在 TokenPrice 网站上） */
const TOP_README = 20;
const TOP_PAGE = 30;

async function fetchMd(path) {
  const res = await fetch(`${SITE}${path === '/' ? '/index' : path}.md`, {
    headers: { 'user-agent': `${REPO}-sync (+https://github.com/${OWNER}/${REPO})` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

/** 二级标题（以 prefix 开头）下面紧跟的那张表；rows 是保留的数据行数 */
function tableUnder(md, prefix, rows = Infinity) {
  const lines = md.split('\n');
  const start = lines.findIndex(l => l.startsWith(`## ${prefix}`));
  if (start < 0) throw new Error(`没找到“${prefix}”这一节`);
  const table = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (line.startsWith('|')) table.push(line);
    else if (table.length) break;
  }
  return table.slice(0, 2 + rows).join('\n');
}

/** 二级标题下的列表项（攻略列表用） */
function listUnder(md, prefix) {
  const lines = md.split('\n');
  const start = lines.findIndex(l => l.startsWith(`## ${prefix}`));
  if (start < 0) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (line.startsWith('- ')) items.push(line);
  }
  return items;
}

/** 文件头：“> 一句话摘要”和“- 数据更新：…（北京时间）”这一行 */
const summaryOf = md => md.match(/^> (.+)$/m)?.[1] ?? '';
const updatedOf = md => (md.match(/^- 数据更新：(.+)$/m)?.[1] ?? '').split('；')[0];

const home = await fetchMd('/');
const relays = [];
for (const f of FAMILIES) relays.push({ ...f, md: await fetchMd(f.path) });
const updated = updatedOf(home);
const guides = listUnder(home, '省钱攻略');

const intro = [
  `> Claude Code、Codex、Cursor 怎么用最便宜？把官方订阅最低区、卡网代充与成品号、API 中转站三条路的实时价格放在一起比。数据来自 [TokenPrice](${SITE})（AI 编程省钱比价网站，每小时更新），本仓库每天自动同步一次。`,
  '',
  `数据更新：${updated} · 网页版：[tokenprice.cc](${SITE})`,
];

const body = (relayLink) => [
  '## 会员订阅：各档位今日最低价（人民币 / 月）',
  '',
  tableUnder(home, '会员订阅'),
  '',
  '卡网价只算有货的标准商品（日抛、拼车这类非标商品不算）；“带质保”指写明质保 28 天以上。官方价按当天汇率折算。',
  '',
  '## API 中转站：各模型系列今日倍率',
  '',
  tableUnder(home, 'API 中转'),
  '',
  '倍率 = 充值系数 × 分组倍率，即官方每 1 美元的用量在中转站要花多少人民币；1x 约等于官方价的 1.5 折。最低价多是引流价，参考中位数更稳。',
  '',
  `## Claude 中转站：倍率最低的前 ${TOP_README} 名`,
  '',
  tableUnder(relays[0].md, '榜单', TOP_README),
  '',
  `完整榜单（前 100 名，可按名字筛选）：[${SITE}/relay](${SITE}/relay)`,
  '',
  '## 各模型系列中转站价格榜',
  '',
  ...relays.map(f => `- [${f.name} API 中转站价格榜](${relayLink(f)})：${summaryOf(f.md)}`),
  '',
  ...(guides.length ? ['## 省钱攻略', '', ...guides, ''] : []),
  '## 口径',
  '',
  '- 中转站倍率读自各站公开的定价接口（New API、Sub2API、ai-transit 披露等），每小时采集；Claude / GPT / Gemini / Grok 低于 0.1x、其他模型低于 0.05x 的体验或引流分组不算，可用率低于 95% 的站不进榜。',
  '- 标“官方合作”的中转站是 TokenPrice 的合作位，固定排第 1，不按倍率排，也不算进最低价和中位数。',
  '- 卡网价只算有货的标准商品；官方价来自 App Store 和官网的公开价格。',
  '',
  '## 来源',
  '',
  `数据来自 [TokenPrice](${SITE}) 的公开页面，转载请注明来源并附链接。价格仅供参考，购买和售后都在原平台完成；中转站请先小额测试。`,
  '',
];

const readme = [
  '# AI 编程省钱比价：Claude Code / Codex 订阅代充与 API 中转站价格榜',
  '',
  ...intro,
  '',
  `在线浏览（每个模型系列一页）：[${PAGES}](${PAGES})`,
  '',
  ...body(f => `docs/relay/${f.slug}.md`),
].join('\n');

const front = (title, description, permalink) => ['---', `title: "${title}"`, `description: "${description.replace(/"/g, '\\"')}"`, `permalink: ${permalink}`, '---', ''].join('\n');

const indexPage = [
  front('AI 编程省钱比价：Claude Code / Codex 订阅代充与 API 中转站价格榜', 'Claude Code、Codex 怎么用最便宜：官方订阅最低区、卡网代充、9 个模型系列的 API 中转站倍率，每日同步自 TokenPrice。', '/'),
  ...intro,
  '',
  ...body(f => `relay/${f.slug}/`),
].join('\n');

// GitHub Pages（Jekyll）设置：表格按 GitHub 的写法渲染，自动生成站点地图和搜索引擎标签
const pagesConfig = [
  'title: AI 编程省钱比价 · 中转站价格榜',
  'description: Claude Code、Codex 订阅代充与 9 个模型系列的 API 中转站价格，每日同步自 TokenPrice（tokenprice.cc）。',
  'lang: zh-CN',
  'markdown: kramdown',
  'kramdown:',
  '  input: GFM',
  'theme: jekyll-theme-primer',
  'plugins:',
  '  - jekyll-sitemap',
  '  - jekyll-seo-tag',
  '',
].join('\n');

await mkdir('docs/relay', { recursive: true });
await writeFile('docs/_config.yml', pagesConfig);
await writeFile('README.md', readme);
await writeFile('docs/index.md', indexPage);
for (const f of relays) {
  const page = [
    front(`${f.name} API 中转站价格榜（每日更新）`, summaryOf(f.md), `/relay/${f.slug}/`),
    `# ${f.name} API 中转站价格榜`,
    '',
    `> ${summaryOf(f.md)}`,
    '',
    `数据更新：${updatedOf(f.md)} · 数据来自 [TokenPrice](${SITE}${f.path})`,
    '',
    `## 倍率最低的前 ${TOP_PAGE} 名`,
    '',
    tableUnder(f.md, '榜单', TOP_PAGE),
    '',
    `完整榜单（前 100 名）：[${SITE}${f.path}](${SITE}${f.path})`,
    '',
    '倍率 = 充值系数 × 分组倍率，即官方每 1 美元的用量在这家花多少人民币。标“官方合作”的是 TokenPrice 的合作位，固定排第 1，不按倍率排。倍率低不代表是真模型，先小额测试。',
    '',
    '其他系列：' + relays.filter(x => x !== f).map(x => `[${x.name}](../${x.slug}/)`).join(' · ') + ' · [返回首页](../../)',
    '',
  ].join('\n');
  await writeFile(`docs/relay/${f.slug}.md`, page);
}
console.log(`ok：${updated}，${relays.length} 个系列`);


// Renders the manual's portraits (docs/manual/img/<faction>/<type>.png) from the game's own models, in a headless
// browser against the dev server. Usage: npx vite --port 5199 & then
//   NODE_PATH=$(dirname $(npx -y -p playwright node -e "console.log(require.resolve('playwright'))"))/.. node sim/portraits.cjs
// (any Playwright install works: it only needs `require('playwright')` to resolve).
const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');

const SIZE = 240;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(process.env.URL ?? 'http://localhost:5199/');
  await page.waitForFunction(() => window.game, null, { timeout: 120000 });
  const shots = await page.evaluate(async (size) => {
    const icons = await import('/src/ui/model-icons.ts');
    const models = await import('/src/models/index.ts');
    const cfg = await import('/src/config/index.ts');
    const color = cfg.TEAM_COLORS[0];
    const base = { weapons: 0, armor: 0, rockets: false, nitro: false, harvest: false };
    const out = {};
    for (const f of cfg.FACTION_LIST) {
      const fd = cfg.FACTIONS[f];
      const units = [...fd.train.filter(Boolean), ...(fd.rites ?? [])];
      const buildings = fd.build.filter(Boolean);
      for (const t of units) {
        const d = cfg.unitDef(f, t);
        if (d.camp && !buildings.includes(d.camp)) buildings.push(d.camp);
        if (d.thumper && !buildings.includes('thumper')) buildings.push('thumper');
      }
      const list = [
        ...units.map((t) => ({ key: `${f}/${t}`, make: () => { const m = models.makeUnitModel(t, f, color); m.showUpgrades?.(base); m.anim?.update(0); return m.body; } })),
        ...buildings.map((t) => ({ key: `${f}/${t}`, make: () => models.makeBuildingModel(t, f, color, cfg.BUILDINGS[t].size).group })),
      ];
      for (const [k, v] of icons.renderShots(list, size)) out[k] = v;
    }
    return out;
  }, SIZE);
  for (const [key, url] of Object.entries(shots)) {
    const path = `docs/manual/img/${key}.png`;
    mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    writeFileSync(path, Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(`wrote ${Object.keys(shots).length} portraits`);
  await browser.close();
})();

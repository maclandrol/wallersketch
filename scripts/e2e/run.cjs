// Drives the real desktop application (development build or a packaged executable).
//   node scripts/e2e/run.cjs                  run every flow against ./dist
//   node scripts/e2e/run.cjs --exe <path>     run against a packaged app
//   node scripts/e2e/run.cjs - <script.cjs>   run one script (tools such as the icon)
// Native dialogs are answered from a queue file; this hook is disabled in packaged builds,
// so packaged runs only execute flows that need no dialog.
const { _electron: electron } = require('playwright');
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');

const argv = process.argv.slice(2);
const exe = argv.includes('--exe') ? argv[argv.indexOf('--exe') + 1] : null;
const only = argv[0] === '-' ? argv[1] : null;
const shots = argv.includes('--shots') ? path.resolve(argv[argv.indexOf('--shots') + 1]) : null;
const ci = !!process.env.CI;

async function launch() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wallersketch-e2e-'));
  const dialogs = path.join(userData, 'dialogs.json');
  fs.writeFileSync(dialogs, '[]');
  // CI runners have no GPU: use Chromium's software WebGL. Linux runners also lack the sandbox helper.
  const args = [...(exe ? [] : ['.']), '--user-data-dir=' + userData];
  if (ci) args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist');
  if (ci && process.platform === 'linux') args.push('--no-sandbox');
  const app = await electron.launch({ ...(exe ? { executablePath: exe } : {}), args, env: { ...process.env, WALLERSKETCH_USER_DATA: userData, WALLERSKETCH_TEST_DIALOGS: dialogs }, timeout: 60000 });
  const page = await app.firstWindow();
  // E2E_WINDOW=1024x700 reproduces the small screens of CI runners (drawer layout).
  if (process.env.E2E_WINDOW) {
    const [w, h] = process.env.E2E_WINDOW.split('x').map(Number);
    await app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(400, 400); win.setContentSize(w, h); }, [w, h]);
  }
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.waitForFunction(() => window.studio?.ready, null, { timeout: 60000 });
  await page.keyboard.press('Escape'); // close the New dialog shown on later launches
  return { app, page, errors, userData, answer: list => fs.writeFileSync(dialogs, JSON.stringify(list)) };
}

/** Shared helpers handed to each flow. */
function tools(ctx) {
  let failed = 0;
  const t = {
    ...ctx,
    eval: (fn, arg) => ctx.page.evaluate(fn, arg),
    items: () => ctx.page.evaluate(() => window.studio.ed.state.items),
    check(cond, label) { console.log(`  ${cond ? '✔' : '✖'} ${label}`); if (!cond) failed++; },
    /** Wait until every fabric has settled and the view has caught up. */
    async settled() {
      await ctx.page.waitForFunction(() => !window.studio.view.busy, null, { timeout: 120000 });
      await ctx.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    },
    async shot(name) { if (shots) { fs.mkdirSync(shots, { recursive: true }); await ctx.page.screenshot({ path: path.join(shots, name + '.png') }); } },
    get failed() { return failed; },
    /** On small screens (CI runners) the side panels are drawers: open them before use. */
    async openLibrary() { await t.openDrawer('left', 'Bibliothèque et scène'); },
    async openProperties() { await t.openDrawer('right', 'Propriétés'); },
    async openDrawer(side, label) {
      const closed = await ctx.page.evaluate(s => matchMedia('(max-width: 1100px)').matches && !document.getElementById('app').classList.contains(s + '-open'), side);
      if (closed) { await ctx.page.getByRole('button', { name: label }).click(); await ctx.page.waitForTimeout(300); }
    },
    async category(name) { await t.openLibrary(); await ctx.page.locator('.cat', { hasText: name }).click(); },
  };
  return t;
}

(async () => {
  const flows = only ? [path.resolve(only)] : ['editing.cjs', 'selection.cjs', ...(exe ? [] : ['files.cjs', 'features.cjs'])].map(f => path.join(__dirname, f));
  let failures = 0;
  for (const file of flows) {
    console.log(path.basename(file));
    const ctx = await launch();
    const t = tools(ctx);
    try { await require(file)(t); }
    catch (e) { console.log('  ✖ ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' ')); failures++; }
    t.check(ctx.errors.length === 0, 'no page errors' + (ctx.errors.length ? ': ' + ctx.errors.slice(0, 3).join(' | ') : ''));
    failures += t.failed;
    await ctx.page.evaluate(() => window.native.setDirty(false)).catch(() => {});
    await ctx.app.close();
  }
  console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();

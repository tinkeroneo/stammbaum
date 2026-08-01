const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = 4174;
const baseURL = `http://127.0.0.1:${port}`;
const outputArg = process.argv.find(arg => arg.startsWith('--output='));
const outputPath = path.resolve(root, outputArg?.slice('--output='.length) || 'docs/performance-results-current.json');
const sizes = [385, 1200, 5000];
const runsPerSize = 3;
const storeKey = 'mobile-family-tree-v5-clean';

function buildTree(total) {
  const columns = Math.ceil(Math.sqrt(total));
  return {
    rootIds: ['profile-0'],
    people: Array.from({ length: total }, (_, index) => ({
      id: `profile-${index}`,
      name: `Profil Person ${index}`,
      firstName: 'Profil',
      lastName: `Person ${index}`,
      born: String(1850 + (index % 170)),
      location: index % 5 === 0 ? 'Berlin' : 'Hamburg',
      parents: index > 1 ? [`profile-${Math.floor((index - 1) / 2)}`] : [],
      partners: [],
      x: 300 + (index % columns) * 230,
      y: 260 + Math.floor(index / columns) * 190,
      pool: false
    }))
  };
}

function waitForServer(timeout = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(baseURL, response => {
        response.resume();
        resolve();
      });
      request.on('error', () => {
        if (Date.now() - started > timeout) reject(new Error('Profiling server did not start'));
        else setTimeout(attempt, 100);
      });
    };
    attempt();
  });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function summarize(records, key) {
  const values = records.map(record => record[key]);
  return {
    medianMs: Number(median(values).toFixed(1)),
    worstMs: Number(Math.max(...values).toFixed(1)),
    samplesMs: values.map(value => Number(value.toFixed(1)))
  };
}

async function twoFrames(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(
    () => requestAnimationFrame(resolve)
  )));
}

async function runTrial(browser, total, run) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const tree = buildTree(total);

  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(`${key}-help-seen-v1`, JSON.stringify(['pan-zoom', 'search', 'edit']));
    window.__profileLongTasks = [];
    if ('PerformanceObserver' in window && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      new PerformanceObserver(list => {
        list.getEntries().forEach(entry => window.__profileLongTasks.push(entry.duration));
      }).observe({ type: 'longtask', buffered: true });
    }
  }, { key: storeKey, value: tree });

  const initialStart = process.hrtime.bigint();
  await page.goto(`${baseURL}/?ux-debug=1`, { waitUntil: 'load' });
  const continueButton = page.getByTestId('welcome-continue');
  if (await continueButton.isVisible().catch(() => false)) await continueButton.click();
  await page.getByTestId('app-shell').waitFor({ state: 'visible' });
  await twoFrames(page);
  const initialMs = Number(process.hrtime.bigint() - initialStart) / 1e6;
  await page.waitForTimeout(250);
  const initialLongTasksMs = await page.evaluate(() => window.__profileLongTasks.splice(0));

  const panZoomMs = await page.evaluate(async () => {
    const main = document.querySelector('[data-testid="app-main"]');
    const rect = main.getBoundingClientRect();
    const start = performance.now();
    main.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      deltaY: -120
    }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - start;
  });

  await page.getByTestId('person-search-open').click();
  await page.waitForTimeout(250);
  const searchMs = await page.evaluate(async () => {
    const input = document.querySelector('[data-testid="person-search"]');
    const start = performance.now();
    input.value = 'Profil Person 384';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - start;
  });

  const firstResult = page.locator('[data-testid^="person-search-result-"]').first();
  await firstResult.waitFor({ state: 'visible' });
  const detailMs = await firstResult.evaluate(async element => {
    const start = performance.now();
    element.click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - start;
  });
  await page.getByTestId('person-dialog').waitFor({ state: 'visible' });
  await page.waitForTimeout(100);

  const diagnostics = await page.evaluate(() => ({
    longTasksMs: [...(window.__profileLongTasks || [])],
    domElements: document.getElementsByTagName('*').length,
    renderedCards: document.querySelectorAll('[data-member-id]').length,
    renderedLines: document.querySelectorAll('svg.lines > *').length
  }));

  await context.close();
  if (pageErrors.length) throw new Error(`Page errors for ${total}/${run}: ${pageErrors.join('; ')}`);
  return { run, initialMs, initialLongTasksMs, panZoomMs, searchMs, detailMs, ...diagnostics };
}

async function main() {
  const server = spawn(process.execPath, ['tests/server.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), PW_SERVER_IDLE_MS: '600000' },
    stdio: ['ignore', 'ignore', 'inherit']
  });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const browserVersion = await browser.version();
    const datasets = [];
    for (const size of sizes) {
      const runs = [];
      for (let run = 1; run <= runsPerSize; run++) {
        process.stdout.write(`Profiling ${size} people, run ${run}/${runsPerSize}... `);
        const result = await runTrial(browser, size, run);
        runs.push(result);
        process.stdout.write('done\n');
      }
      const allLongTasks = runs.flatMap(run => run.longTasksMs);
      const allInitialLongTasks = runs.flatMap(run => run.initialLongTasksMs);
      datasets.push({
        people: size,
        runs,
        summary: {
          initial: summarize(runs, 'initialMs'),
          panZoom: summarize(runs, 'panZoomMs'),
          search: summarize(runs, 'searchMs'),
          detail: summarize(runs, 'detailMs'),
          longestTaskMs: Number(Math.max(0, ...allLongTasks).toFixed(1)),
          longestInitialTaskMs: Number(Math.max(0, ...allInitialLongTasks).toFixed(1)),
          domElementsMedian: median(runs.map(run => run.domElements)),
          renderedCardsMedian: median(runs.map(run => run.renderedCards)),
          renderedLinesMedian: median(runs.map(run => run.renderedLines))
        }
      });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      environment: {
        platform: `${os.platform()} ${os.release()} ${os.arch()}`,
        cpu: os.cpus()[0]?.model || 'unknown',
        logicalCpuCount: os.cpus().length,
        memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
        node: process.version,
        browser: `Chrome/Chromium ${browserVersion}`,
        viewport: '1440x900',
        mode: 'headless, cold context per trial'
      },
      budgets: {
        interactionP95Ms: 100,
        searchMs: 150,
        longestTask385Ms: 200
      },
      datasets
    };
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`Wrote ${path.relative(root, outputPath)}\n`);
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

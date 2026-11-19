// Drives the app through import + marking and saves screenshots for a visual check.
import { webkit, devices } from '@playwright/test'
const [pdfPath, outDir] = process.argv.slice(2)
const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPad Pro 11 landscape'] })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto('http://localhost:4173/piano-practice-tracker/')
await page.getByTestId('pdf-input').setInputFiles(pdfPath)
await page.getByLabel('Title').fill('Sonata in C')
await page.getByLabel('Composer').fill('W. A. Mozart')
await page.getByTestId('save-details').click()
await page.waitForSelector('.page canvas')
await page.waitForTimeout(800)
const SYSTEMS = [{ x0: 0.08, y0: 0.1, x1: 0.92, y1: 0.38 }, { x0: 0.08, y0: 0.5, x1: 0.92, y1: 0.78 }]
const overlay = page.locator('[data-testid="setup-overlay"][data-page="0"]')
const drag = async (a, b) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); for (let i = 1; i <= 6; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 6, a.y + (b.y - a.y) * i / 6); await page.mouse.up() }
for (const s of SYSTEMS) {
  await overlay.evaluate((el, fy) => { const sc = el.closest('.score'); const r = el.getBoundingClientRect(); const sr = sc.getBoundingClientRect(); sc.scrollTop += r.top + fy * r.height - (sr.top + sr.height / 2) }, (s.y0 + s.y1) / 2)
  const box = await overlay.boundingBox()
  await drag({ x: box.x + s.x0 * box.width, y: box.y + s.y0 * box.height }, { x: box.x + s.x1 * box.width, y: box.y + s.y1 * box.height })
}
for (const s of SYSTEMS) {
  await overlay.evaluate((el, fy) => { const sc = el.closest('.score'); const r = el.getBoundingClientRect(); const sr = sc.getBoundingClientRect(); sc.scrollTop += r.top + fy * r.height - (sr.top + sr.height / 2) }, (s.y0 + s.y1) / 2)
  const box = await overlay.boundingBox()
  for (const rel of [1 / 3, 2 / 3]) await page.touchscreen.tap(box.x + (s.x0 + rel * (s.x1 - s.x0)) * box.width, box.y + ((s.y0 + s.y1) / 2) * box.height)
}
await page.getByTestId('setup-score').evaluate((el) => (el.scrollTop = 0))
await page.screenshot({ path: `${outDir}/setup.png` })
await page.getByTestId('done').click()
await page.waitForSelector('.light')
const tap = async (bar, hand, n) => { for (let i = 0; i < n; i++) await page.locator(`.light[data-bar="${bar}"][data-hand="${hand}"]`).tap() }
await tap(1, 'HT', 3); await tap(1, 'RH', 3); await tap(1, 'LH', 3)
await tap(2, 'HT', 2); await tap(2, 'RH', 3); await tap(2, 'LH', 1)
await tap(3, 'HT', 1); await tap(4, 'RH', 2); await tap(5, 'HT', 3)
await page.getByTestId('tint-toggle').click()
await page.getByTestId('add-section').click(); await page.getByLabel('Name').fill('Exposition'); await page.getByTestId('section-end').fill('3'); await page.getByTestId('save-section').click()
await page.getByTestId('next-target').click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${outDir}/practice.png` })
await page.setViewportSize({ width: 834, height: 1194 })
await page.reload()
await page.waitForSelector('.light')
await page.waitForTimeout(800)
await page.screenshot({ path: `${outDir}/portrait.png` })
await page.getByTestId('panel-toggle').click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${outDir}/portrait-panel.png` })
await browser.close()

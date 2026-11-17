// Loads the deployed app in WebKit and checks that it renders, the manifest resolves and the SW installs.
import { webkit, devices } from '@playwright/test'
const url = process.argv[2]
const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPad Pro 11 landscape'] })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(url)
await page.getByRole('heading', { name: 'Pieces' }).waitFor()
const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
const manifest = await page.evaluate(async (h) => (await fetch(h)).json(), manifestHref)
await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active, null, { timeout: 30000 })
console.log(JSON.stringify({ ok: true, errors, manifest: { start_url: manifest.start_url, scope: manifest.scope, display: manifest.display, icons: manifest.icons.length } }))
await browser.close()

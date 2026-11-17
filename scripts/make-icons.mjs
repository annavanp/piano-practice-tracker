// Renders public/icons/icon.svg to the PNG sizes the manifest and iOS need.
import { webkit } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8')
const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-512-maskable.png', 512, true],
  ['apple-touch-icon.png', 180, true],
]
const browser = await webkit.launch()
const page = await browser.newPage()
for (const [name, size, flat] of targets) {
  await page.setViewportSize({ width: size, height: size })
  // Maskable and iOS icons get a solid square background; the OS rounds the corners.
  const body = flat ? svg.replace('rx="112"', 'rx="0"') : svg
  await page.setContent(`<html><body style="margin:0;background:transparent">${body.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  const buf = await page.screenshot({ omitBackground: !flat, clip: { x: 0, y: 0, width: size, height: size } })
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), buf)
  console.log('wrote', name)
}
await browser.close()

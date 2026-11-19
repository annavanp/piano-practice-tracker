import { test, expect, devices, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeTestPdf } from './make-pdf'

const BASE_URL = 'http://localhost:4173/piano-practice-tracker/'
const PDF_PATH = join(dirname(fileURLToPath(import.meta.url)), '.generated', 'test-score.pdf')

type Hand = 'RH' | 'LH' | 'HT'
type Level = 'grey' | 'red' | 'yellow' | 'green'

// Known geometry of the generated PDF (fractions of the page).
const SYSTEMS = [
  { x0: 0.08, y0: 0.1, x1: 0.92, y1: 0.38 },
  { x0: 0.08, y0: 0.5, x1: 0.92, y1: 0.78 },
]
const BARLINES_REL = [1 / 3, 2 / 3]


/** Build and dispatch touch events inside the page. WebKit has no `new Touch()`, so use createTouch. */
const TOUCH_HELPER = `
  const mkTouch = (el, id, cx, cy) => document.createTouch(window, el, id, cx + window.scrollX, cy + window.scrollY, cx, cy);
  const fire = (el, type, pts) => {
    const list = document.createTouchList(...pts.map((p, i) => mkTouch(el, i + 1, p.x, p.y)));
    el.dispatchEvent(new TouchEvent(type, { touches: list, targetTouches: list, changedTouches: list, bubbles: true, cancelable: true }));
  };
  const pointer = (el, type, id, cx, cy) =>
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, isPrimary: true, clientX: cx, clientY: cy, pointerType: 'touch', bubbles: true }));
`

test.describe.configure({ mode: 'serial' })

let context: BrowserContext
let page: Page
/** What the tests expect each light to be, keyed `${bar}:${hand}`. */
const expected = new Map<string, Level>()

function light(bar: number, hand: Hand) {
  return page.locator(`.light[data-bar="${bar}"][data-hand="${hand}"]`)
}

async function expectLevel(bar: number, hand: Hand, level: Level) {
  await expect(light(bar, hand)).toHaveAttribute('data-level', level)
}

async function tapLight(bar: number, hand: Hand) {
  const l = light(bar, hand)
  await l.scrollIntoViewIfNeeded()
  await l.tap()
}

/** Set a light to a level by tapping through the cycle (grey → red → yellow → green). */
async function setLight(bar: number, hand: Hand, level: Level) {
  const order: Level[] = ['red', 'yellow', 'green']
  const current = (await light(bar, hand).getAttribute('data-level')) as Level
  if (current === level) return
  if (level === 'grey') {
    await longPress(light(bar, hand))
  } else {
    let cur = current
    for (let i = 0; i < 4 && cur !== level; i++) {
      await tapLight(bar, hand)
      cur = cur === 'grey' ? 'red' : order[(order.indexOf(cur) + 1) % 3]
    }
  }
  expected.set(`${bar}:${hand}`, level)
  await expectLevel(bar, hand, level)
}

async function longPress(locator: ReturnType<Page['locator']>) {
  await locator.scrollIntoViewIfNeeded()
  const box = (await locator.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await locator.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, clientX: x, clientY: y, pointerType: 'touch', bubbles: true })
  await page.waitForTimeout(750)
  await locator.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true, clientX: x, clientY: y, pointerType: 'touch', bubbles: true })
}

/** Scroll the setup score so the given fraction of a page is centred, then return viewport coords. */
async function setupPoint(pageIndex: number, fx: number, fy: number) {
  const overlay = page.locator(`[data-testid="setup-overlay"][data-page="${pageIndex}"]`)
  await overlay.evaluate((el, fy) => {
    const score = el.closest('.score')!
    const r = el.getBoundingClientRect()
    const sr = score.getBoundingClientRect()
    score.scrollTop += r.top + fy * r.height - (sr.top + sr.height / 2)
  }, fy)
  const box = (await overlay.boundingBox())!
  return { x: box.x + fx * box.width, y: box.y + fy * box.height }
}

async function drag(from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const steps = 8
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
  }
  await page.mouse.up()
}

async function markPage(pageIndex: number) {
  const overlay = page.locator(`[data-testid="setup-overlay"][data-page="${pageIndex}"]`)
  for (const [i, s] of SYSTEMS.entries()) {
    // Centre the whole system on screen so both corners of the drag are inside the viewport.
    await setupPoint(pageIndex, s.x0, (s.y0 + s.y1) / 2)
    const box = (await overlay.boundingBox())!
    const a = { x: box.x + s.x0 * box.width, y: box.y + s.y0 * box.height }
    const b = { x: box.x + s.x1 * box.width, y: box.y + s.y1 * box.height }
    const score = (await page.getByTestId('setup-score').boundingBox())!
    expect(a.y, 'drag start is inside the score viewport').toBeGreaterThan(score.y)
    expect(b.y, 'drag end is inside the score viewport').toBeLessThan(score.y + score.height)
    await drag(a, b)
    await expect(overlay.getByTestId('system'), `system ${i + 1} on page ${pageIndex + 1} was created`).toHaveCount(i + 1)
  }
  for (const [i, s] of SYSTEMS.entries()) {
    const midY = (s.y0 + s.y1) / 2
    const system = overlay.getByTestId('system').nth(i)
    for (const [j, rel] of BARLINES_REL.entries()) {
      const fx = s.x0 + rel * (s.x1 - s.x0)
      const pt = await setupPoint(pageIndex, fx, midY)
      await page.touchscreen.tap(pt.x, pt.y)
      await expect(system.getByTestId('barline'), `barline ${j + 1} in system ${i + 1} on page ${pageIndex + 1} was added`).toHaveCount(j + 1)
    }
  }
}

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  if (!existsSync(PDF_PATH)) await makeTestPdf(PDF_PATH)
  context = await browser.newContext({ ...devices['iPad Pro 11 landscape'], baseURL: BASE_URL })
  page = await context.newPage()
})

test.afterAll(async () => {
  await context?.close()
})

test('1. import a multi-page PDF and see it in the library', async () => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Pieces' })).toBeVisible()
  await page.getByTestId('pdf-input').setInputFiles(PDF_PATH)
  await expect(page.getByRole('dialog', { name: 'New piece' })).toBeVisible()
  await expect(page.getByText('3 pages')).toBeVisible()
  await page.getByLabel('Title').fill('Test Score')
  await page.getByLabel('Composer').fill('A. Composer')
  await page.getByTestId('save-details').click()
  // Lands in setup for the new piece.
  await expect(page.getByTestId('setup')).toBeVisible()
  await expect(page.locator('.page')).toHaveCount(3)

  // Back in the library the piece is listed.
  await page.goto('./')
  const card = page.getByTestId('piece-card')
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('Test Score')
  await expect(card).toContainText('A. Composer')
  await expect(card).toContainText('Bars not marked yet')
})

test('2. mark systems and barlines on two pages in one mode; bars number in reading order', async () => {
  await page.getByRole('button', { name: 'Mark bars' }).click()
  await expect(page.getByTestId('setup')).toBeVisible()
  await expect(page.locator('.page').first().locator('canvas')).toBeVisible()

  await markPage(0)
  await expect(page.getByTestId('bar-count')).toHaveText('2 systems · 6 bars')
  await markPage(1)
  await expect(page.getByTestId('bar-count')).toHaveText('4 systems · 12 bars')

  const numbersOn = async (p: number) =>
    (await page.locator(`[data-testid="setup-overlay"][data-page="${p}"] [data-testid="bar-number"]`).allTextContents()).map(Number).sort((a, b) => a - b)
  expect(await numbersOn(0)).toEqual([1, 2, 3, 4, 5, 6])
  expect(await numbersOn(1)).toEqual([7, 8, 9, 10, 11, 12])

  // Pickup bar: first bar number 0 renumbers everything.
  await page.getByRole('button', { name: 'First bar number: decrease' }).click()
  expect(await numbersOn(0)).toEqual([0, 1, 2, 3, 4, 5])
  await page.getByRole('button', { name: 'First bar number: increase' }).click()
  expect(await numbersOn(0)).toEqual([1, 2, 3, 4, 5, 6])

  // Undo removes the last barline, then redo it by tapping again.
  await page.getByTestId('undo').click()
  await expect(page.getByTestId('bar-count')).toHaveText('4 systems · 11 bars')
  const s = SYSTEMS[1]
  const pt = await setupPoint(1, s.x0 + BARLINES_REL[1] * (s.x1 - s.x0), (s.y0 + s.y1) / 2)
  await page.touchscreen.tap(pt.x, pt.y)
  await expect(page.getByTestId('bar-count')).toHaveText('4 systems · 12 bars')

  // Tapping an existing barline deletes it; tapping again restores it.
  await page.touchscreen.tap(pt.x, pt.y)
  await expect(page.getByTestId('bar-count')).toHaveText('4 systems · 11 bars')
  await page.touchscreen.tap(pt.x, pt.y)
  await expect(page.getByTestId('bar-count')).toHaveText('4 systems · 12 bars')

  // A system can be moved by dragging inside it, deleted with its ✕, and the delete undone.
  // Use the unused third page so the bar counts above stay put.
  const page3 = page.locator('[data-testid="setup-overlay"][data-page="2"]')
  const s0 = SYSTEMS[0]
  await setupPoint(2, s0.x0, (s0.y0 + s0.y1) / 2)
  let box = (await page3.boundingBox())!
  await drag({ x: box.x + s0.x0 * box.width, y: box.y + s0.y0 * box.height }, { x: box.x + s0.x1 * box.width, y: box.y + s0.y1 * box.height })
  await expect(page.getByTestId('bar-count')).toHaveText('5 systems · 13 bars')
  const sysRect = page3.getByTestId('system').locator('rect.system')
  const yBefore = Number(await sysRect.getAttribute('y'))
  box = (await page3.boundingBox())!
  const inside = { x: box.x + 0.2 * box.width, y: box.y + ((s0.y0 + s0.y1) / 2) * box.height }
  await drag(inside, { x: inside.x, y: inside.y + 60 })
  await expect.poll(async () => Number(await sysRect.getAttribute('y'))).toBeGreaterThan(yBefore + 50)
  await expect(page3.getByTestId('barline')).toHaveCount(0)
  await page3.locator('..').getByTestId('delete-system').click()
  await expect(page.getByTestId('bar-count')).toHaveText('4 systems · 12 bars')
  await page.getByTestId('undo').click()
  await expect(page.getByTestId('bar-count')).toHaveText('5 systems · 13 bars')
  await page3.locator('..').getByTestId('delete-system').click()
  await expect(page.getByTestId('bar-count')).toHaveText('4 systems · 12 bars')

  // Two fingers scroll the page and never draw a system.
  const scroller = page.getByTestId('setup-score')
  const top0 = await scroller.evaluate((el) => el.scrollTop)
  box = (await page3.boundingBox())!
  await page3.evaluate(
    new Function('el', 'args', TOUCH_HELPER + `
      const { x, y } = args;
      pointer(el, 'pointerdown', 11, x, y);
      fire(el, 'touchstart', [{ x, y }, { x: x + 80, y }]);
      el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 12, isPrimary: false, clientX: x + 80, clientY: y, pointerType: 'touch', bubbles: true }));
      fire(el, 'touchmove', [{ x, y: y - 150 }, { x: x + 80, y: y - 150 }]);
      pointer(el, 'pointermove', 11, x, y - 150);
      fire(el, 'touchend', []);
      pointer(el, 'pointerup', 11, x, y - 150);
    `) as (el: Element, args: { x: number; y: number }) => void,
    { x: box.x + 0.5 * box.width, y: box.y + 0.9 * box.height },
  )
  await expect.poll(async () => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(top0 + 100)
  await expect(page.getByTestId('bar-count')).toHaveText('4 systems · 12 bars')

  await page.getByTestId('done').click()
  await expect(page.getByTestId('practice')).toBeVisible()
  await expect(page.locator('.light')).toHaveCount(36)
})

test('3. tapping cycles the light, long press resets it, scrolling and pinching change nothing', async () => {
  await expectLevel(1, 'HT', 'grey')
  await tapLight(1, 'HT')
  await expectLevel(1, 'HT', 'red')
  await tapLight(1, 'HT')
  await expectLevel(1, 'HT', 'yellow')
  await tapLight(1, 'HT')
  await expectLevel(1, 'HT', 'green')
  await tapLight(1, 'HT')
  await expectLevel(1, 'HT', 'red')
  // Other lights of the same bar are untouched.
  await expectLevel(1, 'RH', 'grey')
  await expectLevel(1, 'LH', 'grey')

  await longPress(light(1, 'HT'))
  await expectLevel(1, 'HT', 'grey')

  // A finger that moves (scrolling) is not a tap.
  const l2 = light(2, 'HT')
  const box = (await l2.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await l2.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, clientX: x, clientY: y, pointerType: 'touch', bubbles: true })
  await l2.dispatchEvent('pointermove', { pointerId: 1, isPrimary: true, clientX: x, clientY: y + 40, pointerType: 'touch', bubbles: true })
  await l2.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true, clientX: x, clientY: y + 40, pointerType: 'touch', bubbles: true })
  await expectLevel(2, 'HT', 'grey')

  // A scroll that the browser cancels mid-press is not a tap either.
  await l2.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, clientX: x, clientY: y, pointerType: 'touch', bubbles: true })
  await l2.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true, pointerType: 'touch', bubbles: true })
  await page.waitForTimeout(800)
  await l2.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true, clientX: x, clientY: y, pointerType: 'touch', bubbles: true })
  await expectLevel(2, 'HT', 'grey')

  // Scrolling the score (a one-finger swipe that starts on a light) changes nothing.
  await l2.evaluate(
    new Function('el', 'args', TOUCH_HELPER + `
      const { x, y } = args;
      pointer(el, 'pointerdown', 3, x, y);
      fire(el, 'touchstart', [{ x, y }]);
      fire(el, 'touchmove', [{ x, y: y - 80 }]);
      pointer(el, 'pointermove', 3, x, y - 80);
      el.closest('.score').scrollTop += 80;
      fire(el, 'touchend', []);
      pointer(el, 'pointerup', 3, x, y - 80);
    `) as (el: HTMLElement, args: { x: number; y: number }) => void,
    { x, y },
  )
  await expect(page.locator('.light[data-level="grey"]')).toHaveCount(36)
  await page.getByTestId('score').evaluate((el) => (el.scrollTop = 0))

  // A two-finger pinch that starts on a light changes nothing and changes the zoom.
  const zoomBefore = await page.getByRole('button', { name: 'Fit width' }).textContent()
  await l2.evaluate(
    new Function('el', 'args', TOUCH_HELPER + `
      const { x, y } = args;
      pointer(el, 'pointerdown', 7, x, y);
      fire(el, 'touchstart', [{ x, y }, { x: x + 60, y: y + 60 }]);
      fire(el, 'touchmove', [{ x: x - 20, y: y - 20 }, { x: x + 80, y: y + 80 }]);
      fire(el, 'touchend', []);
      pointer(el, 'pointerup', 7, x, y);
    `) as (el: HTMLElement, args: { x: number; y: number }) => void,
    { x, y },
  )
  await expectLevel(2, 'HT', 'grey')
  await expect(page.locator('.light[data-level="grey"]')).toHaveCount(36)
  await expect(page.getByRole('button', { name: 'Fit width' })).not.toHaveText(zoomBefore!)
  await page.getByRole('button', { name: 'Fit width' }).click()
  await expect(page.getByRole('button', { name: 'Fit width' })).toHaveText('100%')
})

test('4. piece, bars and lights survive closing and reopening the app', async () => {
  await setLight(1, 'HT', 'green')
  await setLight(2, 'RH', 'red')
  await setLight(3, 'LH', 'yellow')
  await setLight(12, 'HT', 'yellow')

  await page.goto('./')
  await page.reload()
  await expect(page.getByTestId('piece-card')).toContainText('Test Score')
  await expect(page.getByTestId('piece-percent')).toHaveText('8% green · 12 bars')
  await page.getByTestId('piece-card').getByRole('button', { name: /Test Score/ }).click()
  await expect(page.getByTestId('practice')).toBeVisible()
  await expect(page.locator('.light')).toHaveCount(36)
  for (const [key, level] of expected) {
    const [bar, hand] = key.split(':')
    await expectLevel(Number(bar), hand as Hand, level)
  }
  await expectLevel(5, 'HT', 'grey')
})

test('5. progress panel numbers match the lights, for the piece and for a section', async () => {
  await setLight(2, 'HT', 'green')
  await setLight(3, 'HT', 'red')
  await setLight(4, 'HT', 'yellow')
  // HT: bars 1,2 green; 3 red; 4 yellow; 12 yellow; rest grey → 2/12 = 17%.
  await expect(page.getByTestId('headline-percent')).toContainText('17%')
  const seg = (stack: string, level: Level) => page.locator(`[data-testid="${stack}"] [data-level="${level}"]`)
  await expect(seg('stack-HT', 'green')).toHaveAttribute('data-count', '2')
  await expect(seg('stack-HT', 'yellow')).toHaveAttribute('data-count', '2')
  await expect(seg('stack-HT', 'red')).toHaveAttribute('data-count', '1')
  await expect(seg('stack-HT', 'grey')).toHaveAttribute('data-count', '7')
  await expect(seg('stack-RH', 'red')).toHaveAttribute('data-count', '1')
  await expect(seg('stack-RH', 'grey')).toHaveAttribute('data-count', '11')
  await expect(seg('stack-LH', 'yellow')).toHaveAttribute('data-count', '1')
  await expect(seg('stack-LH', 'grey')).toHaveAttribute('data-count', '11')

  // Section bars 1–3: green 2, red 1 → 67%.
  await page.getByTestId('add-section').click()
  await page.getByLabel('Name').fill('Opening')
  await page.getByTestId('section-end').fill('3')
  await page.getByTestId('save-section').click()
  const section = page.getByTestId('section')
  await expect(section).toHaveCount(1)
  await expect(section).toContainText('Opening')
  await expect(section).toContainText('Bars 1–3 · 67% green')
  await expect(section.locator('[data-testid="section-stack"] [data-level="green"]')).toHaveAttribute('data-count', '2')
  await expect(section.locator('[data-testid="section-stack"] [data-level="red"]')).toHaveAttribute('data-count', '1')
  await expect(section.locator('[data-testid="section-stack"] [data-level="grey"]')).toHaveCount(0)

  // Tapping the section scrolls to and outlines its first bar.
  await page.getByTestId('score').evaluate((el) => (el.scrollTop = 2000))
  await section.locator('.jump').click()
  await expect(page.getByTestId('target-outline')).toHaveAttribute('data-bar', '1')
  await expect(light(1, 'HT')).toBeInViewport()

  // Panel collapses to give the score the full width.
  const scoreWidth = (await page.getByTestId('score').boundingBox())!.width
  await page.getByTestId('panel-toggle').click()
  await expect(page.getByTestId('panel')).toHaveCount(0)
  expect((await page.getByTestId('score').boundingBox())!.width).toBeGreaterThan(scoreWidth + 200)
  await page.getByTestId('panel-toggle').click()
  await expect(page.getByTestId('panel')).toBeVisible()
})

test('6. the history chart shows a change made on a different day', async () => {
  const columns = page.locator('[data-testid="history-chart"] g[data-day]')
  await expect(columns).toHaveCount(1)
  const today = await columns.first().getAttribute('data-day')
  await expect(columns.first()).toHaveAttribute('data-green', '2')

  await page.clock.setFixedTime(new Date('2027-01-05T10:00:00'))
  await setLight(5, 'HT', 'green')
  await setLight(3, 'HT', 'green')
  await expect(columns).toHaveCount(2)
  await expect(columns.nth(0)).toHaveAttribute('data-day', today!)
  await expect(columns.nth(0)).toHaveAttribute('data-green', '2')
  await expect(columns.nth(0)).toHaveAttribute('data-red', '1')
  await expect(columns.nth(1)).toHaveAttribute('data-day', '2027-01-05')
  await expect(columns.nth(1)).toHaveAttribute('data-green', '4')
  await expect(columns.nth(1)).toHaveAttribute('data-red', '0')
  await expect(columns.nth(1)).toHaveAttribute('data-yellow', '2')
})

test('7. next and previous land only on bars that match the filter', async () => {
  // Make a known pattern. HT: 1,2,3,5 green; 4,12 yellow; make 7 red, 9 red, 10 yellow.
  await setLight(7, 'HT', 'red')
  await setLight(9, 'HT', 'red')
  await setLight(10, 'HT', 'yellow')
  // RH: 2 red; add 8 yellow.
  await setLight(8, 'RH', 'yellow')

  const outlined = async () => Number(await page.getByTestId('target-outline').getAttribute('data-bar'))
  const visit = async (btn: 'next-target' | 'prev-target', n: number) => {
    const seen: number[] = []
    for (let i = 0; i < n; i++) {
      await page.getByTestId(btn).click()
      await expect(page.getByTestId('target-outline')).toBeVisible()
      seen.push(await outlined())
      await expect(light(seen[seen.length - 1], 'HT')).toBeInViewport()
    }
    return seen
  }

  // Default: HT, red + yellow → 4, 7, 9, 10, 12, then wraps to 4.
  await page.getByTestId('filter-hand-HT').click()
  await page.getByTestId('filter-threshold-red-yellow').click()
  expect(await visit('next-target', 6)).toEqual([4, 7, 9, 10, 12, 4])
  expect(await visit('prev-target', 2)).toEqual([12, 10])

  // Red only → 7, 9.
  await page.getByTestId('filter-threshold-red').click()
  expect(await visit('next-target', 3)).toEqual([7, 9, 7])

  // RH, red + yellow → 2, 8.
  await page.getByTestId('filter-hand-RH').click()
  await page.getByTestId('filter-threshold-red-yellow').click()
  expect(await visit('next-target', 3)).toEqual([8, 2, 8])

  // LH red only → nothing matches: no outline, a notice instead.
  await page.getByTestId('filter-hand-LH').click()
  await page.getByTestId('filter-threshold-red').click()
  await page.getByTestId('next-target').click()
  await expect(page.getByTestId('notice')).toContainText('No LH bars need work')
  await expect(page.getByTestId('target-outline')).toHaveCount(0)

  // Restore the default for later tests.
  await page.getByTestId('filter-hand-HT').click()
  await page.getByTestId('filter-threshold-red-yellow').click()
})

test('8. export, delete all data, then import restores everything including the PDF', async () => {
  await page.goto('./')
  const before = await page.getByTestId('piece-percent').textContent()
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^piano-practice-backup-.*\.json$/)
  const dir = mkdtempSync(join(tmpdir(), 'ppt-backup-'))
  const backupPath = join(dir, download.suggestedFilename())
  await download.saveAs(backupPath)

  await page.getByTestId('clear-all').click()
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('piece-card')).toHaveCount(0)
  await expect(page.getByText('No pieces yet')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('piece-card')).toHaveCount(0)

  await page.getByTestId('backup-input').setInputFiles(backupPath)
  await expect(page.getByRole('dialog', { name: 'Restore backup?' })).toContainText('1 piece')
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('piece-card')).toHaveCount(1)
  await expect(page.getByTestId('piece-card')).toContainText('Test Score')
  await expect(page.getByTestId('piece-percent')).toHaveText(before!)

  await page.getByTestId('piece-card').getByRole('button', { name: /Test Score/ }).click()
  await expect(page.getByTestId('practice')).toBeVisible()
  await expect(page.locator('.page')).toHaveCount(3)
  await expect(page.locator('.light')).toHaveCount(36)
  for (const [key, level] of expected) {
    const [bar, hand] = key.split(':')
    await expectLevel(Number(bar), hand as Hand, level)
  }
  await expect(page.getByTestId('section')).toContainText('Opening')
  // The PDF came back: the first page has rendered pixels.
  const firstCanvas = page.locator('.page').first().locator('canvas')
  await expect.poll(async () => firstCanvas.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(0)
  await expect(page.locator('.page').first().locator('.placeholder')).toHaveCount(0)
})

test('9. the app loads and works with the network turned off', async () => {
  await page.goto('./')
  // Let the service worker finish installing and precaching.
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    return !!reg?.active
  })
  await page.waitForTimeout(1500)
  await context.setOffline(true)
  try {
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Pieces' })).toBeVisible()
    await expect(page.getByTestId('piece-card')).toContainText('Test Score')
    await page.getByTestId('piece-card').getByRole('button', { name: /Test Score/ }).click()
    await expect(page.locator('.light')).toHaveCount(36)
    const firstCanvas = page.locator('.page').first().locator('canvas')
    await expect.poll(async () => firstCanvas.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(0)
  } finally {
    await context.setOffline(false)
  }
})

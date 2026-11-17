import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * A small three-page "score": two systems per page, each with a treble and a bass staff and a few
 * note heads. It is generated at test time and never committed. The geometry is known to the tests:
 * system 1 occupies y 0.12–0.36 of the page, system 2 y 0.52–0.76, both x 0.10–0.90.
 */
export async function makeTestPdf(path: string, pages = 3): Promise<void> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const W = 612
  const H = 792
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([W, H])
    if (p === 0) page.drawText('Test Score', { x: 60, y: H - 50, size: 22, font })
    page.drawText(`${p + 1}`, { x: W - 60, y: 30, size: 10, font })
    for (const [top, bottom] of [
      [0.12, 0.36],
      [0.52, 0.76],
    ]) {
      const sysTop = H - top * H
      const sysBottom = H - bottom * H
      const span = sysTop - sysBottom
      // Two staves inside the system box, leaving some whitespace above and below.
      for (const staffStart of [sysTop - span * 0.12, sysBottom + span * 0.36]) {
        for (let l = 0; l < 5; l++) {
          const y = staffStart - l * 9
          page.drawLine({ start: { x: 0.1 * W, y }, end: { x: 0.9 * W, y }, thickness: 0.8, color: rgb(0, 0, 0) })
        }
      }
      // Brace-like left edge and barlines at the system edges and at thirds.
      for (const fx of [0.1, 0.1 + 0.8 / 3, 0.1 + (0.8 * 2) / 3, 0.9]) {
        page.drawLine({ start: { x: fx * W, y: sysTop - span * 0.12 }, end: { x: fx * W, y: sysBottom + span * 0.36 - 36 }, thickness: 1.2, color: rgb(0, 0, 0) })
      }
      // Some note heads.
      for (let i = 0; i < 9; i++) {
        const x = 0.13 * W + i * (0.74 * W) / 9
        page.drawEllipse({ x, y: sysTop - span * 0.12 - (i % 4) * 9 - 4, xScale: 4, yScale: 3, color: rgb(0, 0, 0) })
        page.drawEllipse({ x, y: sysBottom + span * 0.36 - (i % 3) * 9 - 13, xScale: 4, yScale: 3, color: rgb(0, 0, 0) })
      }
    }
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, await doc.save())
}

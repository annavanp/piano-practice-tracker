# Piano Practice Tracker

A web app for the iPad that tracks how well you can play each bar of a piano piece. Import a PDF of the sheet music, mark where the bars are once, then set a red / yellow / green light on every bar as you practise. A panel on the right shows your progress on the piece.

- **Live app:** https://annavanp.github.io/piano-practice-tracker/
- **Repository:** https://github.com/annavanp/piano-practice-tracker

Everything stays on the iPad: there is no backend, no account and no sync. PDFs and progress live in the browser's IndexedDB.

## Install on the iPad home screen

1. Open the live URL in Safari on the iPad.
2. Tap the **Share** button (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. Open **Practice** from the home screen. It runs full-screen and works offline after the first load.

Keep using the home-screen copy rather than the Safari tab: iPadOS keeps separate storage for each, so pieces added in one do not appear in the other.

## Using the app

**Library.** Tap **Add piece from PDF…**, pick a PDF from the Files app, and give it a title and composer. You land in bar marking. Each piece in the list shows its hands-together progress. **Rename**, **Delete** (asks first) and **Bars** (reopen bar marking) are on each card.

**Marking bars** (once per piece):

1. In **Systems** mode, drag a rectangle around each system (both staves together) on every page.
2. In **Barlines** mode, tap inside a system wherever there is a barline. The left and right edges of the system already count, so only tap the ones in between.
3. Bars are numbered automatically in reading order across systems and pages. Set **First bar** to 0 if the piece starts with a pickup bar.

Tap a system to select it, then drag it to move, drag a corner handle to resize, or tap the red ✕ to delete it. Tap a barline to delete it, or drag it to move it. **Undo** reverts the last change. You can reopen bar marking at any time; bars that did not change keep their lights.

**Practice view.** The score scrolls vertically through all pages. Above every bar are three lights: **R** (right hand), **L** (left hand) and **H** (hands together).

- Tap a light to cycle grey → red → yellow → green → red.
- Long-press a light to reset it to grey.
- Each level also has a glyph, so colour is never the only cue: ✕ red, − yellow, ✓ green, blank grey.
- Zoom with a two-finger pinch or the − / + buttons; tap the percentage to fit the width again.
- **Needs work ◀ ▶** jump to the previous or next bar that still needs work. The target bar is outlined in blue.
- **Progress** shows or hides the panel. In portrait the panel starts hidden.
- **Tint bars by HT colour** (in the panel) shades each bar faintly with its hands-together colour.

**Progress panel.** Headline percentage of bars that are green hands-together; a stacked bar per hand; sections (tap one to scroll to it, ✎ to edit, ✕ to delete); a history chart of hands-together red / yellow / green counts by day; and the practice-filter settings (which light counts, and whether yellow counts as needing work).

## Back up and restore

Progress only exists on this iPad, so back up now and then.

- **Export backup** (Library → Backup) saves one JSON file holding every piece, its PDF and all progress. On the iPad it goes to the Files app's Downloads folder. **Share backup…** opens the share sheet instead, so you can send it to iCloud Drive, AirDrop or Mail.
- **Import backup…** picks such a file, shows how many pieces it contains, and asks before replacing what is in the app. Restoring replaces everything.
- **Delete all data…** wipes the app's storage after confirmation.

The backup file carries a schema version, as does the database, so a later version of the app can migrate old data.

## Decisions made on your behalf

- **Storage shape.** The suggested data model is used almost as written. Barlines are stored on their system (as fractions of the system width) rather than as separate records; bars are derived from systems and stored with their edges as fractions of the page width, and also as fractions of the system width. A bar keeps its id, and therefore its lights, when it sits in the same system at the same relative edges as before. Moving a whole system therefore keeps all its lights; moving a barline changes only the two bars beside it.
- **PDF bytes** are stored as an ArrayBuffer rather than a Blob, because WebKit's IndexedDB refused to store Blobs in testing. The in-memory model still uses a Blob.
- **Sections** are stored by displayed bar number (start and end inclusive). Changing the first bar number later shifts which bars a section covers.
- **Importing a backup replaces everything** rather than merging, which keeps restore predictable.
- **History chart** shows one column per day on which a hands-together light changed, plus today, using the local date. Days without changes are omitted so a long gap does not flatten the chart. Only bars that still exist are counted.
- **Practice filter navigation** moves through the piece in reading order from the current target and wraps around at the ends. When nothing matches, a short notice appears and no bar is outlined.
- **Light hit areas** are 44 pt tall and up to 56 pt wide. On narrow bars the width shrinks to a third of the bar (never below 30 pt) so neighbouring lights do not overlap; zoom in or hide the panel if bars are cramped. The coloured pill itself stays small so it does not cover notes.
- **Gestures.** A tap only counts if the finger moves less than 10 pt and lifts within 550 ms; a long press is 550 ms. One-finger scrolling is left to Safari; a second finger cancels any pending tap and starts a pinch that the app handles itself (page pinch-zoom is disabled in the viewport meta tag so the layout cannot be zoomed accidentally).
- **Panel visibility** follows orientation: shown in landscape, hidden in portrait, with the **Progress** button overriding until the next rotation. On screens narrower than 700 px the panel floats over the score.
- **Bar numbers** are shown on the score only for the first bar of each system, in the left margin, to keep the page quiet. In bar marking every bar shows its number.
- **Pages** render at the device pixel ratio for the current zoom, lazily, with bitmaps released when a page is more than about one and a half screens away, so long PDFs stay smooth.
- **PDF.js assets** (standard fonts and the JPEG 2000 / JBIG2 decoders) are bundled and precached so scanned scores render offline.
- **Service worker** updates automatically on the next launch after a deploy.
- **Hash routing** (`#/`, `#/piece/<id>`, `#/piece/<id>/setup`) so GitHub Pages needs no rewrite rules.
- **Styling** is plain CSS with a small token set; no UI framework.

## What could not be verified without a real iPad

Check these first:

1. **Add to Home Screen and full-screen launch.** The manifest, icons and `apple-mobile-web-app-capable` tag are in place, but the install flow itself was not exercised on a device.
2. **Pinch-to-zoom on the score** and that one-finger scrolling never triggers a light. Tested with synthesised touch events in WebKit, not with real fingers.
3. **Long press** does not trigger the iOS text-selection callout (it is disabled in CSS, which usually suffices).
4. **Wake Lock.** Supported in iPadOS Safari 16.4 and later; silently skipped otherwise.
5. **Export in home-screen mode.** Safari's download behaviour in standalone apps varies by iPadOS version; if **Export backup** does nothing, use **Share backup…**.
6. **Storage persistence.** `navigator.storage.persist()` is requested on first launch. iPadOS can still evict data from a site that has not been used for a long time, so export backups regularly.
7. **Apple Pencil taps** are handled through the same pointer events as fingers but were not tested on hardware.
8. **Memory on 30-page PDFs** at high zoom on an actual device.

## Development

```bash
npm install
npm run dev          # local dev server
npm run build        # production build to dist/
npm test             # Playwright acceptance tests (WebKit, iPad viewport, touch)
npm run typecheck    # tsc for app and tests
npm run lint
npm run icons        # regenerate PNG icons from public/icons/icon.svg
npm run screenshots  # drive the built app and save screenshots (args: pdf path, output dir)
```

The tests generate a small three-page score with pdf-lib into `tests/.generated/` (ignored by git) and cover the ten acceptance checks that can run without a device: import, bar marking across two pages, tap / long press / scroll / pinch behaviour, persistence across reload, panel counts for the piece and a section, the history chart across a simulated date change, filter navigation, export → clear → import including the PDF, and offline loading through the service worker.

Deployment is a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds and publishes `dist/` to GitHub Pages on every push to `main`. A second workflow runs the test suite.

## Out of scope for now

Automatic barline detection, searching for or downloading scores, MusicXML, metronome and tempo targets, notes per bar, practice-time logging, Pencil annotation, accounts or sync, and a native app. The code is organised so these can be added later: data access is in `src/db`, pure calculations in `src/lib`, and each view in `src/views`.

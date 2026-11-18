# Page Builder stability release — 11 September 2026

Release image: `tatoz-app:release-20260911T1210Z-builder-stability`.

Deployed to the web and worker containers on `72.60.98.121` (`/opt/tatoz`, port `8000`). Candidate and public readiness checks returned OK with MongoDB up.

## Reproduced defects and fixes

| Defect | Result |
| --- | --- |
| Saving `null` opacity converted it to zero | Empty values remain inherited; intentional zero remains zero. |
| Empty typography became 8px with 0.8 line height | Repeated saves preserve null defaults and negative letter spacing. |
| Clearing image dimensions produced zero dimensions | Clearing restores the widget's own dimensions. |
| Device switches reloaded the iframe and lost unsaved preview updates | Stable iframe with a ready/state handshake and a bridge scoped to its parent editor. |
| Desktop preview shrank to a tablet/mobile viewport | Actual 1440px desktop, 820px tablet and 390px mobile viewports scaled to fit the editor. |
| Full-page screenshot capture ran after routine edits | Routine preview checks inspect the DOM without expensive rasterization. |
| Switching to a shorter hero slide list could crash rendering | The active slide resolves synchronously before the reset effect. |
| Mosaic rows collapsed or stacked on mobile | Explicit grid areas and row tracks preserve all four patterns across breakpoints. |
| Grid controls were missing, hardcoded or stripped on save | Columns and numeric gaps persist for cards, galleries, products, categories, benefits, stats, testimonials and posts. |
| Mosaic sizing/cropping was not editable | Pattern/stack mode, aspect ratio, height, gap, row/column gaps, corners and per-tile crop/focus/alt text. |
| Font controls changed a wrapper but not its text | Explicit overrides reach rendered text; static class names retain these rules in production CSS. |
| Builder's default font differed from the platform | Default sans uses the same Inter stack as the platform. |
| Rich text lost heading/list formatting and ignored width | Scoped rich-text styles and working content-width constraints. |
| Changing one mobile media/font property froze inherited properties | Sparse nested overrides; tablet values cascade to mobile unless overridden. |
| Linked spacing retained old individual sides | An all-sides value replaces stale per-side values. |
| Undoing layout mode left editing pointed at the wrong document | Restored mode and edit target stay consistent; separate mobile starts from the resolved mobile layout. |
| Upload completion could target the currently selected device | Upload changes retain their originating document/device context. |
| Widget tree rows remounted on edits | Stable sortable row component; keyboard reordering tested. |
| Queued saves used stale revisions or replaced newer edits | Ordered writes, immediate revision acknowledgement, canonical responses and editor-session guards. |
| Publish/discard and vendor saves could overwrite concurrent edits | Atomic revision checks also protect publish, discard and version restoration. |

## Verification

- `npm test -- --runInBand`: 41 tests passed across four suites.
- `npm run build:client`: production build passed.
- `node tests/selenium.pagebuilder.cjs`: passed against a disposable database and the production client build.
- Browser coverage includes login, keyboard reordering, image geometry/visibility, four mosaic presets, card/gallery/stat/benefit gaps, font controls, desktop/tablet/mobile switching, different slide counts, save/reload, shared/separate documents, publish/discard, stale revisions and public layouts at 320, 390, 820 and 1440 pixels.

## Existing data recovery

The live homepage had the same corruption signature in both its draft and published documents. The repair only resets that signature; it preserves content, section ids/order, distinct draft and published layouts, and intentional zero opacity outside the signature. Shared layout mode and platform fonts are applied explicitly for this homepage. The stored separate mobile document is retained.

Dry run:

```sh
node scripts/repairPageBuilderDefaults.js --page-id=6a971d46d1331f240cda2559 --shared-layout --platform-fonts
```

Add `--apply` to perform the repair. It archives the original BSON document in `pagebuilderrepairbackups` and uses a revision-checked update. Repeating it after a successful repair is a no-op.

Source and database backup directory: `/opt/tatoz/backups/20260911-page-builder-stability`.

Repair completed at homepage revision 277. A subsequent dry run reported no remaining changes. Live browser checks at 1440, 390 and 320px confirmed matching section ids/order, Inter typography, the same mosaic grid areas, no broken or transparent content images, and no horizontal page overflow.

Previous containers are retained, stopped, as `tatoz-app-pre-builder-stability-20260911T1210Z` and `tatoz-worker-pre-builder-stability-20260911T1210Z` for rollback.

Editors opened before this release should be refreshed to load the new client and repaired revision.

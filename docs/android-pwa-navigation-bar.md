# Android PWA viewport and system navigation bar

## Reproduction (22 October 2026)

On Samsung Android in an installed web app (standalone display), the reader can
render in the dark application theme while the **system navigation bar** at the
very bottom stays light. The screenshot was taken in Compline, but this is
app-wide and is not a liturgical-text or reader issue.

The bottom strip with Android Back/Home/Recents buttons is **outside the web
document**. Styling `html`, `body` and `meta[name=theme-color]` does not
guarantee that Android will repaint this system-owned region.

## App-owned remediation

- `index.html`: the earliest document paint sets a light/dark
  `--app-viewport-background`, background colour and `color-scheme`, using
  the saved theme preference or the OS preference.
- `src/styles/main.scss`: `html` and `body` paint the exact same
  viewport background instead of risking a light body/overscroll patch.
- `tests/appearance.test.mjs`: guards both appearances and the shared canvas.

The Web App Manifest has only one static `theme_color` and `background_color`
(light defaults); changing them permanently to dark would merely reverse the
mismatch for readers using the light theme. Runtime `theme-color` already
updates in `src/stores/settings.js`, and must not be removed.

## External limitation

Known Chromium regressions affect the native bars in installed PWAs,
independently of webpage styles:

- https://issues.chromium.org/issues/554055703 — installed PWA runtime
  `theme-color` regression (reported August–September 2026).
- https://github.com/GoogleChrome/android-browser-helper/issues/636 —
  white native Android navigation bar in installed PWA and TWA (October 2026).

Do not claim this PR fixes the *native* navigation bar on all Android
versions: the web page cannot set the activity's native navigation-bar
colour or button appearance. A browser fix or a native Android wrapper may
be needed if the OS persistently paints the strip incorrectly.

## Manual acceptance matrix (real-device verification)

On a Samsung device with three-button navigation, and on a device with
gesture navigation, check each in the **installed PWA** and an ordinary
browser tab:

1. Explicit dark app theme + light Android system theme.
2. Explicit light app theme + dark Android system theme.
3. System app theme + Android light, then Android dark.
4. Restart the PWA, refresh, scroll past the bottom, and navigate between
   Compline, other Hours, prayers, and readings.
5. Verify web document/overscroll has the correct colour immediately and
   remains consistent when changing app theme.
6. Record separately whether the **native navigation bar** follows, is
   stuck to the installation colour, or is controlled by the browser build.

Do not force fixed padding or a fake bottom bar into the page to hide the
native panel: it cannot be safely replaced or controlled from CSS.

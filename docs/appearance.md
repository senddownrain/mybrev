# Ambient prayer-book palette

The application uses warm paper, walnut and ink in light mode; espresso,
parchment text and muted bronze in dark mode. Prayer-library accents are
chestnut/terracotta. Rubrics retain their own red.

`src/constants/appearance.js` is the palette source for Vuetify, the runtime
status bar and the PWA manifest. `src/styles/main.scss` aliases Vuetify RGB
variables into the existing chrome, devotional, navigation and reader tokens.
This also covers teleported menus, bottom sheets, dialogs and tooltips.

The initial HTML and standalone 404 page have small first-paint fallbacks;
`tests/appearance.test.mjs` checks their agreement with the shared palette.
The manifest remains static (light walnut/paper), while the loaded app follows
the saved light/dark preference. No seasonal colour is used for browser chrome.

Liturgical colours are independent: `src/constants/liturgical.js` owns period,
feast, Marian and Requiem themes. Purple remains valid in those explicit
liturgical contexts, never as a default settings/navigation accent. Reading
icons use the same resolved theme as their cards, including feast overrides.

Ambient gradients and restrained hero shadows remain; no purple ambient glow.
Fonts are unchanged: Source Sans 3 for UI, Cormorant SC for display headings,
Literata by default for reading, with Source Serif 4, Old Standard TT, Kurale
and system alternatives.

Run `node --test tests/appearance.test.mjs tests/liturgical-theme.test.mjs`
to check palette roles, text/focus contrast and seasonal separation.

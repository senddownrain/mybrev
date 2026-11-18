# Prayer foot: "Заўважылі памылку ў тэксце? — Паведаміць"

Screenshots in `screenshots/`: `before-*` (main, bare underlined link flush against the card edge) and `after-*`
(new block). Only the bottom viewport of each page is captured (no full book texts).
Matrix: widths 320/390/768/1024/1440, light/dark/marian, font x1.5, short prayer with source, long prayer
with and without source, Holy Mass (`?lang=la` too), open side menu, keyboard focus, form opened from the block.
Measured on every "after" page: `scrollWidth == innerWidth` (no horizontal overflow), link never clipped, action height 44px.
Local only: GitHub Actions did not run for this change; the browser pass above is the evidence.

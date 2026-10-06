/**
 * One liturgical colour for every screen.
 *
 * The vestment colour comes from the Ordo (`ResolvedLiturgicalDay`, Latin
 * names): albus, ruber, viridis, violaceus, rosaceus, niger. It is what the
 * Ordo writes («Колер літургічнага адзення: Белы») and what Hours, Readings,
 * the Ordo month/day, the date picker and `/picker` paint with.
 *
 * Marian blue is a secondary, decorative accent of a Marian celebration whose
 * vestment stays white; it is never presented as the vestment colour.
 *
 * Title/rank heuristics (`getLiturgicalCelebrationThemeKey`) remain only as
 * the fallback for documents without an Ordo identity.
 *
 * Pure.
 */
export {
  VESTMENT_COLOR_KEYS, VISUAL_THEMES, VESTMENT_COLORS, liturgicalVisual, vestmentLabel, visualStamp, visualOfDocument,
} from '../constants/liturgical.js';

/** WCAG relative luminance / contrast (for the accessibility tests and audits). */
export function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const value = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255)
      .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

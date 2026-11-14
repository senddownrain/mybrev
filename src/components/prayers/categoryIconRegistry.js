import {
  PhAnchor, PhBaby, PhBell, PhBird, PhBookBookmark, PhBookmark, PhBookOpen, PhBookOpenText, PhCalendarDots,
  PhChatCircleText, PhChurch, PhCross, PhCrown, PhDrop, PhDropHalf, PhFlame, PhFlower, PhFootprints, PhGift,
  PhGrains, PhHandHeart, PhHandsPraying, PhHeart, PhHouse, PhListDashes, PhMoonStars, PhMountains,
  PhMusicNotes, PhPath, PhPlant, PhScroll, PhShield, PhSparkle, PhStar, PhSun, PhSunHorizon, PhUsersThree,
} from '@phosphor-icons/vue';
import { CATEGORY_ICONS } from '@/constants/prayerCategoryIcons.js';

const PHOSPHOR = {
  PhAnchor, PhBaby, PhBell, PhBird, PhBookBookmark, PhBookOpen, PhBookOpenText, PhCalendarDots,
  PhChatCircleText, PhChurch, PhCross, PhCrown, PhDrop, PhDropHalf, PhFlame, PhFlower, PhFootprints, PhGift,
  PhGrains, PhHandHeart, PhHandsPraying, PhHeart, PhHouse, PhListDashes, PhMoonStars, PhMountains,
  PhMusicNotes, PhPath, PhPlant, PhScroll, PhShield, PhSparkle, PhStar, PhSun, PhSunHorizon, PhUsersThree,
};

/** Trusted, bundled artwork only (never markup from Firestore or storage). */
const SVG_SOURCES = import.meta.glob('/src/assets/category-icons/*.svg', { query: '?raw', import: 'default', eager: true });

export const FALLBACK_ICON_COMPONENT = PhBookmark;

export const PHOSPHOR_COMPONENTS = Object.fromEntries(
  CATEGORY_ICONS.filter((icon) => icon.source === 'phosphor').map((icon) => [icon.key, PHOSPHOR[`Ph${icon.phosphor}`]]),
);

export const CUSTOM_SVG_MARKUP = Object.fromEntries(
  CATEGORY_ICONS.filter((icon) => icon.source === 'svg').map((icon) => [icon.key, SVG_SOURCES[`/src/assets/category-icons/${icon.svg}`]]),
);

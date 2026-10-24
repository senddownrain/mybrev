// Synthetic presentation fixtures: no database export or live requests.
import { GADZINKI_PARTS } from '../../../src/utils/devotionalOffice.js';

export const hymn = 'Першая страфа гімна.\nДругі радок гімна.\n\nДругая страфа гімна.';
export const reading = 'Бо калі верым, што Езус памёр і ўваскрос, то і Бог прывядзе разам з Ім памерлых.';
export const responsory = 'К.У рукі Твае, Пане. Н.Аддаю дух мой.\n\n**К.:** Ты адкупіў нас.\n**Н.:** Божа праўды.';
export const canticleBody = 'Узвялічвае душа мая Пана, *\nі ўзрадаваўся дух мой.\n\nБо глянуў Ён † на пакору, *\nі вялікае ўчыніў мне.';
export function officeSource(profile) {
  const canticle = profile === 'laudes' ? 'Песня Захарыі (Лк 1, 68–79)' : 'Песня Марыі (Лк 1, 46–55)';
  return `# Набажэнства\n\n## Пачатак\nК. Пане, дапамажы.\nН. Амэн.\n\n## Гімн\n${hymn}\n\n## Псальмодыя\n1 ант. Пане, дапамажы.\n### Псальм 1\nШчаслівы чалавек, * які спадзяецца на Пана.\n1 ант. Пане, дапамажы.\n\n## Кароткае чытанне і рэспансорый\nКароткае чытанне 1 Тэс 4, 14\n${reading}\n\nКароткі рэспансорый\n${responsory}\n\n## ${canticle}\nАнт. Пане, вядзі нас.\n${canticleBody}\nАнт. Пане, вядзі нас.\n\n## Просьбы\nПросім Цябе.\n## Ойча наш\nОйча наш.\n## Малітва\nПане, выслухай нас.\n## Завяршэнне\nН. Амэн.\n## Іншыя варыянты частак Гадзіны\n`;
}
export const fixtures = [
  ...['office-for-dead', 'blessed-virgin-mary'].flatMap(name => ['laudes', 'vesper'].map(profile => ({
    id: `mybrev-devotion-${name}-${profile}`, profile, text: officeSource(profile),
  }))),
  { id: 'catholicby-yearcycle-100116', profile: 'gadzinki', text: GADZINKI_PARTS.map(part => `## ${part}\n### Гімн\n${hymn}\n### Антыфона\n**К.:** Пане, дапамажы.\n**Н.:** Амэн.`).join('\n\n') },
];

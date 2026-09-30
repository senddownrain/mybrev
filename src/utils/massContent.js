import { parsePrayerMarkdown, renderPrayerInline } from './prayerMarkdown.js';
import {
  MASS_RITUAL, getMassSection, locateMassSections, normalizeMassMarker, massMarkerMatches,
} from './massRitual.js';

// Deterministic adapter from a Mass variant's prayer Markdown to semantic
// blocks. It never edits wording: it only regroups existing text into blocks,
// assigns block types, roles and section anchors, and drops markup that only
// encoded structure (heading hashes, a heading's wrapping bold, speaker
// prefixes that became role metadata, the English "bold = people" convention).
// The same rules are described in docs/holy-mass.md for other clients.

const CLASSIFY_ORDER = ['heading', 'rubric', 'comment', 'posture', 'alternative'];
const RESPONSE_ROLES = new Set(MASS_RITUAL.rolePolicy?.responseRoles || ['people', 'all']);

function stripWrappingStrong(text) {
  const match = String(text).match(/^(\*\*|__)([\s\S]+)\1$/);
  return match && !match[2].includes(match[1]) ? match[2].trim() : String(text).trim();
}

function isWholeLineStrong(line) {
  const trimmed = line.trim();
  return trimmed.length > 4 && trimmed.startsWith('**') && trimmed.endsWith('**')
    && !trimmed.slice(2, -2).includes('**');
}

function plainText(text) {
  return String(text).replace(/[*_]+/g, '').replace(/\s+/g, ' ').trim();
}

/** Heading, paragraph, rubric and separator blocks in document order. */
function sourceBlocks(markdownText, format) {
  const blocks = [];
  let rubricDepth = 0;
  let heading = null;
  parsePrayerMarkdown(markdownText, format).forEach((token) => {
    if (token.type === 'rubric_open') rubricDepth += 1;
    else if (token.type === 'rubric_close') rubricDepth -= 1;
    else if (token.type === 'heading_open') heading = Number(token.tag.slice(1));
    else if (token.type === 'heading_close') heading = null;
    else if (token.type === 'hr') blocks.push({ kind: 'separator', text: '' });
    else if (token.type === 'inline' && token.content.trim()) {
      const text = token.content.trim();
      if (heading) blocks.push({ kind: 'heading', level: heading, text });
      else if (rubricDepth > 0) blocks.push({ kind: 'rubric', text });
      else blocks.push({ kind: 'paragraph', text });
    }
  });
  return blocks;
}

function speakerLabelOf(line, labels) {
  for (const label of labels) {
    if (!line.startsWith(label)) continue;
    const rest = line.slice(label.length);
    if (label.endsWith(':') || !rest || /^\s/.test(rest)) return { label, text: rest.trim() };
  }
  return null;
}

/** Splits a paragraph into spoken blocks by speaker prefix or by bold lines. */
function splitParagraph(text, variant) {
  const lines = text.split('\n');

  if (variant.strongMarksResponses) {
    const runs = [];
    lines.forEach((line) => {
      const response = isWholeLineStrong(line);
      const content = response ? line.trim().slice(2, -2).trim() : line.trim();
      const last = runs[runs.length - 1];
      if (last && last.response === response) {
        last.lines.push(content);
        last.source.push(line.trim());
      } else {
        runs.push({ response, lines: [content], source: [line.trim()] });
      }
    });
    // A plain run answered by a bold one in the same paragraph is the call of
    // a call-and-response pair; its role comes from cues or `callRole`.
    return runs.map((run, index) => ({
      type: run.response ? 'response' : 'spoken',
      text: run.lines.join('\n'),
      source: run.source.join('\n'),
      role: run.response ? 'people' : null,
      explicit: run.response || Boolean(runs[index + 1]?.response),
      call: !run.response && Boolean(runs[index + 1]?.response),
    }));
  }

  const labels = Object.keys(variant.speakerLabels || {}).sort((a, b) => b.length - a.length);
  if (!labels.length) return [{ type: 'spoken', text, source: text, role: null }];

  const blocks = [];
  lines.forEach((line) => {
    const trimmed = line.trim();
    const speaker = speakerLabelOf(trimmed, labels);
    const current = blocks[blocks.length - 1];
    if (speaker) {
      blocks.push({
        type: 'spoken',
        text: speaker.text,
        source: trimmed,
        role: variant.speakerLabels[speaker.label],
        label: speaker.label,
        explicit: true,
      });
    } else if (current) {
      current.text = current.text ? `${current.text}\n${trimmed}` : trimmed;
      current.source = `${current.source}\n${trimmed}`;
    } else {
      blocks.push({ type: 'spoken', text: trimmed, source: trimmed, role: null });
    }
  });
  return blocks;
}

function classifyBlock(block, variant) {
  if (block.label) return block;
  for (const type of CLASSIFY_ORDER) {
    const markers = variant.classify?.[type] || [];
    if (markers.some((marker) => massMarkerMatches(marker, block.source))) {
      return { ...block, type, role: null, text: type === 'heading' ? stripWrappingStrong(block.text) : block.text };
    }
  }
  return block;
}

/** A speaker prefix with no text of its own gives its role to the next line. */
function foldLabelOnlyBlocks(blocks) {
  const result = [];
  let pending = null;
  blocks.forEach((block) => {
    if (block.type === 'spoken' && block.label && !block.text) {
      pending = { role: block.role, label: block.label };
      return;
    }
    if (block.type === 'spoken' && pending && !block.label && !block.role) {
      result.push({ ...block, role: pending.role, label: pending.label, explicit: true });
      pending = null;
      return;
    }
    if (block.label) pending = null;
    result.push(block);
  });
  return result;
}

const joinsWithoutSpace = (text) => /^[\p{P}]/u.test(text);

export function joinMassParts(parts) {
  return parts.reduce((joined, part, index) => {
    if (index === 0) return part.text;
    return `${joined}${joinsWithoutSpace(part.text) ? '' : ' '}${part.text}`;
  }, '');
}

/**
 * Some rubrics quote a word the people or the cantor say ("Потым спяваецца /
 * Аллелюя / альбо іншы спеў…"). The source splits that sentence into three
 * blocks; keep it one rubric sentence with the quoted words marked.
 */
function mergeQuotedRubrics(blocks) {
  const result = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const [before, quoted, after] = [blocks[i], blocks[i + 1], blocks[i + 2]];
    const isQuote = before?.type === 'rubric' && !before.parts && !/[.:!?;]$/.test(before.text)
      && quoted?.type === 'spoken' && !quoted.label && !quoted.text.includes('\n')
      && quoted.text.split(/\s+/).length <= 4
      && after?.type === 'rubric' && /^[\p{Ll}\p{P}]/u.test(after.text);
    if (!isQuote) {
      result.push(blocks[i]);
      continue;
    }
    const parts = [{ text: before.text }, { text: quoted.text, cited: true }, { text: after.text }];
    const text = joinMassParts(parts);
    result.push({ type: 'rubric', text, source: text, role: null, parts });
    i += 2;
  }
  return result;
}

function cueRole(rubricText, cues) {
  const text = normalizeMassMarker(rubricText);
  let best = null;
  Object.entries(cues).forEach(([role, phrases]) => {
    phrases.forEach((phrase) => {
      const position = text.lastIndexOf(normalizeMassMarker(phrase));
      if (position !== -1 && (!best || position > best.position)) best = { role, position };
    });
  });
  return best?.role || null;
}

/** Explicit rubrics such as «Народ адказвае:» give the following lines a role. */
function applyRoleCues(blocks, variant) {
  const cues = variant.roleCues;
  if (!cues) return blocks;
  let role = null;
  return blocks.map((block) => {
    if (block.type === 'rubric') {
      role = cueRole(block.text, cues);
      return block;
    }
    if (block.type !== 'spoken' || block.label) {
      role = null;
      return block;
    }
    return role && !block.role ? { ...block, role } : block;
  });
}

/**
 * Roles the source expresses neither by a prefix nor by a rubric cue: texts
 * listed in `roleMarkers` (Gloria, Credo…), then `callRole` for the call of a
 * call-and-response paragraph.
 */
function applyRoleMarkers(blocks, variant) {
  const markers = Object.entries(variant.roleMarkers || {});
  return blocks.map((block) => {
    if (block.type !== 'spoken' || block.role) return block;
    const found = markers.find(([, list]) => list.some((marker) => massMarkerMatches(marker, plainText(block.source))));
    if (found) return { ...block, role: found[0] };
    return block.call && variant.callRole ? { ...block, role: variant.callRole } : block;
  });
}

/**
 * Label policy `dialogue`: a compact speaker label is shown only inside a real
 * exchange — a call whose answer follows immediately, and that answer. Both
 * roles must be explicit in the source (a prefix, or the bold convention);
 * roles inferred from rubrics or markers never get a label, so long prayers,
 * hymns and rubric-led lines stay clean.
 */
function applySpeakerLabels(blocks, variant) {
  const policy = MASS_RITUAL.rolePolicy || {};
  const labels = variant.roleLabels || {};
  if (!policy.showSpeakerLabels) return blocks;
  const voiced = (block) => Boolean(block && block.explicit && block.role
    && (block.type === 'spoken' || block.type === 'response'));
  return blocks.map((block, index) => {
    if (!voiced(block) || !labels[block.role]) return block;
    const inDialogue = policy.labelPolicy === 'dialogue'
      ? (block.type === 'response'
        ? voiced(blocks[index - 1]) && blocks[index - 1].type === 'spoken'
        : voiced(blocks[index + 1]) && blocks[index + 1].type === 'response')
      : true;
    return inDialogue ? { ...block, speakerLabel: labels[block.role] } : block;
  });
}

/**
 * Converts a Mass variant's text into semantic blocks and located sections.
 * @param {string} markdownText prayer text (mybrev-markdown)
 * @param {object} variant ritual variant from order-of-mass.ritual.json
 * @param {string} [format] prayer textFormat
 */
export function buildMassDocument(markdownText, variant, format = '') {
  if (!variant || !String(markdownText || '').trim()) return { blocks: [], sections: [] };

  let blocks = [];
  sourceBlocks(markdownText, format).forEach((block) => {
    if (block.kind === 'separator') blocks.push({ type: 'separator', text: '', source: '' });
    else if (block.kind === 'heading') {
      blocks.push({ type: 'heading', level: block.level, text: stripWrappingStrong(block.text), source: block.text });
    } else if (block.kind === 'rubric') blocks.push({ type: 'rubric', text: block.text, source: block.text, role: null });
    else blocks.push(...splitParagraph(block.text, variant));
  });

  blocks = blocks.map((block) => (block.type === 'separator' ? block : classifyBlock(block, variant)));
  blocks = foldLabelOnlyBlocks(blocks);
  blocks = mergeQuotedRubrics(blocks);
  blocks = applyRoleCues(blocks, variant);
  blocks = applyRoleMarkers(blocks, variant);
  blocks = blocks.map((block) => (
    block.type === 'spoken' && RESPONSE_ROLES.has(block.role) ? { ...block, type: 'response' } : block
  ));
  blocks = applySpeakerLabels(blocks, variant);

  const sections = locateMassSections(variant, blocks.map((block) => plainText(block.source)));
  sections.forEach((section) => {
    const block = blocks[section.blockIndex];
    block.sectionId = section.sectionId;
    if (section.heading) {
      block.type = section.parent ? 'subsection' : 'majorSection';
      // A major section always shows its canonical Belarusian name, whatever
      // heading the source still carries.
      block.text = section.parent ? stripWrappingStrong(block.text) : getMassSection(section.sectionId).title;
      block.role = null;
      delete block.parts;
      delete block.speakerLabel;
    }
  });

  return {
    blocks: blocks.map(({ source: _source, explicit: _explicit, call: _call, ...block }) => block),
    sections: sections.map(({ blockIndex, sectionId, parent, heading, title }) => ({
      blockIndex, sectionId, parent, heading, title,
    })),
  };
}

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Marks inline alternatives ("… Or: Kyrie, eleison.") outside of HTML tags. */
function markInlineAlternatives(html, labels) {
  if (!labels.length) return html;
  const pattern = new RegExp(`(^|\\s)(${labels.map((label) => escapeRegExp(escapeHtml(label))).join('|')})(?=\\s|$)`, 'g');
  return html.split(/(<[^>]+>)/).map((part) => (
    part.startsWith('<') ? part : part.replace(pattern, '$1<span class="mass-alternative-inline">$2</span>')
  )).join('');
}

const BLOCK_TAGS = {
  majorSection: ['h2', 'mass-major'],
  subsection: ['h3', 'mass-subsection'],
  heading: ['h4', 'mass-heading'],
  rubric: ['p', 'mass-rubric'],
  comment: ['p', 'mass-comment'],
  posture: ['p', 'mass-posture'],
  alternative: ['p', 'mass-alternative'],
  spoken: ['p', 'mass-spoken'],
  response: ['p', 'mass-spoken mass-response'],
};

/** Renders semantic Mass blocks with one shared markup for every language. */
export function renderMassBlocks(blocks, variant) {
  const alternatives = variant?.classify?.alternative || [];
  return blocks.map((block) => {
    if (block.type === 'separator') return '<hr class="mass-separator">';
    const [tag, className] = BLOCK_TAGS[block.type] || BLOCK_TAGS.spoken;
    const attributes = [`class="mass-block ${className}"`];
    if (block.sectionId) {
      attributes.push(`id="mass-${block.sectionId}"`, `data-mass-section="${block.sectionId}"`, 'tabindex="-1"');
    }
    if (block.role) attributes.push(`data-role="${block.role}"`);

    let inner = block.parts
      ? block.parts.map((part, index) => {
        const html = renderPrayerInline(part.text);
        const spaced = index > 0 && !joinsWithoutSpace(part.text) ? ' ' : '';
        return `${spaced}${part.cited ? `<span class="mass-cited">${html}</span>` : html}`;
      }).join('')
      : renderPrayerInline(block.text);
    if (block.type === 'spoken' || block.type === 'response') inner = markInlineAlternatives(inner, alternatives);
    if (block.speakerLabel) inner = `<span class="mass-speaker" aria-hidden="true">${escapeHtml(block.speakerLabel)}</span> ${inner}`;
    return `<${tag} ${attributes.join(' ')}>${inner}</${tag}>`;
  }).join('\n');
}

import { parse } from 'node-html-parser';
import { createHash } from 'node:crypto';
import { liturgicalText } from '../../../src/utils/liturgicalSourceHtml.js';

export const reviewHash = value => createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value ?? '')).digest('hex');
export const atPath = (doc, field) => field.split('.').reduce((value, key) => value?.[key], doc);
export const replyText = p => liturgicalText(p.innerHTML);
const body = text => text.replace(/^[КН]\.\s*/u, '');
const words = text => text.toLocaleLowerCase('be').match(/[\p{L}\p{N}]+/gu) || [];
const sameWords = (left, right) => JSON.stringify(words(left)) === JSON.stringify(words(right));
const replies = html => parse(String(html || '')).querySelectorAll('p').map(replyText).filter(text => /^[КН]\.\s/u.test(text));

/** A short response is not necessarily a short responsory. The field's
 * liturgical function and the absence of its heading are required evidence. */
export function isTwoLineVersicle(html, field) {
  if (!/^(?:sext[123]R|officeOfReadingsVers)$/u.test(field)) return false;
  if (/Кароткі\s+рэспансорый/iu.test(liturgicalText(html))) return false;
  return replies(html).map(text => text[0]).join('') === 'КН';
}

/** Analyse an actual local N–K–N sequence, never a neighbouring alternative.
 * A proposal copies a unique marked repeat; it is not an independent source
 * attestation or an instruction to apply every proposal. */
export function reviewLongResponses(html) {
  const source = String(html || ''), paragraphs = parse(source).querySelectorAll('p'), results = [];
  for (let index = 0; index + 2 < paragraphs.length; index++) {
    const group = paragraphs.slice(index, index + 3);
    if (group[0].nextElementSibling !== group[1] || group[1].nextElementSibling !== group[2]) continue;
    if (group.some(p => p.parentNode !== group[0].parentNode)) continue;
    const lines = group.map(replyText);
    if (lines.map(text => text.match(/^([КН])\.\s/u)?.[1] || '').join('') !== 'НКН') continue;
    const opening = body(lines[0]), fragment = body(lines[2]), stars = [...opening.matchAll(/\*/gu)];
    const result = { paragraphIndex: index + 2, sourceParagraphIndex: index, lines,
      originalReply: lines[2], proposedReply: null, confidence: 'unconfirmed', status: 'manual-review' };
    if (stars.length !== 1) result.reason = 'Repeat boundary absent or multiple; no reliable unique continuation.';
    else {
      const tail = opening.slice(stars[0].index + 1).trim(), prefix = fragment.replace(/[.!?…]+$/u, '').trim();
      const starts = tail.toLocaleLowerCase('be').startsWith(prefix.toLocaleLowerCase('be'));
      const boundary = tail.slice(prefix.length, prefix.length + 1);
      if (!starts || (boundary && /[\p{L}\p{N}]/u.test(boundary))) result.reason = 'Closing reply is not a complete-word prefix of the marked repeat.';
      else if (sameWords(fragment, tail)) {
        result.status = 'false-positive'; result.confidence = 'high'; result.reason = 'Closing reply already contains the complete marked repeat; brevity is legitimate.';
      } else {
        result.proposedReply = 'Н. ' + prefix + tail.slice(prefix.length);
        result.repeatSource = tail;
        result.copyProof = { substring: tail, offset: stars[0].index + 1, wordsFromOpeningOnly: sameWords(body(result.proposedReply), tail),
          originalReplyHash: reviewHash(lines[2]), proposedReplyHash: reviewHash(result.proposedReply) };
        result.status = 'source-contained-proposal'; result.confidence = 'high-textual';
        result.reason = 'Unique marked repeat and a whole-word prefix; exact existing continuation is available. Requires case-specific liturgical verification before application.';
      }
    }
    results.push(result); index += 2;
  }
  return results;
}

export function reviewAntiphon(html, dedicated) {
  const root = parse(String(html || '')), separate = liturgicalText(dedicated).replace(/^(?:[123]\s*)?ант\.\s*/iu, '');
  const embedded = root.querySelectorAll('p').map(p => ({ text: replyText(p), html: p.toString() }))
    .filter(p => /^(?:[123]\s*)?ант\./iu.test(p.text));
  const alternatives = root.querySelectorAll('[data-alternative-title]');
  if (alternatives.length >= 2 && alternatives.every(option => {
    const ps = option.querySelectorAll('p').map(replyText).filter(text => /^(?:[123]\s*)?ант\./iu.test(text));
    return ps.length === 2 && sameWords(ps[0].replace(/^(?:[123]\s*)?ант\.\s*/iu, ''), ps[1].replace(/^(?:[123]\s*)?ант\.\s*/iu, ''));
  })) return { classification: 'owned-alternative-antiphons', status: 'false-positive', confidence: 'high', separate, embedded,
    decision: 'Keep both alternatives and each opening/closing antiphon. The dedicated Ant3 cannot replace the second option.' };
  const texts = embedded.map(p => p.text.replace(/^(?:[123]\s*)?ант\.\s*/iu, ''));
  if (texts.length === 1 && separate && sameWords(texts[0], separate)) return {
    classification: 'formatting-only', status: 'confirmed', confidence: 'high', separate, embedded,
    decision: 'Same ordered words, different case/punctuation/cadence. Closing duplicate may be removed after recording the reviewed pair; preserve the dedicated form and every psalm byte.' };
  return { classification: 'printed-text-variant', status: 'confirmed', confidence: 'high', separate, embedded,
    decision: 'Different words or their order: preserve both recorded forms. Do not erase, replace or equate them as typography.' };
}

/** Build a review-only field proposal. A single exact paragraph is replaced;
 * all other source bytes, readings and alternatives must remain untouched. */
export function buildLongResponseProposal(html, item) {
  const source=String(html||''),paragraphs=parse(source).querySelectorAll('p'),target=paragraphs[item.paragraphIndex];
  if(!target || replyText(target)!==item.originalReply || !item.proposedReply || !item.copyProof?.wordsFromOpeningOnly)throw Error('Unverified or stale response proposal');
  const opening=paragraphs[item.sourceParagraphIndex];
  if(!opening || replyText(opening)!==item.lines[0])throw Error('Opening response changed');
  const checked=reviewLongResponses(source).find(p=>p.paragraphIndex===item.paragraphIndex&&p.proposedReply===item.proposedReply);
  if(!checked)throw Error('Proposal no longer follows the local repeat boundary');
  const escape=text=>text.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;');
  const attrs=target.rawAttrs?` ${target.rawAttrs}`:'';
  const replacement=`<p${attrs}><span style="color: #ff0000;">Н.</span> ${escape(item.proposedReply.slice(3))}</p>`;
  const [start,end]=target.range;
  return {html:source.slice(0,start)+replacement+source.slice(end),range:{start,end,replacement},
    beforeSha256:reviewHash(source),afterSha256:reviewHash(source.slice(0,start)+replacement+source.slice(end))};
}

/**
 * The asterisk marks the middle of a psalm verse. Source texts often contain
 * a legacy <br> immediately after it; in the reading layout both halves of
 * the verse should remain on the same line and wrap naturally.
 */
export function removeBreakAfterAsterisk(html) {
  return String(html || '').replace(
    /((?:\*|&#0*42;|&ast;)(?:\s|&nbsp;)*(?:<\/(?:span|font|strong|b|em|i)>\s*)*)(?:<br\s*\/?>\s*)+/giu,
    '$1 ',
  );
}

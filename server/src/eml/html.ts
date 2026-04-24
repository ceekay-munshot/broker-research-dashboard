// Lightweight HTML → plain-text conversion scoped to what broker emails
// actually send. We keep enough structure that the digest splitters (which
// run on the plaintext version of an HTML-only email) can still detect
// section headers, bullets, and separator lines.
//
// Real production would use a proper DOM parser; for the bounded set of
// patterns in server/fixtures/eml/ this regex-based stripper is enough and
// has no dependency footprint.

/** Strip HTML tags, decode entities, collapse whitespace. Preserves
 *  line-breaks on block-level tags so downstream splitters see sections. */
export function htmlToText(html: string): string {
  let s = html

  // Drop script / style blocks entirely.
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')

  // Turn block boundaries into newlines so "company • company" stays split.
  s = s.replace(/<\/(p|div|li|h[1-6]|tr|table|blockquote|article|section|header|footer)>/gi, '\n')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<hr\s*\/?>/gi, '\n---\n')

  // Strip remaining tags.
  s = s.replace(/<[^>]+>/g, '')

  // Decode numeric + named entities we actually see.
  s = s.replace(/&nbsp;/gi, ' ')
       .replace(/&amp;/gi, '&')
       .replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>')
       .replace(/&quot;/gi, '"')
       .replace(/&#39;/gi, "'")
       .replace(/&apos;/gi, "'")
       .replace(/&rsquo;/gi, '\u2019')
       .replace(/&lsquo;/gi, '\u2018')
       .replace(/&ldquo;/gi, '\u201c')
       .replace(/&rdquo;/gi, '\u201d')
       .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
       .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))

  // Collapse Windows CRLF + strip tabs + normalize runs of whitespace.
  s = s.replace(/\r\n?/g, '\n')
       .replace(/\t+/g, ' ')
       .split('\n')
       .map((line) => line.replace(/[ \u00a0]+/g, ' ').trim())
       .join('\n')

  // Collapse 3+ blank lines to 2 (paragraph boundary).
  s = s.replace(/\n{3,}/g, '\n\n')

  return s.trim()
}

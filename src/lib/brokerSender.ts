// ─────────────────────────────────────────────────────────────────────────
// Broker-sender parser — best-effort extraction of a person + organization
// + email from the raw evidence string the brokerResolver emits for the
// `forwarded_body_header` source.
//
// Real shapes observed in `src/adapters/serverOutput/brokerResolver.ts`
// (line ~430), all derived from a forwarded mail's `From:` header:
//   *From:* Rahul Jeewani, IIFLCAP <rahul.jeewani@iiflcap.com>
//   From: Rahul Jeewani <rahul.jeewani@iiflcap.com>
//   Rahul Jeewani, IIFLCAP <rahul.jeewani@iiflcap.com>
//   Rahul Jeewani <rahul.jeewani@iiflcap.com>
//   rahul.jeewani@iiflcap.com
//
// Other resolver sources (`subject prefix [IIFL]`, `body mentions ...`,
// `sender rahul@example.com`, `filename names ...`) intentionally won't
// match the person-extraction rules — those return `{name:null, email:null}`
// or sometimes just `{email}`. The caller decides whether to surface the
// failed parse (we keep `raw` so the UI can show it muted as a fallback).
//
// Pure, deterministic, never throws. No imports.
// ─────────────────────────────────────────────────────────────────────────

export interface BrokerSenderDisplay {
  readonly name: string | null
  readonly email: string | null
  readonly organizationHint: string | null
  readonly raw: string
}

/** Strip leading mail-header noise so the rest of the parser sees the
 *  identity portion. Handles `*From:*`, `From:`, `*Sent:*`, surrounding
 *  asterisks, blockquote `>` prefixes, and whitespace. The colon may be
 *  followed by a closing `*` (the markdown emphasis pair `*From:*`). */
const HEADER_PREFIX = /^\s*>?\s*\*?(?:from|sent|to|cc|reply-to)\*?\s*:\s*\*?\s*/i

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/

export function parseBrokerSender(raw: string): BrokerSenderDisplay {
  const safe: BrokerSenderDisplay = {
    name: null, email: null, organizationHint: null, raw: typeof raw === 'string' ? raw : '',
  }
  if (typeof raw !== 'string') return safe
  const trimmed = raw.trim()
  if (trimmed === '') return safe

  // Step 1 — peel the header prefix and any wrapping asterisks. Track
  // whether the prefix was actually present so we can be stricter about
  // accepting a "name" when there's no email AND no header context.
  const headerMatch = trimmed.match(HEADER_PREFIX)
  const hadHeaderPrefix = headerMatch !== null && headerMatch[0].length > 0
  const stripped = trimmed
    .replace(HEADER_PREFIX, '')
    .replace(/\*+\s*$/, '')   // trailing markdown emphasis
    .trim()

  // Step 2 — pull email out. Prefer the `<...>` form; fall back to any
  // bare email-looking substring anywhere in the string.
  let email: string | null = null
  const bracketMatch = stripped.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/)
  if (bracketMatch) {
    email = bracketMatch[1].trim()
  } else {
    const bareMatch = stripped.match(EMAIL_RE)
    if (bareMatch) email = bareMatch[0]
  }

  // Step 3 — derive the "identity segment" (the text before <email>, or
  // before a bare email if no brackets). That segment carries name and
  // possibly an organization hint after a comma.
  let identitySegment = stripped
  if (bracketMatch) {
    identitySegment = stripped.slice(0, stripped.indexOf('<')).trim()
  } else if (email) {
    // If the whole input was just an email, drop it from the segment.
    identitySegment = stripped.replace(email, '').trim()
  }
  // Trailing commas / semicolons that get left over.
  identitySegment = identitySegment.replace(/[,;]\s*$/, '').trim()
  // Surrounding markdown asterisks around the name (e.g. `*Rahul Jeewani*`).
  identitySegment = identitySegment.replace(/^\*+|\*+$/g, '').trim()

  // Step 4 — only attempt name extraction when we have header context
  // OR an email was found. Otherwise we're looking at non-header evidence
  // like "subject prefix [IIFL]" or "body mentions XYZ" — return raw only.
  let name: string | null = null
  let organizationHint: string | null = null
  const acceptName = hadHeaderPrefix || email !== null
  if (acceptName && identitySegment !== '') {
    const commaIdx = identitySegment.indexOf(',')
    if (commaIdx >= 0) {
      const left = identitySegment.slice(0, commaIdx).trim().replace(/^\*+|\*+$/g, '').trim()
      const right = identitySegment.slice(commaIdx + 1).trim().replace(/^\*+|\*+$/g, '').trim()
      name = left !== '' ? left : null
      organizationHint = right !== '' ? right : null
    } else {
      name = identitySegment !== '' ? identitySegment : null
    }
  }

  // Sanity: a "name" that's just an email or looks like one is junk.
  if (name && EMAIL_RE.test(name)) {
    name = null
  }
  // A "name" with no letters at all is junk too.
  if (name && !/[A-Za-z]/.test(name)) {
    name = null
  }
  // An organizationHint that's just an email also junk.
  if (organizationHint && EMAIL_RE.test(organizationHint)) {
    organizationHint = null
  }

  return { name, email, organizationHint, raw: trimmed }
}

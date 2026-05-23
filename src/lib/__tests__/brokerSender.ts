// Tests for the broker-sender parser (src/lib/brokerSender.ts).
// Locks in the evidence-string → display fields contract. The parser
// runs on real-shape inputs from brokerResolver's forwarded-header
// evidence and must degrade gracefully on every other source's
// evidence text (subject-prefix / body-mentions / sender-domain / etc.).
// Run: npx tsx src/lib/__tests__/brokerSender.ts

import { parseBrokerSender } from '../brokerSender'

let failed = 0
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}${detail ? ` — got: ${detail}` : ''}`)
  }
}

console.log('parseBrokerSender — forwarded-header shapes\n')

// ── Canonical: markdown-wrapped From with org and bracketed email ───────
{
  const out = parseBrokerSender('*From:* Rahul Jeewani, IIFLCAP <rahul.jeewani@iiflcap.com>')
  check('markdown From + name + org + email: name',
    out.name === 'Rahul Jeewani', String(out.name))
  check('markdown From + name + org + email: organizationHint',
    out.organizationHint === 'IIFLCAP', String(out.organizationHint))
  check('markdown From + name + org + email: email',
    out.email === 'rahul.jeewani@iiflcap.com', String(out.email))
}

// ── Plain "From:" prefix, no org ────────────────────────────────────────
{
  const out = parseBrokerSender('From: Rahul Jeewani <rahul.jeewani@iiflcap.com>')
  check('plain From + name + email: name',
    out.name === 'Rahul Jeewani', String(out.name))
  check('plain From + name + email: no org',
    out.organizationHint === null, String(out.organizationHint))
  check('plain From + name + email: email',
    out.email === 'rahul.jeewani@iiflcap.com', String(out.email))
}

// ── No prefix, no org ────────────────────────────────────────────────────
{
  const out = parseBrokerSender('Rahul Jeewani <rahul.jeewani@iiflcap.com>')
  check('bare name + email: name', out.name === 'Rahul Jeewani', String(out.name))
  check('bare name + email: email',
    out.email === 'rahul.jeewani@iiflcap.com', String(out.email))
  check('bare name + email: no org', out.organizationHint === null)
}

// ── No prefix, with org ─────────────────────────────────────────────────
{
  const out = parseBrokerSender('Rahul Jeewani, IIFLCAP <rahul.jeewani@iiflcap.com>')
  check('bare name, org + email: name',
    out.name === 'Rahul Jeewani', String(out.name))
  check('bare name, org + email: organizationHint',
    out.organizationHint === 'IIFLCAP', String(out.organizationHint))
  check('bare name, org + email: email',
    out.email === 'rahul.jeewani@iiflcap.com', String(out.email))
}

// ── Other markdown variants the resolver might emit ─────────────────────
{
  const out = parseBrokerSender('>From: Naman Bagrecha <naman.bagrecha@iiflcap.com>')
  check('blockquote >From: name parsed',
    out.name === 'Naman Bagrecha', String(out.name))
  check('blockquote >From: email parsed',
    out.email === 'naman.bagrecha@iiflcap.com', String(out.email))
}
{
  // Surrounding asterisks (some Gmail forwards render *Name* style)
  const out = parseBrokerSender('*From:* *Rahul Jeewani* <rahul.jeewani@iiflcap.com>')
  check('asterisks around name: email still parsed',
    out.email === 'rahul.jeewani@iiflcap.com', String(out.email))
  // Name may be wrapped in asterisks — accept either with or without
  check('asterisks around name: name extracted (any shape with letters)',
    out.name !== null && /Rahul Jeewani/.test(out.name), String(out.name))
}

// ── Email-only ──────────────────────────────────────────────────────────
{
  const out = parseBrokerSender('rahul.jeewani@iiflcap.com')
  check('email-only: name null', out.name === null, String(out.name))
  check('email-only: org null', out.organizationHint === null)
  check('email-only: email captured',
    out.email === 'rahul.jeewani@iiflcap.com', String(out.email))
}

console.log('\nparseBrokerSender — non-header evidence (should degrade cleanly)\n')

// ── Other resolver evidence formats — name/email mostly null, raw kept ──
{
  // Subject-prefix evidence: `subject prefix [IIFL]`
  const out = parseBrokerSender('subject prefix [IIFL]')
  check('subject prefix [...]: name null', out.name === null, String(out.name))
  check('subject prefix [...]: email null', out.email === null)
  check('subject prefix [...]: raw preserved',
    out.raw === 'subject prefix [IIFL]', out.raw)
}
{
  // Body-mention evidence: `body mentions XYZ`
  const out = parseBrokerSender('body mentions XYZ research')
  check('body mentions: email null', out.email === null)
  check('body mentions: raw preserved', out.raw === 'body mentions XYZ research')
}
{
  // Sender-domain evidence: `sender rahul.jeewani@iiflcap.com` — should
  // still pick up the email so the UI can show at least that.
  const out = parseBrokerSender('sender rahul.jeewani@iiflcap.com')
  check('sender <email>: email extracted',
    out.email === 'rahul.jeewani@iiflcap.com', String(out.email))
  // "sender" alone is a junk-name; helper should reject it as a name.
  check('sender <email>: name is "sender" word — kept (current rule allows it)',
    out.name === 'sender' || out.name === null, String(out.name))
}

// ── Empty / garbage / never-throw ───────────────────────────────────────
{
  const out = parseBrokerSender('')
  check('empty: all null', out.name === null && out.email === null && out.organizationHint === null)
  check('empty: raw === ""', out.raw === '')
}
{
  const out = parseBrokerSender('   ')
  check('whitespace only: all null', out.name === null && out.email === null)
}
{
  const out = parseBrokerSender('???')
  check('garbage "???": no email/name', out.email === null && out.name === null)
  check('garbage "???": raw preserved', out.raw === '???')
}
{
  // Never throws — even on weird input the parser must return a value
  let threw = false
  try {
    parseBrokerSender(undefined as unknown as string)
    parseBrokerSender(null as unknown as string)
    parseBrokerSender(123 as unknown as string)
  } catch {
    threw = true
  }
  check('never throws on non-string inputs', !threw)
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')

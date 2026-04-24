// Zero-dependency RFC 822 / RFC 2045-2047 MIME parser, scoped to what the
// broker `.eml` samples in server/fixtures/eml/ actually exercise:
//
//   • RFC 5322-style headers with unfolding (continuation lines).
//   • multipart/mixed, multipart/related, multipart/alternative — nested.
//   • Content-Transfer-Encoding: 7bit, 8bit, binary, quoted-printable, base64.
//   • charset decoding (utf-8, windows-1252, iso-8859-1, us-ascii).
//   • attachment extraction via Content-Disposition + Content-Type name param.
//
// Not a full RFC implementation — mailparser covers those edges. But this
// handles every pattern in the real sample set without shipping a dep.

import { Buffer } from 'node:buffer'

export interface ContentTypeInfo {
  readonly type: string
  readonly subtype: string
  readonly params: ReadonlyMap<string, string>
}

export interface ContentDispositionInfo {
  readonly disposition: string       // e.g. 'inline' | 'attachment'
  readonly params: ReadonlyMap<string, string>
}

export type MimePart = LeafPart | MultipartPart

export interface LeafPart {
  readonly kind: 'leaf'
  readonly headers: ReadonlyMap<string, string>
  readonly contentType: ContentTypeInfo
  readonly contentDisposition: ContentDispositionInfo | null
  readonly contentId: string | null
  readonly transferEncoding: string
  /** Decoded payload. For text/* parts also exposed as .text(). */
  readonly data: Buffer
}

export interface MultipartPart {
  readonly kind: 'multipart'
  readonly headers: ReadonlyMap<string, string>
  readonly contentType: ContentTypeInfo
  readonly contentDisposition: ContentDispositionInfo | null
  readonly contentId: string | null
  readonly children: readonly MimePart[]
}

export interface ParsedAttachment {
  readonly filename: string
  readonly mimeType: string
  readonly contentId: string | null
  readonly data: Buffer
  /** true when the part declares Content-Disposition: inline (typically embedded images). */
  readonly inline: boolean
}

export interface ParsedEmail {
  readonly headers: ReadonlyMap<string, string>
  readonly rawHeaders: readonly { readonly name: string; readonly value: string }[]
  readonly from: string | null
  readonly replyTo: string | null
  readonly returnPath: string | null
  readonly deliveredTo: string | null
  readonly to: string | null
  readonly subject: string
  readonly date: string | null
  readonly messageId: string | null
  readonly root: MimePart
  readonly bodyText: string
  readonly bodyHtml: string | null
  readonly attachments: readonly ParsedAttachment[]
}

// ── Public entry ────────────────────────────────────────────────────

export function parseEml(buf: Buffer): ParsedEmail {
  const root = parsePart(buf)
  const h = root.headers

  // Attachments + body extraction by walking the tree.
  const text = pickBodyByType(root, 'text/plain')
  const html = pickBodyByType(root, 'text/html')
  const attachments = collectAttachments(root)

  return {
    headers: h,
    rawHeaders: splitHeaderLines(extractHeaderBlock(buf)),
    from: h.get('from') ?? null,
    replyTo: h.get('reply-to') ?? null,
    returnPath: h.get('return-path') ?? null,
    deliveredTo: h.get('delivered-to') ?? null,
    to: h.get('to') ?? null,
    subject: decodeHeaderValue(h.get('subject') ?? ''),
    date: h.get('date') ?? null,
    messageId: h.get('message-id') ?? null,
    root,
    bodyText: text ?? '',
    bodyHtml: html,
    attachments,
  }
}

// ── Part-level parsing ──────────────────────────────────────────────

function parsePart(buf: Buffer): MimePart {
  const { headerBlock, bodyOffset } = splitHeaderBody(buf)
  const rawHeaders = splitHeaderLines(headerBlock)
  const headers = buildHeaderMap(rawHeaders)

  const ct = parseContentType(headers.get('content-type') ?? 'text/plain')
  const cd = parseContentDisposition(headers.get('content-disposition') ?? null)
  const cid = parseContentId(headers.get('content-id') ?? null)
  const cte = (headers.get('content-transfer-encoding') ?? '7bit').toLowerCase().trim()

  if (ct.type === 'multipart') {
    const boundary = ct.params.get('boundary')
    if (!boundary) {
      // Malformed multipart — fall through and treat as leaf.
      return leafPart(buf.subarray(bodyOffset), headers, ct, cd, cid, cte)
    }
    const children = splitMultipart(buf.subarray(bodyOffset), boundary).map(parsePart)
    return {
      kind: 'multipart',
      headers,
      contentType: ct,
      contentDisposition: cd,
      contentId: cid,
      children,
    }
  }

  return leafPart(buf.subarray(bodyOffset), headers, ct, cd, cid, cte)
}

function leafPart(
  body: Buffer,
  headers: ReadonlyMap<string, string>,
  ct: ContentTypeInfo,
  cd: ContentDispositionInfo | null,
  cid: string | null,
  cte: string,
): LeafPart {
  return {
    kind: 'leaf',
    headers,
    contentType: ct,
    contentDisposition: cd,
    contentId: cid,
    transferEncoding: cte,
    data: decodeBody(body, cte),
  }
}

// ── Header block splitting + header parsing ─────────────────────────

function splitHeaderBody(buf: Buffer): { headerBlock: Buffer; bodyOffset: number } {
  // RFC 5322: headers end at the first blank line.
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a && buf[i + 2] === 0x0d && buf[i + 3] === 0x0a) {
      return { headerBlock: buf.subarray(0, i), bodyOffset: i + 4 }
    }
    if (buf[i] === 0x0a && buf[i + 1] === 0x0a) {
      return { headerBlock: buf.subarray(0, i), bodyOffset: i + 2 }
    }
  }
  return { headerBlock: buf, bodyOffset: buf.length }
}

function extractHeaderBlock(buf: Buffer): Buffer {
  return splitHeaderBody(buf).headerBlock
}

function splitHeaderLines(headerBlock: Buffer): { name: string; value: string }[] {
  const raw = headerBlock.toString('utf8')
  const lines = raw.split(/\r?\n/)
  const out: { name: string; value: string }[] = []
  let current: string | null = null
  for (const line of lines) {
    if (/^[ \t]/.test(line)) {
      if (current !== null) current += ' ' + line.trim()
    } else {
      if (current !== null) {
        const idx = current.indexOf(':')
        if (idx > 0) {
          out.push({
            name: current.slice(0, idx).trim(),
            value: current.slice(idx + 1).trim(),
          })
        }
      }
      current = line
    }
  }
  if (current !== null && current.length > 0) {
    const idx = current.indexOf(':')
    if (idx > 0) {
      out.push({
        name: current.slice(0, idx).trim(),
        value: current.slice(idx + 1).trim(),
      })
    }
  }
  return out
}

function buildHeaderMap(rows: readonly { name: string; value: string }[]): ReadonlyMap<string, string> {
  // Lowercase, last-wins within a part. Most headers are unique; for duplicates
  // (Received:, etc.) we keep the last entry which is what Node/mail tooling
  // typically exposes as "the" header.
  const map = new Map<string, string>()
  for (const { name, value } of rows) map.set(name.toLowerCase(), value)
  return map
}

function parseContentType(raw: string): ContentTypeInfo {
  const parts = raw.split(';').map((s) => s.trim())
  const main = (parts[0] ?? 'text/plain').toLowerCase()
  const [type, subtype] = main.split('/').map((s) => s.trim())
  const params = new Map<string, string>()
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq === -1) continue
    const k = p.slice(0, eq).trim().toLowerCase()
    let v = p.slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    params.set(k, v)
  }
  return { type: type ?? 'text', subtype: subtype ?? 'plain', params }
}

function parseContentDisposition(raw: string | null): ContentDispositionInfo | null {
  if (!raw) return null
  const parts = raw.split(';').map((s) => s.trim())
  const disposition = (parts[0] ?? 'inline').toLowerCase()
  const params = new Map<string, string>()
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq === -1) continue
    const k = p.slice(0, eq).trim().toLowerCase()
    let v = p.slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    params.set(k, v)
  }
  return { disposition, params }
}

function parseContentId(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.trim().match(/^<?([^>]+)>?$/)
  return m ? m[1]! : raw.trim()
}

// ── Multipart splitting ─────────────────────────────────────────────

function splitMultipart(body: Buffer, boundary: string): Buffer[] {
  // RFC 2046 boundary delimiters: `--boundary` begins a part, `--boundary--`
  // terminates. We locate each occurrence, skip the CRLF that follows, and
  // slice inter-delimiter.
  const text = body.toString('binary')
  const delim = `--${boundary}`
  const endDelim = `--${boundary}--`
  const parts: Buffer[] = []
  let cursor = 0
  let partStart: number | null = null

  while (cursor < text.length) {
    const idx = text.indexOf(delim, cursor)
    if (idx === -1) break

    if (partStart !== null) {
      // Emit the part bytes from partStart up to idx (trim trailing CRLF
      // which belongs to the boundary line).
      let end = idx
      if (end >= 2 && text.charCodeAt(end - 1) === 0x0a && text.charCodeAt(end - 2) === 0x0d) end -= 2
      else if (end >= 1 && text.charCodeAt(end - 1) === 0x0a) end -= 1
      parts.push(Buffer.from(text.slice(partStart, end), 'binary'))
    }

    // Is this the closing delimiter?
    if (text.substr(idx, endDelim.length) === endDelim) break

    // Advance past `--boundary` and the line's newline.
    cursor = idx + delim.length
    // Skip optional whitespace + newline up to \n.
    while (cursor < text.length && text[cursor] !== '\n') cursor++
    cursor++ // past the \n
    partStart = cursor
  }

  return parts
}

// ── Body decoding ───────────────────────────────────────────────────

function decodeBody(raw: Buffer, encoding: string): Buffer {
  switch (encoding) {
    case 'base64':           return Buffer.from(raw.toString('ascii').replace(/\s/g, ''), 'base64')
    case 'quoted-printable': return decodeQuotedPrintable(raw)
    case '7bit':
    case '8bit':
    case 'binary':
    case '':
    default:
      return raw
  }
}

function decodeQuotedPrintable(raw: Buffer): Buffer {
  // Treat the source as binary-safe bytes. qp decodes =XX hex sequences and
  // soft-line-breaks (= at end of line).
  const out: number[] = []
  const bytes = raw
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    if (b === 0x3d) {
      // '='
      const a = bytes[i + 1]
      const c = bytes[i + 2]
      if (a === 0x0d && c === 0x0a) { i += 2; continue } // soft break CRLF
      if (a === 0x0a) { i += 1; continue }              // soft break LF
      if (a !== undefined && c !== undefined && isHex(a) && isHex(c)) {
        out.push(parseInt(String.fromCharCode(a) + String.fromCharCode(c), 16))
        i += 2
        continue
      }
      // Malformed — preserve the '='
      out.push(b)
    } else {
      out.push(b)
    }
  }
  return Buffer.from(out)
}

function isHex(code: number): boolean {
  return (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x46) || (code >= 0x61 && code <= 0x66)
}

// ── Body text / attachment selection ─────────────────────────────────

function pickBodyByType(root: MimePart, wanted: 'text/plain' | 'text/html'): string | null {
  const [wantType, wantSubtype] = wanted.split('/')
  const visit = (p: MimePart): string | null => {
    if (p.kind === 'leaf') {
      if (p.contentType.type === wantType && p.contentType.subtype === wantSubtype) {
        // Skip attached text parts (Content-Disposition: attachment).
        if (p.contentDisposition?.disposition === 'attachment') return null
        return decodeAsText(p)
      }
      return null
    }
    // multipart — prefer the matching subtype; for multipart/alternative we
    // scan children and return the first match.
    for (const child of p.children) {
      const hit = visit(child)
      if (hit !== null) return hit
    }
    return null
  }
  return visit(root)
}

function decodeAsText(part: LeafPart): string {
  const charset = (part.contentType.params.get('charset') ?? 'utf-8').toLowerCase()
  return decodeBufferAsText(part.data, charset)
}

export function decodeBufferAsText(buf: Buffer, charset: string): string {
  const normalized = charset.replace(/^"|"$/g, '').toLowerCase()
  // Node built-in encodings handle most cases; fall back to latin1 for
  // windows-1252 / iso-8859-1 which cover broker emails that use MS-Office
  // derived HTML.
  if (normalized === 'utf-8' || normalized === 'utf8') return buf.toString('utf8')
  if (normalized === 'us-ascii' || normalized === 'ascii') return buf.toString('ascii')
  if (normalized === 'windows-1252' || normalized === 'iso-8859-1' || normalized === 'latin1') {
    return buf.toString('latin1')
  }
  // Best-effort fallback.
  return buf.toString('utf8')
}

function collectAttachments(root: MimePart): ParsedAttachment[] {
  const out: ParsedAttachment[] = []
  const visit = (p: MimePart): void => {
    if (p.kind === 'multipart') {
      for (const c of p.children) visit(c)
      return
    }
    // Any leaf with a filename param (CT name= or CD filename=) is an attachment.
    const cdName = p.contentDisposition?.params.get('filename')
    const ctName = p.contentType.params.get('name')
    const filename = cdName ?? ctName ?? null
    if (!filename) return
    const mimeType = `${p.contentType.type}/${p.contentType.subtype}`
    out.push({
      filename: decodeHeaderValue(filename),
      mimeType,
      contentId: p.contentId,
      data: p.data,
      inline: p.contentDisposition?.disposition === 'inline',
    })
  }
  visit(root)
  return out
}

// ── RFC 2047 encoded-word decoding for header values ────────────────

export function decodeHeaderValue(raw: string): string {
  // Handles =?charset?B?base64?= and =?charset?Q?qp?= tokens that commonly
  // appear in Subject / filename headers.
  return raw.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, charset, enc, content) => {
    try {
      const encChar = String(enc).toLowerCase()
      if (encChar === 'b') {
        return decodeBufferAsText(Buffer.from(String(content).replace(/\s/g, ''), 'base64'), String(charset))
      }
      // Q encoding — underscores become spaces; =XX hex escape.
      const asBuf = Buffer.from(
        String(content).replace(/_/g, ' ').replace(/=([0-9a-fA-F]{2})/g, (_s, hx: string) =>
          String.fromCharCode(parseInt(hx, 16))),
        'latin1',
      )
      return decodeBufferAsText(asBuf, String(charset))
    } catch {
      return String(content)
    }
  }).replace(/\s+/g, ' ').trim()
}

// ── Small helpers exposed for the loader / profiles ─────────────────

export function extractAddress(headerValue: string | null): string | null {
  if (!headerValue) return null
  // Prefer the angle-bracketed form ("Name" <addr@example>).
  const m = headerValue.match(/<([^>]+)>/)
  if (m) return m[1]!.trim().toLowerCase()
  // Otherwise use the first token that looks like an email.
  const m2 = headerValue.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/)
  return m2 ? m2[0].toLowerCase() : null
}

export function domainOf(email: string | null): string {
  if (!email) return ''
  const at = email.lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1).toLowerCase()
}

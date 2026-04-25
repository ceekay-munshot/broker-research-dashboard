// Tiny JSON-shape validator. Sufficient for the structured outputs the
// prompt registry declares; deliberately not a full JSON-Schema impl.
//
// Every prompt's `outputSchema` is checked here BEFORE grounding. Any
// failure returns `{ ok: false, errors: [...] }` and the orchestrator
// rejects the model output without applying it.

import type { FieldSchema, StructuredOutputSchema } from './types'

export interface ValidationOk { readonly ok: true }
export interface ValidationFail { readonly ok: false; readonly errors: readonly string[] }
export type ValidationResult = ValidationOk | ValidationFail

export function validateAgainst(value: unknown, schema: StructuredOutputSchema): ValidationResult {
  const errors: string[] = []
  walk(value, schema.schema, schema.name, errors)
  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

function walk(v: unknown, s: FieldSchema, path: string, errors: string[]): void {
  switch (s.type) {
    case 'string': {
      if (typeof v !== 'string') { errors.push(`${path}: expected string, got ${typeName(v)}`); return }
      if (s.minLength !== undefined && v.length < s.minLength) errors.push(`${path}: shorter than ${s.minLength}`)
      if (s.maxLength !== undefined && v.length > s.maxLength) errors.push(`${path}: longer than ${s.maxLength}`)
      return
    }
    case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${path}: expected finite number, got ${typeName(v)}`)
      return
    }
    case 'boolean': {
      if (typeof v !== 'boolean') errors.push(`${path}: expected boolean, got ${typeName(v)}`)
      return
    }
    case 'array': {
      if (!Array.isArray(v)) { errors.push(`${path}: expected array, got ${typeName(v)}`); return }
      if (s.minItems !== undefined && v.length < s.minItems) errors.push(`${path}: fewer than ${s.minItems} items`)
      if (s.maxItems !== undefined && v.length > s.maxItems) errors.push(`${path}: more than ${s.maxItems} items`)
      v.forEach((item, i) => walk(item, s.items, `${path}[${i}]`, errors))
      return
    }
    case 'object': {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) {
        errors.push(`${path}: expected object, got ${typeName(v)}`); return
      }
      const obj = v as Record<string, unknown>
      for (const k of s.required) {
        if (!(k in obj)) errors.push(`${path}.${k}: missing required field`)
      }
      for (const [k, child] of Object.entries(s.properties)) {
        if (k in obj) walk(obj[k], child, `${path}.${k}`, errors)
      }
      if (s.additionalProperties === false) {
        for (const k of Object.keys(obj)) {
          if (!(k in s.properties)) errors.push(`${path}.${k}: unexpected property`)
        }
      }
      return
    }
  }
}

function typeName(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

import { describe, expect, it } from 'vitest'
import { validateAlias } from './ensClaim'

describe('validateAlias', () => {
  it('accepts an ordinary alias', () => {
    expect(validateAlias('marco')).toEqual({ valid: true })
  })

  it('accepts hyphens and digits in the middle', () => {
    expect(validateAlias('chef-marco-2')).toEqual({ valid: true })
  })

  it.each([
    ['ab', 'too short'],
    ['a'.repeat(33), 'too long'],
  ])('rejects %s (%s)', (alias) => {
    const result = validateAlias(alias)
    expect(result.valid).toBe(false)
  })

  it(
    'normalizes case rather than rejecting it — the alias is folded to\n' +
      'lowercase before checking, same as ENS itself does',
    () => {
      expect(validateAlias('Marco')).toEqual({ valid: true })
      expect(validateAlias('MARCO')).toEqual({ valid: true })
    },
  )

  it.each([
    ['marco!', 'punctuation'],
    ['-marco', 'leading hyphen'],
    ['marco-', 'trailing hyphen'],
    ['mar co', 'space'],
    ['marco.eth', 'embedded dot'],
  ])('rejects %s (%s)', (alias) => {
    const result = validateAlias(alias)
    expect(result.valid).toBe(false)
  })

  it.each(['sapore', 'admin', 'api', 'www', 'app', 'mail', 'support'])(
    'rejects the reserved word "%s"',
    (alias) => {
      const result = validateAlias(alias)
      expect(result.valid).toBe(false)
      if (!result.valid) expect(result.reason).toMatch(/reserved/i)
    },
  )

  it('is case-insensitive for the reserved-word check', () => {
    const result = validateAlias('SAPORE')
    expect(result.valid).toBe(false)
  })

  it('trims surrounding whitespace before validating', () => {
    expect(validateAlias('  marco  ')).toEqual({ valid: true })
  })

  it('gives a reason string for every rejection', () => {
    for (const alias of ['ab', 'Marco!', 'sapore']) {
      const result = validateAlias(alias)
      expect(result.valid).toBe(false)
      if (!result.valid) expect(result.reason.length).toBeGreaterThan(0)
    }
  })
})

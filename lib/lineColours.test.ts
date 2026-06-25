import { describe, test, expect } from 'vitest'
import { colourForLine } from './lineColours'

describe('colourForLine', () => {
  test('matches a known tube line by name, case-insensitively', () => {
    expect(colourForLine('Victoria', 'tube')).toBe('#0098D4')
    expect(colourForLine('victoria', 'tube')).toBe('#0098D4')
  })

  test('matches the Elizabeth line', () => {
    expect(colourForLine('Elizabeth line', 'tube')).toBe('#773DBD')
  })

  test('falls back to the mode colour when the line name is not recognised', () => {
    expect(colourForLine('314', 'bus')).toBe('#E32017')
  })

  test('falls back to the walking colour when mode is walking and there is no line name', () => {
    expect(colourForLine(undefined, 'walking')).toBe('#9E9E9E')
  })

  test('falls back to grey when neither the line name nor the mode is recognised', () => {
    expect(colourForLine('Some Unknown Line', 'mystery-mode')).toBe('#9E9E9E')
  })
})

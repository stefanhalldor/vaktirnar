/**
 * Boundary tests for classifyWindDistance() in lib/weather/assessment.ts.
 *
 * uncomfortable = 15 m/s, dangerous = 25 m/s in all tests unless stated.
 *
 * Boundary rules (< 2 means strictly less than 2):
 *   wind >= dangerous                  -> haettulegt
 *   dangerous - wind < 2               -> nalgast-haettumork
 *   wind >= uncomfortable              -> othaegilegt
 *   uncomfortable - wind < 2           -> nalgast-othaegindi
 *   otherwise                          -> innan-marka
 */

import { describe, it, expect } from 'vitest'
import { classifyWindDistance } from '../weather/assessment'

const U = 15  // uncomfortableWindMs
const D = 25  // dangerousWindMs

describe('classifyWindDistance', () => {
  it('wind clearly below uncomfortable -> innan-marka', () => {
    expect(classifyWindDistance(5, U, D)).toBe('innan-marka')
  })

  it('wind exactly 2 m/s below uncomfortable -> innan-marka (boundary: < 2 rule)', () => {
    expect(classifyWindDistance(U - 2, U, D)).toBe('innan-marka')
  })

  it('wind 1.99 m/s below uncomfortable -> nalgast-othaegindi', () => {
    expect(classifyWindDistance(U - 1.99, U, D)).toBe('nalgast-othaegindi')
  })

  it('wind exactly at uncomfortable threshold -> othaegilegt', () => {
    expect(classifyWindDistance(U, U, D)).toBe('othaegilegt')
  })

  it('wind clearly between uncomfortable and dangerous -> othaegilegt', () => {
    expect(classifyWindDistance(20, U, D)).toBe('othaegilegt')
  })

  it('wind exactly 2 m/s below dangerous -> othaegilegt (boundary: < 2 rule)', () => {
    expect(classifyWindDistance(D - 2, U, D)).toBe('othaegilegt')
  })

  it('wind 1.99 m/s below dangerous -> nalgast-haettumork', () => {
    expect(classifyWindDistance(D - 1.99, U, D)).toBe('nalgast-haettumork')
  })

  it('wind exactly at dangerous threshold -> haettulegt', () => {
    expect(classifyWindDistance(D, U, D)).toBe('haettulegt')
  })

  it('wind well above dangerous threshold -> haettulegt', () => {
    expect(classifyWindDistance(35, U, D)).toBe('haettulegt')
  })
})

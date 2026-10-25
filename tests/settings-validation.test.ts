import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@aperadar/shared/settings'
import { getSettingsValidationIssues } from '../apps/web/src/lib/settingsValidation.ts'

describe('settings validation navigation', () => {
  it('has no error navigation for valid settings', () => {
    expect(getSettingsValidationIssues(structuredClone(DEFAULT_SETTINGS))).toEqual([])
  })

  it('keeps errors from different settings sections available together', () => {
    const draft = { ...structuredClone(DEFAULT_SETTINGS), cacheMinutes: 0, textTemplate: 'x'.repeat(4001) }
    expect(getSettingsValidationIssues(draft)).toEqual(expect.arrayContaining([
      expect.objectContaining({ paths: ['cacheMinutes'], id: 'cache-minutes', section: 'connection' }),
      expect.objectContaining({ paths: ['textTemplate'], id: 'text-template', section: 'text' }),
    ]))
  })

  it('associates a threshold relationship error with both controls', () => {
    const draft = { ...structuredClone(DEFAULT_SETTINGS), apeThreshold: 65, unicumThreshold: 60 }
    expect(getSettingsValidationIssues(draft)).toEqual([
      expect.objectContaining({ paths: ['apeThreshold', 'unicumThreshold'], id: 'ape-threshold', section: 'ratings' }),
    ])
  })

  it('associates zero account weights with the complete mode group', () => {
    const draft = structuredClone(DEFAULT_SETTINGS)
    Object.assign(draft.weights, { solo: 0, div2: 0, div3: 0 })
    expect(getSettingsValidationIssues(draft)).toEqual([
      expect.objectContaining({ paths: ['weights.solo', 'weights.div2', 'weights.div3'], id: 'weight-solo', section: 'ratings' }),
    ])
  })

  it('retains a target for an incomplete numeric input', () => {
    expect(getSettingsValidationIssues({ ...structuredClone(DEFAULT_SETTINGS), cacheMinutes: Number.NaN })).toEqual([
      expect.objectContaining({ id: 'cache-minutes', section: 'connection' }),
    ])
  })

  it('does not invent a control target for configuration without a form field', () => {
    expect(getSettingsValidationIssues({ ...structuredClone(DEFAULT_SETTINGS), wgApplicationId: 'invalid!' })).toEqual([
      expect.objectContaining({ paths: ['wgApplicationId'], id: undefined, section: undefined }),
    ])
  })
})

import { describe, expect, it } from 'vitest'
import { resolveMapNotePresentation } from '@/lib/weather/mapNotePresentation'

describe('map note presentation', () => {
  it.each([
    {
      name: 'keeps the context untouched when no community surface is open',
      isCommunityOpen: false,
      hasSelectedNote: false,
      expected: {
        surface: 'hidden',
        hideContextBottomStrip: false,
        repositionMapAttribution: false,
      },
    },
    {
      name: 'shows a standalone detail while preserving the active context',
      isCommunityOpen: false,
      hasSelectedNote: true,
      expected: {
        surface: 'detail',
        hideContextBottomStrip: true,
        repositionMapAttribution: true,
      },
    },
    {
      name: 'shows the intentional community surface',
      isCommunityOpen: true,
      hasSelectedNote: false,
      expected: {
        surface: 'community',
        hideContextBottomStrip: true,
        repositionMapAttribution: true,
      },
    },
    {
      name: 'returns a community-selected detail to the community surface',
      isCommunityOpen: true,
      hasSelectedNote: true,
      expected: {
        surface: 'detail',
        hideContextBottomStrip: true,
        repositionMapAttribution: true,
      },
    },
  ])('$name', ({ isCommunityOpen, hasSelectedNote, expected }) => {
    expect(resolveMapNotePresentation({ isCommunityOpen, hasSelectedNote })).toEqual(expected)
  })
})

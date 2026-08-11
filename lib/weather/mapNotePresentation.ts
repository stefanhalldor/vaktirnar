export type MapNotePresentation = {
  surface: 'hidden' | 'community' | 'detail'
  hideContextBottomStrip: boolean
  repositionMapAttribution: boolean
}

export function resolveMapNotePresentation({
  isCommunityOpen,
  hasSelectedNote,
}: {
  isCommunityOpen: boolean
  hasSelectedNote: boolean
}): MapNotePresentation {
  if (hasSelectedNote) {
    return {
      surface: 'detail',
      hideContextBottomStrip: true,
      repositionMapAttribution: true,
    }
  }

  if (isCommunityOpen) {
    return {
      surface: 'community',
      hideContextBottomStrip: true,
      repositionMapAttribution: true,
    }
  }

  return {
    surface: 'hidden',
    hideContextBottomStrip: false,
    repositionMapAttribution: false,
  }
}

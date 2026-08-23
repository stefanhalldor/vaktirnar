import type {
  EventV3Person,
  EventV3RsvpState,
} from '@/lib/events/participant-identity-v3.contracts'

type EventBuiltInTag = 'unclassified' | 'family' | 'friends' | 'recipients'

export function visibleEventBuiltInTags(tags: readonly EventBuiltInTag[]): EventBuiltInTag[] {
  return tags.filter((tag) => tag !== 'unclassified')
}

export function EventPersonIdentity({
  person,
  fallbackLabel,
  rsvpLabels,
  privateNoteLabel,
  rsvpPrivateNoteLabel,
  hiddenLabels,
  builtInTagLabel,
}: {
  person: EventV3Person
  fallbackLabel: string
  rsvpLabels: Record<EventV3RsvpState, string>
  privateNoteLabel: string
  rsvpPrivateNoteLabel: string
  hiddenLabels: (count: number) => string
  builtInTagLabel: (tag: EventBuiltInTag) => string
}) {
  const sharedName = person.shared.displayName
  const primary = person.viewerPrivate?.alias ?? sharedName ?? fallbackLabel
  const showSharedSecondary = Boolean(person.viewerPrivate?.alias && sharedName && sharedName !== primary)
  const rsvp = person.participantKind === 'guest' ? rsvpLabels[person.rsvp.state] : null
  const tags = person.viewerPrivate
    ? [
        ...visibleEventBuiltInTags(person.viewerPrivate.builtInTags).map(builtInTagLabel),
        ...person.viewerPrivate.customLabels,
      ]
    : []

  return (
    <span className="min-w-0 flex-1">
      <span className="block break-words text-sm font-medium">{primary}</span>
      {showSharedSecondary ? (
        <span className="mt-0.5 block break-words text-xs text-muted-foreground">{sharedName}</span>
      ) : null}
      {person.viewerPrivate?.email ? (
        <span className="mt-0.5 block break-all text-xs text-muted-foreground">
          {person.viewerPrivate.email}
        </span>
      ) : null}
      {rsvp ? <span className="mt-1 block text-xs font-medium text-muted-foreground">{rsvp}</span> : null}
      {tags.length > 0 || person.viewerPrivate?.hiddenCustomLabelCount ? (
        <span className="mt-1 flex flex-wrap gap-1">
          {tags.map((tag, index) => (
            <span key={`${index}:${tag}`} className="max-w-full break-words rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {tag}
            </span>
          ))}
          {person.viewerPrivate?.hiddenCustomLabelCount ? (
            <span className="max-w-full break-words rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {hiddenLabels(person.viewerPrivate.hiddenCustomLabelCount)}
            </span>
          ) : null}
        </span>
      ) : null}
      {person.viewerPrivate?.note ? (
        <span className="mt-1 block break-words text-xs text-muted-foreground">
          {privateNoteLabel}: {person.viewerPrivate.note}
        </span>
      ) : null}
      {person.participantKind === 'guest' && person.rsvp.privateNote ? (
        <span className="mt-1 block break-words text-xs text-muted-foreground">
          {rsvpPrivateNoteLabel}: {person.rsvp.privateNote}
        </span>
      ) : null}
    </span>
  )
}

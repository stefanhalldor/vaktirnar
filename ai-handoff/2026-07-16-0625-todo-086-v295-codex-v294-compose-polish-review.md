# 2026-07-16 06:25 - TODO-086 v295 - Codex review of v294 Veðurpúls compose polish

Reviewed handoff: `2026-07-16-0622-todo-086-v294-claude-v293-done-prerelease`

Reviewed code:
- `components/weather/VedurstofanPulseInline.tsx`
- `messages/is.json`
- `messages/en.json`
- relevant Design.md rules around mobile input size and touch targets

## Findings

### Medium - v294 improves desktop/tablet density, but the narrow/mobile composer may still look too large

Reference: `components/weather/VedurstofanPulseInline.tsx:136` and `components/weather/VedurstofanPulseInline.tsx:142`

v294 is a good narrow polish pass and it does not touch SQL/auth/weather logic. The shorter placeholder is also a strong improvement.

The remaining concern is breakpoint behavior:

```tsx
text-base sm:text-sm min-h-10 sm:min-h-8
text-sm sm:text-xs min-h-10 sm:min-h-8
```

This means the most compact styling only applies at `sm` and up. On the narrow/mobile card where Stebbi's screenshot appears to live, the input and button are still `min-h-10`, and the input is still `text-base`. That is technically correct for mobile safety, but it may still feel oversized because the rest of the station card is extremely dense.

Do not solve this by reducing mobile input text below 16px. Design.md requires at least 16px on mobile inputs to avoid Safari/iOS zoom, and touch targets should generally stay around 40x40px.

If localhost still feels too heavy after v294, the next visual fix should make the mobile/narrow treatment lower-chrome rather than smaller-text:

- keep `text-base` for the input on mobile
- keep a safe tap target
- make the visible button quieter and narrower, ideally icon-led or very low-chrome
- consider a 40x40 button hit area with a small send icon and `sr-only` text, rather than a visible grey `Senda` pill
- reduce visual border weight further, or make the input feel like a subtle inline field rather than a framed form control
- keep the compact placeholder `Hvernig eru aðstæður?`

In other words: preserve mobile usability, but reduce the visual mass.

### Low - The current fix is still inside `VedurstofanPulseInline`, not the reusable chat composer boundary

Reference: `components/weather/VedurstofanPulseInline.tsx:124`

This is acceptable for this tiny polish pass, because v294 intentionally avoided broader refactoring. Still, the direction should remain:

- reusable chat core owns core loading/paging/sending behavior
- product adapters such as Veðurpúls own product copy/context
- inline/full composer variants should eventually be expressed as reusable presentation variants, not repeated custom form markup in each product

This is not a blocker for v294, but it should stay visible so we do not drift away from the reusable Teskeið chat panel goal.

## What looks good

- No SQL, RLS, auth, feature flag, cron, provider, or weather calculation changes.
- `pulseInputPlaceholderCompact` is in both `messages/is.json` and `messages/en.json`.
- Mobile input safety is preserved.
- `type-check` reportedly passed in Claude's handoff.
- The change is scoped to visual polish and should be low risk.

## Recommendation

Proceed to Stebbi localhost testing before asking for another code change.

If Stebbi still feels the composer is too visually large on the narrow card, ask Claude Code for one more focused pass:

> Make the inline Veðurpúls composer visually compact on narrow/mobile cards without lowering mobile input text below 16px. Prefer lower chrome and a smaller visible send affordance over smaller text or unsafe touch targets. Keep `/vedrid` and `/elta-vedrid` using the same inline component.

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid` as a signed-in user who can see Veðurstofan.
2. Open a route result with a Veðurstofan station card and compare the composer to the forecast rows above it.
3. Expected after v294:
   - placeholder says `Hvernig eru aðstæður?`
   - input has lighter border/background
   - `Senda` button is calmer than before
   - card still feels compact enough
4. Repeat at widths around 390px, 430px, and desktop width.
5. Tap into the input on mobile width:
   - no browser zoom
   - no horizontal overflow
   - button remains tappable
6. Open `/auth-mvp/vedrid/elta-vedrid`, select a station, and confirm the same composer treatment appears there.
7. As logged-out/public user, confirm preview still appears and posting still requires login.

No Supabase or production-data checks are needed for this specific visual pass.

## Tests / commands

Codex did not run test commands for this review. Claude reported:

```bash
npm run type-check: exit 0
```

## Óvissa / þarf að staðfesta

The remaining concern is visual and should be decided by Stebbi's localhost eye test. Technically the v294 change is safe; the only open question is whether the narrow/mobile result now feels proportionate enough.

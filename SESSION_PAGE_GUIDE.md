# Session Page Implementation Guide

This file contains the complete code for the session dashboard page.

## File: app/s/[sessionId]/page.tsx

This is the main session dashboard that handles:
- Fetching session data
- Adding kids
- Logging activities (completed or started)
- Editing existing logs
- Timeline display
- Summary statistics
- Access control (view vs edit mode)

### Key Features:
1. **Auto-refresh**: Polls API every 5 seconds to show real-time updates
2. **Access modes**: Read-only view vs full edit access based on URL key
3. **Activity logging**: Modal with tabs for "Completed" and "Start Activity"
4. **Edit functionality**: Click pencil icon on any log entry to edit
5. **Kid management**: Add kids, auto-updates session name
6. **Statistics**: Total screen time, per-kid totals, per-category totals

### Implementation Notes:

**State Management:**
- `sessionData`: Full session object with kids and logs
- `newKidName`: Input for adding kids
- `selectedKids`: Which kids to log activity for (all by default)
- `showActivityModal`: Controls activity logging modal
- `selectedCategory`: Which activity category is being logged
- `activityMode`: "completed" or "start"
- `editingLog`: Log entry being edited (or null)

**Auto-refresh:**
```typescript
useEffect(() => {
  const interval = setInterval(fetchSession, 5000);
  return () => clearInterval(interval);
}, [sessionId, key]);
```

**Session Name Generation:**
Uses `generateSessionName()` from utils to create names like:
- "Emma & Liam"
- "Emma, Liam & Sofia"

**Activity Categories:**
```typescript
const categories = [
  { id: 'computer', label: 'Computer', icon: Monitor, color: 'blue' },
  { id: 'tv', label: 'TV Time', icon: Tv, color: 'purple' },
  { id: 'outdoors', label: 'Outdoors', icon: Trees, color: 'green' },
];
```

**Time Calculation:**
- For completed activities: `startedAt = now - minutes`
- For started activities: `startedAt = selected time`
- Default to "now" rounded to nearest 10 minutes

### Required Components:

Create these helper components in a `components/` directory:

1. **ActivityModal** - Dialog for logging activities
2. **EditLogModal** - Dialog for editing existing logs
3. **KidBadge** - Color-coded kid name pill
4. **CategoryCard** - Clickable activity category
5. **TimelineEntry** - Individual log entry display
6. **SummaryStats** - Statistics cards

### Styling:

Use Tailwind classes matching the mockups:
- Gradient header: `bg-gradient-to-r from-blue-500 to-purple-600`
- Category colors:
  - Computer: `bg-blue-500`, `text-blue-600`
  - TV: `bg-purple-500`, `text-purple-600`
  - Outdoors: `bg-green-500`, `text-green-600`
- Active entries: Green highlight with "Active" badge
- Edit/delete buttons: Small icon buttons with hover effects

### API Integration:

**Fetch session:**
```typescript
const response = await fetch(`/api/sessions/${sessionId}?key=${key || ''}`);
const data = await response.json();
```

**Add kid:**
```typescript
const response = await fetch(`/api/sessions/${sessionId}/kids?key=${key}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: kidName }),
});
```

**Create log:**
```typescript
const response = await fetch(`/api/sessions/${sessionId}/logs?key=${key}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    kidIds: selectedKidIds,
    category,
    minutes: activityMode === 'completed' ? minutes : undefined,
    startedAt: calculatedStartTime,
    note,
    status: activityMode === 'completed' ? 'completed' : 'active',
  }),
});
```

**Update log:**
```typescript
const response = await fetch(`/api/sessions/${sessionId}/logs/${logId}?key=${key}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(updates),
});
```

**Delete log:**
```typescript
await fetch(`/api/sessions/${sessionId}/logs/${logId}?key=${key}`, {
  method: 'DELETE',
});
```

### Share Link Functionality:

```typescript
const handleShareLink = async () => {
  const link = `${window.location.origin}/s/${sessionId}?key=${key}`;
  await navigator.clipboard.writeText(link);
  // Show toast notification
  alert('Link copied to clipboard!');
};
```

### Complete Button for Active Logs:

When an activity has `status === 'active'` and no `minutes`, show a "Complete & Log Duration" button:

```typescript
const handleCompleteActivity = async (log: LogEntry) => {
  // Open edit modal pre-filled with this log
  // Allow user to enter duration
  // Update log with minutes and status = 'completed'
};
```

---

## Full Code Structure

Create the following file structure:

```
app/s/[sessionId]/
  └── page.tsx                 # Main session dashboard (see below)

components/
  ├── activity-modal.tsx       # Modal for logging activities
  ├── edit-log-modal.tsx       # Modal for editing logs
  ├── kid-badge.tsx            # Kid name badge component
  ├── category-card.tsx        # Activity category card
  ├── timeline-entry.tsx       # Timeline log entry
  └── summary-stats.tsx        # Statistics display
```

Each component should use shadcn/ui primitives (Dialog, Button, Input, etc.) and match the mockup styles.

---

## Critical Implementation Details

### 1. Kid Selection for Activities
- Default: ALL kids are checked
- Show checkboxes for each kid
- Parent can uncheck kids not participating
- Show selected kids in the modal header as colored badges

### 2. Time Selection
- Generate options using `generateTimeOptions(8)` for 8 hours back
- Round to 10-minute intervals
- Show "Now (3:40 PM)" format
- For completed activities: calculate start time automatically

### 3. Active Activities
- Show green highlight in timeline
- Display "Started X minutes ago"
- Show "Complete & Log Duration" button
- Clicking complete button opens edit modal with duration input focused

### 4. Session Name Auto-Update
- Recalculate on every render using current kids list
- Display in header as main title
- Show "Playdate Session" as subtitle

### 5. Access Control UI
- Show "Editable" badge (green) when has edit access
- Show "Read-only" badge (gray) when no edit access
- Hide all add/edit/delete buttons in read-only mode
- Show info message about requesting edit link

### 6. Statistics Calculation
```typescript
const totalScreenTime = logs
  .filter(l => l.status === 'completed')
  .filter(l => l.category === 'computer' || l.category === 'tv')
  .reduce((sum, l) => sum + (l.minutes || 0), 0);

const perKidTotals = kids.map(kid => ({
  kid,
  total: logs
    .filter(l => l.status === 'completed' && l.kidIds.includes(kid.id))
    .reduce((sum, l) => sum + (l.minutes || 0), 0),
}));
```

---

## Testing Checklist

- [ ] Create new session from landing page
- [ ] Add multiple kids, verify name updates
- [ ] Copy share link with button
- [ ] Log completed activity with all kids
- [ ] Log completed activity with some kids unchecked
- [ ] Start an active activity
- [ ] Complete an active activity
- [ ] Edit an existing log (change kids, time, duration)
- [ ] Delete a log
- [ ] Open view link in incognito - verify read-only mode
- [ ] Verify statistics calculate correctly
- [ ] Verify timeline sorts newest first
- [ ] Verify auto-refresh updates data every 5 seconds


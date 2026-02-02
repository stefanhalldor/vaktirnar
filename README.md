# PlaydateSync - MVP Implementation Guide

A real-time playdate activity tracker where parents can log kids' screen time and outdoor activities together.

## Quick Start

### 1. Initialize the Project

```bash
npx create-next-app@latest playdate-sync --typescript --tailwind --app --no-src-dir --import-alias "@/*"
cd playdate-sync
```

### 2. Install Dependencies

```bash
npm install nanoid zod lucide-react
npm install -D @types/node
```

### 3. Install shadcn/ui

```bash
npx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes

Then install the components we need:

```bash
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add card
npx shadcn@latest add badge
npx shadcn@latest add dialog
npx shadcn@latest add sheet
npx shadcn@latest add select
npx shadcn@latest add textarea
npx shadcn@latest add checkbox
```

### 4. Project Structure

```
playdate-sync/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── s/
│   │   └── [sessionId]/
│   │       └── page.tsx            # Session dashboard
│   ├── api/
│   │   └── sessions/
│   │       ├── route.ts            # POST /api/sessions - create session
│   │       └── [id]/
│   │           ├── route.ts        # GET /api/sessions/:id
│   │           ├── kids/
│   │           │   └── route.ts    # POST /api/sessions/:id/kids
│   │           └── logs/
│   │               ├── route.ts    # POST /api/sessions/:id/logs
│   │               └── [logId]/
│   │                   └── route.ts # DELETE & PATCH
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── types.ts                    # TypeScript types
│   ├── store.ts                    # In-memory data store
│   └── utils.ts                    # Helper functions
├── components/
│   ├── session-header.tsx
│   ├── kids-section.tsx
│   ├── activity-logger.tsx
│   ├── timeline.tsx
│   └── summary-stats.tsx
└── README.md
```

## Core Features

### 1. Session Creation
- Generate short session ID (6 chars) and long edit key (32 chars)
- Auto-name sessions based on kids (e.g., "Emma, Liam & Sofia")
- Two links: view (`/s/abc123`) and edit (`/s/abc123?key=xyz...`)

### 2. Kids Management
- Add/remove kids (edit mode only)
- Session name updates automatically
- Color-coded kid badges

### 3. Activity Logging
- **Completed Mode**: Log finished activities with duration
  - Auto-calculates start time as (now - duration)
  - Optional: manually set custom start time
- **Start Activity Mode**: Mark activity start without duration
  - Set "Started at" time
  - Complete later to add duration
- Categories: Computer, TV Time, Outdoors
- All kids selected by default (playdate context)
- Uncheck kids not participating

### 4. Timeline & Stats
- Real-time activity feed (newest first)
- Edit any entry at any time
- Total Screen Time = Computer + TV
- Per-kid totals
- Per-category totals

### 5. Access Control
- View mode: See timeline/stats only
- Edit mode: Full CRUD on kids and activities
- Visual badge showing current mode

## Data Models

```typescript
interface Session {
  id: string;              // Short ID (6 chars)
  editKey: string;         // Long secret key (32 chars)
  createdAt: Date;
  status: 'open' | 'closed';
}

interface Kid {
  id: string;
  sessionId: string;
  name: string;
  createdAt: Date;
}

interface LogEntry {
  id: string;
  sessionId: string;
  kidIds: string[];        // Multiple kids per activity
  category: 'computer' | 'tv' | 'outdoors';
  minutes?: number;        // Undefined for "started" activities
  startedAt: Date;
  note?: string;
  status: 'active' | 'completed';
  createdAt: Date;
}
```

## API Endpoints

### POST /api/sessions
Create new session
- Response: `{ sessionId, editKey, viewLink, editLink }`

### GET /api/sessions/:id?key=...
Get session data
- Returns: session, kids, logs
- Access level based on key presence

### POST /api/sessions/:id/kids
Add kid (requires key)
- Body: `{ name }`
- Auto-updates session name

### POST /api/sessions/:id/logs
Create log entry (requires key)
- Body: `{ kidIds, category, minutes?, startedAt, note?, status }`

### PATCH /api/sessions/:id/logs/:logId
Update log entry (requires key)
- Body: Any LogEntry fields

### DELETE /api/sessions/:id/logs/:logId
Delete log entry (requires key)

## UI Components

### Color Scheme
- Primary: Blue-to-purple gradient
- Computer: Blue (#3b82f6)
- TV: Purple (#a855f7)
- Outdoors: Green (#22c55e)
- Active activities: Green highlight

### Key Interactions
- Click "Share Link" → Copy edit link + show toast
- Click category card → Open activity modal
- Toggle "Completed" / "Start Activity"
- Quick select minutes: 5, 10, 15, 30, 45, 60
- Edit button on timeline entries → Open edit modal
- Active activities show "Complete & Log Duration" button

## Implementation Notes

1. **In-Memory Store**: Use Map objects for sessions, kids, logs
2. **Session Name Generation**: Join kid names with ", " and " & " for last
3. **Time Handling**: Store as ISO strings, display in local time
4. **Validation**: Use Zod schemas for all API inputs
5. **Real-time Updates**: Use React state + polling (or add WebSocket later)

## Migration to Supabase (Future)

The in-memory store (`lib/store.ts`) is designed to be easily replaced:

1. Create Supabase tables matching the data models
2. Replace store functions with Supabase queries
3. Update API routes to use Supabase client
4. Keep the same API interface - no frontend changes needed

## Development

```bash
npm run dev
```

Open http://localhost:3000

## Testing Flow

1. Visit landing page → Click "Start New Playdate"
2. Add kids: Emma, Liam, Sofia
3. Note session name updates to "Emma, Liam & Sofia"
4. Click "Share Link" to copy
5. Log activities:
   - Computer: 60 min (all kids)
   - TV: 30 min (uncheck Emma)
   - Outdoors: Start activity (set time)
6. View timeline with mixed completed/active entries
7. Edit an entry - change kids, time, duration
8. Open in new incognito tab with view link → Read-only mode
9. Open with edit link → Full edit mode

## Design Mockups

See `playdate-sync-mockups.html` for interactive UI reference.

# PlaydateSync - Complete Product Specification

## Overview
PlaydateSync is a web application that allows parents to collaboratively track their children's activities during playdates in real-time. Parents can log screen time (computer and TV) and outdoor activities, with all data synced across multiple devices through shared session links.

## Core Concept
When kids have playdates, parents want to track how much time they spend on different activities. PlaydateSync makes this easy by:
1. Creating a shared session for the playdate
2. Generating shareable links so all parents can participate
3. Logging activities for all kids together (since they're at a playdate)
4. Showing real-time statistics and timeline of activities

## Key Features

### 1. Session Management
- **Create Session**: One-click creation generates a unique session with two types of links:
  - **Edit Link**: Full access to add kids and log activities (includes secret key)
  - **View Link**: Read-only access to see timeline and stats
- **Auto-Generated Names**: Session automatically names itself based on participating kids (e.g., "Emma, Liam & Sofia")
- **Access Control**: Edit key in URL controls whether user can edit or just view

### 2. Kid Management
- Add kids to the playdate with simple name input
- Kids shown as color-coded badges throughout the app
- Session name updates automatically as kids are added
- Each kid gets assigned a color (blue, purple, pink, orange, teal) for easy visual identification

### 3. Activity Logging - Two Modes

**Mode A: Completed Activities**
- Log activities that already happened with duration
- Select minutes: Quick buttons (5, 10, 15, 30, 45, 60) or custom input
- Time auto-calculated: Start time = (now - duration)
- Optional: Manual time selection with 10-minute intervals
- Optional: Add notes about what they were doing

**Mode B: Start Activity**
- Log when an activity just started (no duration yet)
- Set start time (defaults to "now")
- Shows as "Active" in timeline with elapsed time
- Can be completed later by clicking "Complete & Log Duration" button

### 4. Multi-Kid Selection
- **Default**: All kids selected (playdate context - everyone doing the same thing)
- **Flexible**: Uncheck kids who aren't participating in that specific activity
- Shows selected kids as colored badges in confirmation modal

### 5. Activity Categories
Three types with distinct colors:
- **Computer** (Blue) - Screen time on computers/tablets
- **TV Time** (Purple) - Television watching
- **Outdoors** (Green) - Outside play/activities

### 6. Timeline View
- Displays all logged activities newest-first
- Each entry shows:
  - Category icon and color
  - Which kids participated (colored badges)
  - Duration (for completed) or elapsed time (for active)
  - Timestamp and optional notes
  - Edit and delete buttons (edit mode only)
- Active activities highlighted in green with "Active" badge
- "Complete & Log Duration" button for active activities

### 7. Statistics Dashboard
- **Per-Category Totals**: Minutes for Computer, TV, Outdoors
- **Total Screen Time**: Sum of Computer + TV (highlighted in amber)
- **Per-Kid Totals**: Total minutes for each child
- Real-time updates as activities are logged

### 8. Full Edit Capabilities
- **Every activity is editable at any time**
- Edit modal allows changing:
  - Which kids participated (add/remove)
  - Duration/minutes
  - Time/timestamp
  - Notes
  - Can also delete from edit modal
- Changes reflect immediately in timeline and stats

### 9. Real-Time Updates
- Auto-refreshes data every 5 seconds
- Shows changes made by other parents
- No page refresh needed

## Technical Architecture

### Frontend
- **Framework**: Next.js 15 (App Router) with TypeScript
- **Styling**: Tailwind CSS with mobile-first design
- **Icons**: Lucide React
- **UI Components**: Custom components with Radix UI primitives (modals, dialogs)
- **Colors**: 
  - Primary gradient: Blue-to-purple
  - Category colors: Blue (computer), Purple (TV), Green (outdoors)
  - Kid badge colors: Rotate through blue, purple, pink, orange, teal

### Backend
- **API**: Next.js Route Handlers (RESTful)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: URL-based with edit keys (no user accounts)
- **Real-time**: Polling (5-second intervals)

### Data Models

**Sessions Table:**
```
id: string (6 chars, URL-safe)
edit_key: string (32 chars, secret)
created_at: timestamp
status: 'open' | 'closed'
```

**Kids Table:**
```
id: uuid
session_id: string (foreign key)
name: string
created_at: timestamp
```

**Logs Table:**
```
id: uuid
session_id: string (foreign key)
kid_ids: string[] (array of kid IDs)
category: 'computer' | 'tv' | 'outdoors'
minutes: number (optional for active activities)
started_at: timestamp
note: string (optional)
status: 'active' | 'completed'
created_at: timestamp
```

### API Endpoints

**POST /api/sessions**
- Creates new session
- Returns: sessionId, editKey, viewLink, editLink

**GET /api/sessions/:id?key=...**
- Fetches session data (session, kids, logs)
- Returns hasEditAccess flag based on key presence

**POST /api/sessions/:id/kids?key=...**
- Adds kid to session (requires edit key)
- Body: { name: string }

**POST /api/sessions/:id/logs?key=...**
- Creates log entry (requires edit key)
- Body: { kidIds, category, minutes?, startedAt, note?, status }

**PATCH /api/sessions/:id/logs/:logId?key=...**
- Updates log entry (requires edit key)
- Body: Partial log entry fields

**DELETE /api/sessions/:id/logs/:logId?key=...**
- Deletes log entry (requires edit key)

### Helper Functions

**generateSessionName(kids)**
- 0 kids: "Playdate"
- 1 kid: "Emma"
- 2 kids: "Emma & Liam"
- 3+ kids: "Emma, Liam & Sofia"

**generateSessionId()**: 6-char random alphanumeric
**generateEditKey()**: 32-char random alphanumeric
**calculateElapsedMinutes(startedAt)**: Minutes since start time
**formatTime(date)**: 12-hour format (e.g., "2:45 PM")

## User Flows

### Primary Flow: Create and Track Playdate
1. Parent A visits landing page
2. Clicks "Start New Playdate"
3. Adds kids: Emma, Liam, Sofia
4. Session name becomes "Emma, Liam & Sofia"
5. Clicks "Share Link" to copy edit link
6. Sends link to Parent B via text/WhatsApp
7. Both parents can now:
   - Log activities for all kids (default: all selected)
   - Log activities for specific kids (uncheck others)
   - Start activities (kids just went outside)
   - Complete active activities
   - Edit any past activities
   - View real-time timeline and stats

### Secondary Flow: View-Only Access
1. Parent has view link (no edit key)
2. Sees "Read-only" badge instead of "Editable"
3. Can view timeline and statistics
4. Cannot add kids or log activities
5. Message shown: "Ask creator for edit link"

## Design Principles

### Mobile-First
- All UI designed for phones first
- Big, tappable buttons and cards
- Optimized for one-handed use
- Responsive for tablets and desktop

### Playdate Context
- Default: all kids selected (they're together)
- Easy to uncheck if someone's not participating
- Encourages quick logging without friction

### Parent-Friendly Language
- No technical jargon ("Completed" not "Log Completed Activity")
- Clear, friendly copy
- Emoji-free but warm tone
- Helpful hints where needed

### Visual Clarity
- Color-coded categories for quick scanning
- Color-coded kids for easy identification
- Clear distinction between active and completed activities
- Visual hierarchy: most important info largest

### Minimal Friction
- Few required fields
- Smart defaults (all kids, "now" time, auto-calculated start time)
- Quick select buttons for common durations
- No login/signup required

## Edge Cases Handled

1. **Empty States**: Friendly messages when no kids or activities yet
2. **Active Activity Completion**: Clear path to add duration to started activities
3. **Multi-Kid Activities**: Support for group and individual activities
4. **Time Selection**: Defaults smart, allows manual override
5. **Access Control**: Clear visual indication of view vs. edit mode
6. **Network Failures**: Error messages with retry guidance
7. **Data Validation**: All inputs validated with Zod schemas

## Future Enhancements (Not Implemented)

1. **User Accounts**: Link sessions to user profiles
2. **Session History**: View past playdates
3. **Activity Templates**: Save common activities
4. **Notifications**: Alerts when screen time limits reached
5. **Export/Print**: Generate reports
6. **WebSocket Real-time**: Replace polling with live updates
7. **More Categories**: Reading, Arts & Crafts, etc.
8. **Time Goals**: Set targets for outdoor time
9. **Calendar Integration**: Schedule future playdates
10. **Multi-Language Support**

## Deployment

**Local Development:**
- `npm install` - Install dependencies
- Create `.env.local` with Supabase credentials
- `npm run dev` - Start at localhost:3000

**Production (Vercel):**
- Push to GitHub
- Connect Vercel to repo
- Add environment variables in Vercel dashboard:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_BASE_URL` (your Vercel domain)
- Auto-deploys on git push

**Database (Supabase):**
- Create project at supabase.com
- Run `supabase-schema.sql` in SQL Editor
- Copy credentials from Settings → API
- Free tier: 500MB database, 2GB bandwidth

## Files Structure
```
playdate-sync/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── s/[sessionId]/page.tsx      # Session dashboard
│   ├── api/sessions/               # API routes
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── types.ts                    # TypeScript types
│   ├── store.ts                    # Supabase operations
│   ├── supabase.ts                 # Supabase client
│   └── utils.ts                    # Helper functions
├── .env.local                      # Environment variables
├── supabase-schema.sql             # Database schema
├── PRODUCT_SPEC.md                 # This file
└── package.json
```

## Key Dependencies
- next: ^15.1.4
- react: ^18.3.1
- @supabase/supabase-js: ^2.46.2
- zod: ^3.24.1
- lucide-react: ^0.468.0
- tailwindcss: ^3.4.1
- typescript: ^5

## Design Assets
- Font: System fonts (Inter as fallback)
- Color Palette:
  - Primary: Blue (#3b82f6) to Purple (#a855f7) gradient
  - Success: Green (#22c55e)
  - Warning: Amber (#f59e0b)
  - Error: Red (#ef4444)
  - Background: Light blue-purple gradient (#eff6ff to #faf5ff)

## Problem Statement

Parents hosting playdates often struggle to:
- Keep track of how much screen time kids are getting
- Balance indoor and outdoor activities
- Coordinate with other parents on activity tracking
- Remember what activities happened and for how long

**PlaydateSync solves this by providing:**
- Simple, collaborative activity tracking
- Real-time visibility for all parents
- No accounts or complex setup required
- Mobile-first design for quick logging

## Target Users

**Primary Users:**
- Parents hosting playdates at their home
- Parents whose kids are at someone else's house for a playdate
- Caregivers (grandparents, nannies) supervising multiple children

**Use Cases:**
- Weekend playdates (2-4 hours)
- After-school playdates (1-2 hours)
- Summer playdate groups
- Monitoring screen time limits
- Encouraging outdoor play

## Success Metrics (Future)

1. **Adoption**: Number of sessions created per week
2. **Engagement**: Average activities logged per session
3. **Collaboration**: Percentage of sessions with 2+ active users
4. **Retention**: Users who create multiple sessions
5. **Completion Rate**: Percentage of sessions with at least 3 activities logged

## Privacy & Security

**Data Storage:**
- All data stored in Supabase PostgreSQL database
- No user accounts or personal information collected
- Sessions accessible only via unique URLs with secret keys

**Access Control:**
- Edit key required for modifications
- View-only links available for read access
- No password or authentication needed

**Data Retention:**
- Sessions remain active indefinitely
- No automatic deletion (future: add expiry options)
- Parents can delete individual activities

## Competitive Landscape

**Alternatives:**
- Manual pen-and-paper tracking
- Shared notes apps (Google Docs, Notion)
- Screen time apps (per-device, not collaborative)
- Parental control apps (restrictive, not tracking)

**PlaydateSync Advantages:**
- Purpose-built for playdates
- Real-time collaboration
- No installation required
- Works on any device with a browser
- Simple sharing via link

## Development Timeline (Completed)

**Phase 1 - MVP Core (Completed)**
- ✅ Session creation and sharing
- ✅ Kid management
- ✅ Activity logging (both modes)
- ✅ Timeline view
- ✅ Statistics dashboard
- ✅ Edit capabilities
- ✅ Supabase integration

**Phase 2 - Deployment (In Progress)**
- ⏳ Supabase maintenance completion
- ⏳ Production deployment to Vercel
- ⏳ Live testing with real users

**Phase 3 - Future Enhancements**
- User accounts (optional)
- Session history
- Activity templates
- Export/print features
- Additional activity categories

---

This document provides everything needed to understand, rebuild, or extend PlaydateSync from scratch, including all features, technical decisions, data models, user flows, and implementation details.

**Last Updated**: January 30, 2026
**Version**: 1.0.0 (MVP)
**Status**: Ready for deployment pending Supabase maintenance completion

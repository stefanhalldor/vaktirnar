// lib/types.ts

export type SessionStatus = 'open' | 'closed';
export type ActivityCategory = 'computer' | 'tv' | 'outdoors';
export type LogStatus = 'active' | 'completed';

export interface Session {
  id: string;
  editKey: string;
  createdAt: string;
  status: SessionStatus;
}

export interface Kid {
  id: string;
  sessionId: string;
  name: string;
  createdAt: string;
}

export interface LogEntry {
  id: string;
  sessionId: string;
  kidIds: string[];
  category: ActivityCategory;
  minutes?: number;
  startedAt: string;
  note?: string;
  status: LogStatus;
  createdAt: string;
}

export interface SessionData {
  session: Session;
  kids: Kid[];
  logs: LogEntry[];
  hasEditAccess: boolean;
}

export interface CreateSessionResponse {
  sessionId: string;
  editKey: string;
  viewLink: string;
  editLink: string;
}

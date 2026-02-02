// lib/store.ts

import { Session, Kid, LogEntry } from './types';
import { supabase } from './supabase';

export const store = {
  // Sessions
  createSession: async (session: Session): Promise<Session> => {
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        id: session.id,
        edit_key: session.editKey,
        created_at: session.createdAt,
        status: session.status,
      })
      .select()
      .single();

    if (error) throw error;
    
    return {
      id: data.id,
      editKey: data.edit_key,
      createdAt: data.created_at,
      status: data.status,
    };
  },

  getSession: async (id: string): Promise<Session | null> => {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return {
      id: data.id,
      editKey: data.edit_key,
      createdAt: data.created_at,
      status: data.status,
    };
  },

  // Kids
  createKid: async (kid: Kid): Promise<Kid> => {
    const { data, error } = await supabase
      .from('kids')
      .insert({
        id: kid.id,
        session_id: kid.sessionId,
        name: kid.name,
        created_at: kid.createdAt,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      sessionId: data.session_id,
      name: data.name,
      createdAt: data.created_at,
    };
  },

  getKidsBySession: async (sessionId: string): Promise<Kid[]> => {
    const { data, error } = await supabase
      .from('kids')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || []).map(k => ({
      id: k.id,
      sessionId: k.session_id,
      name: k.name,
      createdAt: k.created_at,
    }));
  },

  deleteKid: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('kids')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  },

  // Logs
  createLog: async (log: LogEntry): Promise<LogEntry> => {
    const { data, error } = await supabase
      .from('logs')
      .insert({
        id: log.id,
        session_id: log.sessionId,
        kid_ids: log.kidIds,
        category: log.category,
        minutes: log.minutes,
        started_at: log.startedAt,
        note: log.note,
        status: log.status,
        created_at: log.createdAt,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      sessionId: data.session_id,
      kidIds: data.kid_ids,
      category: data.category,
      minutes: data.minutes,
      startedAt: data.started_at,
      note: data.note,
      status: data.status,
      createdAt: data.created_at,
    };
  },

  getLogsBySession: async (sessionId: string): Promise<LogEntry[]> => {
    const { data, error } = await supabase
      .from('logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(l => ({
      id: l.id,
      sessionId: l.session_id,
      kidIds: l.kid_ids,
      category: l.category,
      minutes: l.minutes,
      startedAt: l.started_at,
      note: l.note,
      status: l.status,
      createdAt: l.created_at,
    }));
  },

  getLog: async (id: string): Promise<LogEntry | null> => {
    const { data, error } = await supabase
      .from('logs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return {
      id: data.id,
      sessionId: data.session_id,
      kidIds: data.kid_ids,
      category: data.category,
      minutes: data.minutes,
      startedAt: data.started_at,
      note: data.note,
      status: data.status,
      createdAt: data.created_at,
    };
  },

  updateLog: async (id: string, updates: Partial<LogEntry>): Promise<LogEntry | null> => {
    // Convert camelCase to snake_case for Supabase
    const dbUpdates: any = {};
    if (updates.kidIds !== undefined) dbUpdates.kid_ids = updates.kidIds;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.minutes !== undefined) dbUpdates.minutes = updates.minutes;
    if (updates.startedAt !== undefined) dbUpdates.started_at = updates.startedAt;
    if (updates.note !== undefined) dbUpdates.note = updates.note;
    if (updates.status !== undefined) dbUpdates.status = updates.status;

    const { data, error } = await supabase
      .from('logs')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return {
      id: data.id,
      sessionId: data.session_id,
      kidIds: data.kid_ids,
      category: data.category,
      minutes: data.minutes,
      startedAt: data.started_at,
      note: data.note,
      status: data.status,
      createdAt: data.created_at,
    };
  },

  deleteLog: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('logs')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  },

  // Utility methods (useful for admin/debugging)
  getAllKids: async (): Promise<Kid[]> => {
    const { data, error } = await supabase
      .from('kids')
      .select('*');

    if (error) throw error;

    return (data || []).map(k => ({
      id: k.id,
      sessionId: k.session_id,
      name: k.name,
      createdAt: k.created_at,
    }));
  },

  getAllLogs: async (): Promise<LogEntry[]> => {
    const { data, error } = await supabase
      .from('logs')
      .select('*');

    if (error) throw error;

    return (data || []).map(l => ({
      id: l.id,
      sessionId: l.session_id,
      kidIds: l.kid_ids,
      category: l.category,
      minutes: l.minutes,
      startedAt: l.started_at,
      note: l.note,
      status: l.status,
      createdAt: l.created_at,
    }));
  },

  getAllSessions: async (): Promise<Session[]> => {
    const { data, error } = await supabase
      .from('sessions')
      .select('*');

    if (error) throw error;

    return (data || []).map(s => ({
      id: s.id,
      editKey: s.edit_key,
      createdAt: s.created_at,
      status: s.status,
    }));
  },
};

-- sql/88_weather_user_preferences_status_filter_mode.sql
-- Adds status_filter_mode column to weather_user_preferences.
-- Nullable: null = user has not explicitly saved a preference (client falls back to localStorage).
-- Idempotent: safe to run multiple times.

alter table public.weather_user_preferences
  add column if not exists status_filter_mode text;

alter table public.weather_user_preferences
  drop constraint if exists weather_user_preferences_status_filter_mode_check;

alter table public.weather_user_preferences
  add constraint weather_user_preferences_status_filter_mode_check
    check (status_filter_mode is null or status_filter_mode in ('simple', 'detailed'));

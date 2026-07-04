-- Minimal stand-in for the Supabase-managed schemas so the project's
-- migrations and seed run on a plain Postgres 16. Mirrors the pieces
-- the app actually touches: auth.users + auth.uid(), storage buckets/
-- objects + foldername(), and the anon/authenticated roles.

create extension if not exists pgcrypto;

-- Roles
do $$ begin
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

-- auth schema
create schema if not exists auth;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  confirmation_token text,
  email_change text,
  email_change_token_new text,
  recovery_token text
);

-- Supabase resolves auth.uid() from the request JWT; here we read it
-- from a session GUC that tests set explicitly.
create or replace function auth.uid()
returns uuid as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$$ language sql stable;

-- storage schema
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[] as $$
  select (string_to_array(name, '/'))[1 : array_upper(string_to_array(name, '/'), 1) - 1];
$$ language sql immutable;

-- Client roles need schema access like Supabase grants them.
grant usage on schema public, auth, storage to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on functions to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
grant select, insert on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

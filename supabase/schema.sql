-- CozyHome schema
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- It is idempotent: safe to run more than once.
--
-- Every table is keyed to auth.uid() through row-level security, so one user
-- can never read or write another's rows even though the browser holds the
-- anon key. user_id defaults to auth.uid() so the client never has to set it.

-- ---------------------------------------------------------------- homes ----
--
-- A Home groups rooms. One account can have several.

create table if not exists public.homes (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name       text not null,
    photo      text,
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- rooms ----

create table if not exists public.rooms (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name           text not null,
    parent_room_id uuid references public.rooms(id) on delete cascade,
    -- SET NULL, not CASCADE: deleting a home must not wipe every room and item
    -- inside it. Rooms fall back to "No Home", which is recoverable.
    home_id        uuid references public.homes(id) on delete set null,
    photo          text,
    created_at     timestamptz not null default now()
);

-- For databases created before homes existed.
alter table public.rooms
    add column if not exists home_id uuid references public.homes(id) on delete set null;

-- ---------------------------------------------------------------- items ----

create table if not exists public.items (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name        text not null,
    description text not null default '',
    item_type   text not null default 'Other',
    -- cascade, not set null: deleting a room has always removed the items in
    -- it, and adding persistence must not silently change that
    room_id     uuid references public.rooms(id) on delete cascade,
    photo       text,
    created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------- projects ----

create table if not exists public.projects (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name         text not null,
    description  text not null default '',
    budget       numeric not null default 0,
    goal_date    text,
    is_completed boolean not null default false,
    completed_at timestamptz,
    -- Plain uuid[] rather than join tables: these are small, always read as a
    -- whole with the project, and never queried across users.
    room_ids     uuid[] not null default '{}',
    item_ids     uuid[] not null default '{}',
    options      jsonb not null default '[]',
    tasks        jsonb not null default '[]',
    is_diy       boolean not null default false,
    photo        text,
    created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------ diy items ----

create table if not exists public.diy_items (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
    project_id       uuid not null references public.projects(id) on delete cascade,
    name             text not null,
    description      text not null default '',
    purpose          text not null default '',
    is_owned         boolean not null default false,
    existing_item_id uuid references public.items(id) on delete set null,
    photo            text,
    options          jsonb not null default '[]',
    created_at       timestamptz not null default now()
);

-- ----------------------------------------------------------- preferences ----

create table if not exists public.preferences (
    user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
    theme      text not null default 'California Cabana',
    updated_at timestamptz not null default now()
);

-- ------------------------------------------------- constraint corrections ----
--
-- `create table if not exists` leaves an existing table alone, so column-level
-- changes need an explicit ALTER for databases created by an earlier run.

alter table public.items drop constraint if exists items_room_id_fkey;
alter table public.items add constraint items_room_id_fkey
    foreign key (room_id) references public.rooms(id) on delete cascade;

-- --------------------------------------------------------------- indexes ----

create index if not exists homes_user_idx        on public.homes (user_id);
create index if not exists rooms_user_idx        on public.rooms (user_id);
create index if not exists rooms_home_idx        on public.rooms (home_id);
create index if not exists rooms_parent_idx      on public.rooms (parent_room_id);
create index if not exists items_user_idx        on public.items (user_id);
create index if not exists items_room_idx        on public.items (room_id);
create index if not exists projects_user_idx     on public.projects (user_id);
create index if not exists diy_items_user_idx    on public.diy_items (user_id);
create index if not exists diy_items_project_idx on public.diy_items (project_id);

-- ------------------------------------------------------------------ RLS ----

alter table public.homes       enable row level security;
alter table public.rooms       enable row level security;
alter table public.items       enable row level security;
alter table public.projects    enable row level security;
alter table public.diy_items   enable row level security;
alter table public.preferences enable row level security;

-- One "own rows" policy per table covering select/insert/update/delete.
-- USING gates reads and the pre-image of writes; WITH CHECK gates the
-- post-image, which is what stops a user reassigning a row to someone else.
do $$
declare t text;
begin
    foreach t in array array['homes', 'rooms', 'items', 'projects', 'diy_items', 'preferences']
    loop
        execute format('drop policy if exists %I on public.%I', t || '_own_rows', t);
        execute format(
            'create policy %I on public.%I for all
                 to authenticated
                 using (auth.uid() = user_id)
                 with check (auth.uid() = user_id)',
            t || '_own_rows', t
        );
    end loop;
end $$;

-- Anonymous visitors get nothing. RLS with no permissive policy for the anon
-- role already denies everything, but revoking is explicit and cheap.
revoke all on public.homes, public.rooms, public.items, public.projects,
                public.diy_items, public.preferences
    from anon;

-- -------------------------------------------------------------- sharing ----
--
-- A Home or Project can be shared with another account, who then sees all of
-- its sub-data and can contribute. See supabase/sharing.sql for the full
-- definition; it is kept in its own file because it is long and self-contained.
--
-- Apply it after this file:
--   psql < supabase/schema.sql
--   psql < supabase/sharing.sql

-- --------------------------------------------------------- photo storage ----
--
-- The photo columns above hold a Storage path, not image bytes. Keeping
-- base64 in the row makes every list query drag megabytes of image data over
-- the wire; a path is ~40 bytes and the image is fetched only when shown.
--
-- The bucket is private. Objects are addressed as <user_id>/<kind>/<id>, and
-- the policy below checks the first path segment against auth.uid(), so one
-- user's photos are unreachable to another even with a valid session.
--
-- Note the name: this project already contains a generic `photos` bucket
-- belonging to another app, with anon read/write policies. An earlier version
-- of this file reused it and, worse, used `on conflict do update`, which
-- rewrote that bucket's configuration and took it private — breaking the other
-- app's public image URLs. Hence a dedicated bucket, and `do nothing`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'cozyhome-photos', 'cozyhome-photos', false, 8388608,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists cozyhome_photos_own_objects on storage.objects;
create policy cozyhome_photos_own_objects on storage.objects
    for all
    to authenticated
    using (
        bucket_id = 'cozyhome-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
        bucket_id = 'cozyhome-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
    );


-- ---------------------------------------------------------------------------
-- Manual ordering, for drag and drop.
--
-- position is a float rather than an integer so a row can be dropped between
-- two neighbours by taking their midpoint. That keeps a move to a single
-- UPDATE instead of renumbering everything after it — which matters because
-- every write goes through the offline queue, and renumbering a twenty-item
-- list would put twenty writes on it.
--
-- Backfilled from whatever order each list was displayed in, spaced 1024 apart
-- so there is room to insert without immediately needing tiny fractions. The
-- app respaces a list only if two neighbours ever get too close for a float to
-- sit between them.
-- ---------------------------------------------------------------------------

alter table public.homes    add column if not exists position double precision;
alter table public.rooms    add column if not exists position double precision;
alter table public.items    add column if not exists position double precision;
alter table public.projects add column if not exists position double precision;

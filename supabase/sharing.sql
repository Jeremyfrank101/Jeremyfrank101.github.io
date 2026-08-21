-- CozyHome sharing
--
-- Run AFTER schema.sql. Idempotent: safe to run more than once.
--
-- A Home or a Project can be shared with another account. The recipient sees
-- all of its sub-data (rooms, sub-rooms, items; project materials) and can
-- contribute to it. The owner keeps control of the container itself.
--
-- Who can do what:
--
--   action                         owner   collaborator
--   read the home/project            y          y
--   read its rooms/items/materials   y          y
--   add rooms/items/materials        y          y
--   edit the home/project row        y          y
--   delete the home/project          y          n
--   share it with someone else       y          n
--   take ownership                   n          n

-- ------------------------------------------------------------- profiles ----
-- auth.users is not readable by clients, so mirror the minimum needed to
-- resolve an email to an account and to show who you are sharing with.

create table if not exists public.profiles (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    email      text not null,
    username   text,
    updated_at timestamptz not null default now()
);

create or replace function public.sync_profile()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
    insert into public.profiles (user_id, email, username)
    values (new.id, new.email,
            coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)))
    on conflict (user_id) do update
        set email      = excluded.email,
            username   = coalesce(excluded.username, public.profiles.username),
            updated_at = now();
    return new;
end $$;

drop trigger if exists on_auth_user_profile on auth.users;
create trigger on_auth_user_profile
    after insert or update of email, raw_user_meta_data on auth.users
    for each row execute function public.sync_profile();

insert into public.profiles (user_id, email, username)
select id, email, coalesce(raw_user_meta_data->>'username', split_part(email, '@', 1))
from auth.users where email is not null
on conflict (user_id) do nothing;

-- --------------------------------------------------------------- shares ----

create table if not exists public.shares (
    id             uuid primary key default gen_random_uuid(),
    resource_type  text not null check (resource_type in ('home', 'project')),
    resource_id    uuid not null,
    owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
    shared_with_id uuid not null references auth.users(id) on delete cascade,
    created_at     timestamptz not null default now(),
    unique (resource_type, resource_id, shared_with_id),
    check (owner_id <> shared_with_id)
);

create index if not exists shares_resource_idx    on public.shares (resource_type, resource_id);
create index if not exists shares_shared_with_idx on public.shares (shared_with_id);
create index if not exists shares_owner_idx       on public.shares (owner_id);

-- -------------------------------------------------------- access helpers ----
-- SECURITY DEFINER so a policy on one table can consult another without
-- re-entering that table's own policy and recursing. search_path is pinned.

create or replace function public.can_access_home(h uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select h is not null and (
        exists (select 1 from public.homes where id = h and user_id = auth.uid())
        or exists (select 1 from public.shares
                   where resource_type = 'home' and resource_id = h
                     and shared_with_id = auth.uid())
    );
$$;

create or replace function public.can_access_project(p uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select p is not null and (
        exists (select 1 from public.projects where id = p and user_id = auth.uid())
        or exists (select 1 from public.shares
                   where resource_type = 'project' and resource_id = p
                     and shared_with_id = auth.uid())
    );
$$;

create or replace function public.can_access_room(r uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select r is not null and exists (
        select 1 from public.rooms rm
        where rm.id = r and (rm.user_id = auth.uid() or public.can_access_home(rm.home_id))
    );
$$;

create or replace function public.owns_resource(rtype text, rid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select case rtype
        when 'home'    then exists (select 1 from public.homes    where id = rid and user_id = auth.uid())
        when 'project' then exists (select 1 from public.projects where id = rid and user_id = auth.uid())
        else false
    end;
$$;

-- A function rather than SELECT on profiles, so one user cannot enumerate
-- every address in the database.
create or replace function public.find_user_by_email(p_email text)
returns table (user_id uuid, email text, username text)
language sql stable security definer set search_path = public, pg_temp as $$
    select p.user_id, p.email, p.username
    from public.profiles p
    where lower(p.email) = lower(trim(p_email)) and p.user_id <> auth.uid()
    limit 1;
$$;

grant execute on function public.find_user_by_email(text) to authenticated;

-- --------------------------------------------------- ownership is frozen ----
-- The policies below let a collaborator UPDATE rows they do not own. Without
-- this trigger they could set user_id to themselves and take the row.

create or replace function public.freeze_owner()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
    new.user_id := old.user_id;
    return new;
end $$;

do $$
declare t text;
begin
    foreach t in array array['homes', 'rooms', 'items', 'projects', 'diy_items']
    loop
        execute format('drop trigger if exists freeze_owner_trg on public.%I', t);
        execute format(
            'create trigger freeze_owner_trg before update on public.%I
                 for each row execute function public.freeze_owner()', t);
    end loop;
end $$;

-- ------------------------------------------------------------- policies ----

alter table public.profiles enable row level security;
alter table public.shares   enable row level security;

drop policy if exists profiles_visible on public.profiles;
create policy profiles_visible on public.profiles
    for select to authenticated
    using (
        user_id = auth.uid()
        or exists (
            select 1 from public.shares s
            where (s.owner_id = auth.uid()       and s.shared_with_id = profiles.user_id)
               or (s.shared_with_id = auth.uid() and s.owner_id       = profiles.user_id)
        )
    );

drop policy if exists shares_visible      on public.shares;
drop policy if exists shares_owner_create on public.shares;
drop policy if exists shares_remove       on public.shares;

create policy shares_visible on public.shares for select to authenticated
    using (owner_id = auth.uid() or shared_with_id = auth.uid());
-- Only the owner invites; either side can end it (the recipient "leaves").
create policy shares_owner_create on public.shares for insert to authenticated
    with check (owner_id = auth.uid() and public.owns_resource(resource_type, resource_id));
create policy shares_remove on public.shares for delete to authenticated
    using (owner_id = auth.uid() or shared_with_id = auth.uid());

-- Containers: read and edit shared, create and delete stay with the owner.
drop policy if exists homes_own_rows on public.homes;
drop policy if exists homes_read on public.homes;
drop policy if exists homes_insert on public.homes;
drop policy if exists homes_update on public.homes;
drop policy if exists homes_delete on public.homes;

create policy homes_read   on public.homes for select to authenticated
    using (user_id = auth.uid() or public.can_access_home(id));
create policy homes_insert on public.homes for insert to authenticated
    with check (user_id = auth.uid());
create policy homes_update on public.homes for update to authenticated
    using (user_id = auth.uid() or public.can_access_home(id))
    with check (user_id = auth.uid() or public.can_access_home(id));
create policy homes_delete on public.homes for delete to authenticated
    using (user_id = auth.uid());

drop policy if exists projects_own_rows on public.projects;
drop policy if exists projects_read on public.projects;
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;

create policy projects_read   on public.projects for select to authenticated
    using (user_id = auth.uid() or public.can_access_project(id));
create policy projects_insert on public.projects for insert to authenticated
    with check (user_id = auth.uid());
create policy projects_update on public.projects for update to authenticated
    using (user_id = auth.uid() or public.can_access_project(id))
    with check (user_id = auth.uid() or public.can_access_project(id));
create policy projects_delete on public.projects for delete to authenticated
    using (user_id = auth.uid());

-- Contents of a shared container are fully collaborative.
drop policy if exists rooms_own_rows on public.rooms;
create policy rooms_own_rows on public.rooms for all to authenticated
    using (user_id = auth.uid() or public.can_access_home(home_id))
    with check (user_id = auth.uid() or public.can_access_home(home_id));

drop policy if exists items_own_rows on public.items;
create policy items_own_rows on public.items for all to authenticated
    using (user_id = auth.uid() or public.can_access_room(room_id))
    with check (user_id = auth.uid() or public.can_access_room(room_id));

drop policy if exists diy_items_own_rows on public.diy_items;
create policy diy_items_own_rows on public.diy_items for all to authenticated
    using (user_id = auth.uid() or public.can_access_project(project_id))
    with check (user_id = auth.uid() or public.can_access_project(project_id));

revoke all on public.profiles, public.shares from anon;

-- -------------------------------------------------------- shared photos ----
-- Photos live at <user_id>/<kind>/<record_id>. Matching only the first segment
-- against auth.uid() would leave a collaborator seeing a shared home but none
-- of its pictures, so authorise by the record instead.

create or replace function public.can_access_photo(kind text, rid text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare uid uuid;
begin
    if rid !~ '^[0-9a-fA-F-]{36}$' then
        return false;               -- never raise from inside a policy
    end if;
    uid := rid::uuid;

    return case kind
        when 'homes'    then public.can_access_home(uid)
        when 'rooms'    then public.can_access_room(uid)
        when 'projects' then public.can_access_project(uid)
        when 'items'    then exists (
            select 1 from public.items i
            where i.id = uid and (i.user_id = auth.uid() or public.can_access_room(i.room_id)))
        when 'diyItems' then exists (
            select 1 from public.diy_items d
            where d.id = uid and (d.user_id = auth.uid() or public.can_access_project(d.project_id)))
        else false
    end;
exception when others then
    return false;
end $$;

drop policy if exists cozyhome_photos_own_objects on storage.objects;
drop policy if exists cozyhome_photos_access      on storage.objects;

create policy cozyhome_photos_access on storage.objects
    for all to authenticated
    using (
        bucket_id = 'cozyhome-photos'
        and (
            (storage.foldername(name))[1] = auth.uid()::text
            or public.can_access_photo((storage.foldername(name))[2], storage.filename(name))
        )
    )
    with check (
        -- Writes always land under your own prefix, shared or not.
        bucket_id = 'cozyhome-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- ------------------------------------------------ "keep private for me" ----
-- Applied 2026-08: rooms and items in a shared home are household-visible by
-- default; this flag opts a single record out. These definitions supersede the
-- rooms/items policies and can_access_room above.

alter table public.rooms add column if not exists is_private boolean not null default false;
alter table public.items add column if not exists is_private boolean not null default false;

create or replace function public.can_access_room(r uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select r is not null and exists (
        select 1 from public.rooms rm
        where rm.id = r
          and (rm.user_id = auth.uid()
               or (not rm.is_private and public.can_access_home(rm.home_id)))
    );
$$;

drop policy if exists rooms_own_rows on public.rooms;
create policy rooms_own_rows on public.rooms for all to authenticated
    using (user_id = auth.uid() or (not is_private and public.can_access_home(home_id)))
    with check (user_id = auth.uid() or (not is_private and public.can_access_home(home_id)));

drop policy if exists items_own_rows on public.items;
create policy items_own_rows on public.items for all to authenticated
    using (user_id = auth.uid() or (not is_private and public.can_access_room(room_id)))
    with check (user_id = auth.uid() or (not is_private and public.can_access_room(room_id)));

-- --------------------------------------------------------- project notes ----
-- A shared log of what has been done. Everyone with access to the project sees
-- the whole history; each note records its author and time.

create table if not exists public.project_notes (
    id         uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
    body       text not null,
    created_at timestamptz not null default now()
);

create index if not exists project_notes_project_idx on public.project_notes (project_id, created_at desc);
create index if not exists project_notes_user_idx    on public.project_notes (user_id);

alter table public.project_notes enable row level security;

drop policy if exists project_notes_read   on public.project_notes;
drop policy if exists project_notes_insert on public.project_notes;
drop policy if exists project_notes_modify on public.project_notes;
drop policy if exists project_notes_delete on public.project_notes;

-- Read the whole log if you can see the project; write only under your own
-- name; edit and delete stay with the author, so nobody can rewrite another
-- person's record of what happened.
create policy project_notes_read on public.project_notes
    for select to authenticated using (public.can_access_project(project_id));
create policy project_notes_insert on public.project_notes
    for insert to authenticated
    with check (user_id = auth.uid() and public.can_access_project(project_id));
create policy project_notes_modify on public.project_notes
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy project_notes_delete on public.project_notes
    for delete to authenticated using (user_id = auth.uid());

revoke all on public.project_notes from anon;

-- ============================================================ cozyhealth ----
-- The web build of CozyHealth. See supabase/cozyhealth.sql.

-- CozyHealth (web)
--
-- The cozyhealth schema was built for an iOS app: rows keyed on a device_id,
-- and every table carrying `anon ALL using(true)` — readable and writable by
-- anyone holding the anon key, which is published in this repo. That is not a
-- posture to ship weight, mood and journal entries on.
--
-- This adds owner_id (defaulting to auth.uid()) to every user-scoped table and
-- replaces the open policies with owner-scoped ones. The original device_id and
-- user_id columns are left untouched, so the iOS app's rows are preserved.
--
-- To restore the old open policies for the iOS app (NOT recommended while real
-- data is present):
--   create policy "anon all" on cozyhealth.<table> for all to anon using (true);

alter table cozyhealth.user_profiles        add column if not exists owner_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table cozyhealth.profile_measurements add column if not exists owner_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table cozyhealth.achievements         add column if not exists owner_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table cozyhealth.meal_entries         add column if not exists owner_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table cozyhealth.workouts             add column if not exists owner_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table cozyhealth.mind_entries         add column if not exists owner_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table cozyhealth.meditation_sessions  add column if not exists owner_id uuid default auth.uid() references auth.users(id) on delete cascade;

create index if not exists ch_profiles_owner_idx     on cozyhealth.user_profiles (owner_id);
create index if not exists ch_measurements_owner_idx on cozyhealth.profile_measurements (owner_id, date desc);
create index if not exists ch_achievements_owner_idx on cozyhealth.achievements (owner_id);
create index if not exists ch_meals_owner_idx        on cozyhealth.meal_entries (owner_id, date desc);
create index if not exists ch_workouts_owner_idx     on cozyhealth.workouts (owner_id, date desc);
create index if not exists ch_mind_owner_idx         on cozyhealth.mind_entries (owner_id, date desc);
create index if not exists ch_meditation_owner_idx   on cozyhealth.meditation_sessions (owner_id, date desc);

do $$
declare t text;
begin
    foreach t in array array['user_profiles','profile_measurements','achievements',
                             'meal_entries','workouts','mind_entries','meditation_sessions']
    loop
        execute format('drop policy if exists %I on cozyhealth.%I', 'anon all', t);
        execute format('drop policy if exists %I on cozyhealth.%I', t || '_own', t);
        execute format(
            'create policy %I on cozyhealth.%I for all
                 to authenticated
                 using (owner_id = auth.uid())
                 with check (owner_id = auth.uid())',
            t || '_own', t);
        execute format('revoke all on cozyhealth.%I from anon', t);
    end loop;
end $$;

-- Children reach their owner through the parent workout.
create or replace function cozyhealth.owns_workout(w uuid)
returns boolean language sql stable security definer set search_path = cozyhealth, public, pg_temp as $$
    select exists (select 1 from cozyhealth.workouts where id = w and owner_id = auth.uid());
$$;

create or replace function cozyhealth.owns_exercise(e uuid)
returns boolean language sql stable security definer set search_path = cozyhealth, public, pg_temp as $$
    select exists (
        select 1 from cozyhealth.exercises ex
        join cozyhealth.workouts w on w.id = ex.workout_id
        where ex.id = e and w.owner_id = auth.uid());
$$;

drop policy if exists "anon all" on cozyhealth.exercises;
drop policy if exists exercises_own on cozyhealth.exercises;
create policy exercises_own on cozyhealth.exercises for all to authenticated
    using (cozyhealth.owns_workout(workout_id)) with check (cozyhealth.owns_workout(workout_id));

drop policy if exists "anon all" on cozyhealth.yoga_poses;
drop policy if exists yoga_poses_own on cozyhealth.yoga_poses;
create policy yoga_poses_own on cozyhealth.yoga_poses for all to authenticated
    using (cozyhealth.owns_workout(workout_id)) with check (cozyhealth.owns_workout(workout_id));

drop policy if exists "anon all" on cozyhealth.exercise_sets;
drop policy if exists exercise_sets_own on cozyhealth.exercise_sets;
create policy exercise_sets_own on cozyhealth.exercise_sets for all to authenticated
    using (cozyhealth.owns_exercise(exercise_id)) with check (cozyhealth.owns_exercise(exercise_id));

revoke all on cozyhealth.exercises, cozyhealth.yoga_poses, cozyhealth.exercise_sets from anon;

-- generic_meals is a shared reference library: readable by signed-in users,
-- writable by nobody through the API.
drop policy if exists "anon read" on cozyhealth.generic_meals;
drop policy if exists generic_meals_read on cozyhealth.generic_meals;
create policy generic_meals_read on cozyhealth.generic_meals for select to authenticated using (true);
revoke all on cozyhealth.generic_meals from anon;

grant usage on schema cozyhealth to authenticated;
grant select, insert, update, delete on all tables in schema cozyhealth to authenticated;

-- Claiming existing device-keyed rows for an account (run once, per person):
--   update cozyhealth.meal_entries set owner_id = '<uuid>' where owner_id is null;
--   ... and the same for workouts, mind_entries, meditation_sessions,
--   profile_measurements and achievements.

-- ------------------------------------------------------ sharing a log ----
-- Read only for the viewer: you look at a partner's stats, you do not log
-- meals on their behalf. resource_id is the sharer's own user id.

alter table public.shares drop constraint if exists shares_resource_type_check;
alter table public.shares add constraint shares_resource_type_check
    check (resource_type in ('home', 'project', 'health'));

create or replace function public.can_view_health(owner uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select owner is not null and (
        owner = auth.uid()
        or exists (select 1 from public.shares
                   where resource_type = 'health' and resource_id = owner
                     and shared_with_id = auth.uid())
    );
$$;

-- Each table gets a read policy that honours shares and a write policy that
-- stays with the owner.
do $$
declare t text;
begin
    foreach t in array array['user_profiles','profile_measurements','achievements',
                             'meal_entries','workouts','mind_entries','meditation_sessions']
    loop
        execute format('drop policy if exists %I on cozyhealth.%I', t || '_own', t);
        execute format('drop policy if exists %I on cozyhealth.%I', t || '_read', t);
        execute format('drop policy if exists %I on cozyhealth.%I', t || '_write', t);
        execute format('create policy %I on cozyhealth.%I for select to authenticated
                            using (public.can_view_health(owner_id))', t || '_read', t);
        execute format('create policy %I on cozyhealth.%I for all to authenticated
                            using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
                       t || '_write', t);
    end loop;
end $$;

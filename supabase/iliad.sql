-- Wrath (Iliad) leaderboard.
-- A run is one attempt at a hero's arc through the poem.

create table if not exists public.iliad_runs (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
    username   text not null,
    hero       text not null,
    stage      integer not null default 0,   -- foes defeated
    kleos      integer not null default 0,   -- glory score
    victory    boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists iliad_board_idx on public.iliad_runs (stage desc, kleos desc);
create index if not exists iliad_user_idx  on public.iliad_runs (user_id, created_at desc);

alter table public.iliad_runs enable row level security;

-- A leaderboard is meant to be seen: any signed-in player reads every run.
-- You may only write runs under your own name, and nobody edits history.
drop policy if exists iliad_runs_read   on public.iliad_runs;
drop policy if exists iliad_runs_insert on public.iliad_runs;
drop policy if exists iliad_runs_delete on public.iliad_runs;

create policy iliad_runs_read on public.iliad_runs for select to authenticated using (true);
create policy iliad_runs_insert on public.iliad_runs for insert to authenticated
    with check (user_id = auth.uid());
create policy iliad_runs_delete on public.iliad_runs for delete to authenticated
    using (user_id = auth.uid());

revoke all on public.iliad_runs from anon;

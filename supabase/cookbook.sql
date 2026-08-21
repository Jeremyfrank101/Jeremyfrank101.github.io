-- CozyCookBook.
--
-- This schema was created by the iOS app, not by this repo; it is recorded
-- here because the web client depends on its exact shape. Note the schema
-- name is capitalised — PostgREST matches it literally, so the browser must
-- call schema('CozyCookBookSchema'), not the lower-cased form.
--
--   folders          a cookbook. owned by user_id.
--   recipes          belongs to a folder. ingredients and steps are JSON
--                    arrays of {id, name|text, isChecked}, with uppercase
--                    UUID ids as written by the iOS client.
--   cookbook_shares  invites another account to a whole folder.
--                    status is 'pending' until the recipient accepts.
--
-- image_data (bytea) exists on recipes but is unused by the web client and
-- is never written by it.

-- ---------------------------------------------------------------------------
-- Row-level security as it stands. Owners manage their own rows; recipients
-- get read-only access to a folder and its recipes once they have accepted.
-- ---------------------------------------------------------------------------

-- folders
--   Owners manage own folders   ALL     using/check (auth.uid() = user_id)
--   Recipients read shared folders SELECT
--       using (id in (select folder_id from cookbook_shares
--                      where shared_with = auth.uid() and status = 'accepted'))
--
-- recipes
--   Owners manage own recipes   ALL     using/check (auth.uid() = user_id)
--   Recipients read shared recipes SELECT
--       using (folder_id in (select folder_id from cookbook_shares
--                             where shared_with = auth.uid() and status = 'accepted'))
--
-- cookbook_shares
--   Users see own shares        SELECT  (auth.uid() = owner_id or auth.uid() = shared_with)
--   Owner can share folders     INSERT  check (auth.uid() = owner_id)
--   Recipient can respond       UPDATE  using/check (auth.uid() = shared_with)
--   Either party can remove     DELETE  (auth.uid() = owner_id or auth.uid() = shared_with)


-- ---------------------------------------------------------------------------
-- Applied by this repo: let a cookbook share reveal a collaborator's name.
--
-- profiles_visible previously only knew about public.shares, the table behind
-- CozyHome and CozyHealth sharing, so people you shared a cookbook with
-- rendered as "someone". This adds cookbook_shares as a third way to be
-- introduced, and nothing else.
--
-- The nested select is itself subject to cookbook_shares' RLS, which limits a
-- user to rows where they are the owner or the recipient, so it cannot be
-- used to enumerate anyone else. cookbook_shares' policies do not reference
-- profiles, so there is no recursion.
-- ---------------------------------------------------------------------------

drop policy if exists profiles_visible on public.profiles;
create policy profiles_visible on public.profiles for select
using (
    user_id = auth.uid()
    or exists (
        select 1 from public.shares s
        where (s.owner_id = auth.uid() and s.shared_with_id = profiles.user_id)
           or (s.shared_with_id = auth.uid() and s.owner_id = profiles.user_id)
    )
    or exists (
        select 1 from "CozyCookBookSchema".cookbook_shares c
        where (c.owner_id = auth.uid() and c.shared_with = profiles.user_id)
           or (c.shared_with = auth.uid() and c.owner_id = profiles.user_id)
    )
);

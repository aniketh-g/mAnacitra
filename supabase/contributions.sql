-- Run once in the Supabase SQL Editor. Nothing grants reviewer access automatically.
begin;
create table public.manacitra_reviewers (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.manacitra_reviewers enable row level security;
revoke all on public.manacitra_reviewers from anon, authenticated;
create function public.manacitra_is_reviewer() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.manacitra_reviewers where user_id = (select auth.uid()));
$$;
revoke all on function public.manacitra_is_reviewer() from public, anon;
grant execute on function public.manacitra_is_reviewer() to authenticated;
create table public.manacitra_suggestions (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null default auth.uid() references auth.users(id),
 dataset text not null check(dataset in ('cities','countries','rivers')),
 record_id text not null check(length(record_id) between 1 and 200),
 title text not null check(length(title) between 1 and 300),
 reason text not null check(length(reason) between 1 and 4000),
 base jsonb not null check(jsonb_typeof(base)='object'),
 proposed jsonb not null check(jsonb_typeof(proposed)='object'),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 review_note text not null default '' check(length(review_note)<=4000),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewer_id uuid references auth.users(id),
 check(octet_length(base::text)+octet_length(proposed::text)<=1000000),
 check(base <> proposed)
);
create function public.manacitra_suggestion_author_name(suggestion_id uuid)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
 author_name text;
begin
 if not public.manacitra_is_reviewer() then
  raise exception 'Reviewer access required';
 end if;

 select coalesce(
   nullif(u.raw_user_meta_data->>'full_name', ''),
   nullif(u.raw_user_meta_data->>'name', ''),
   'Unknown contributor'
 )
 into author_name
 from public.manacitra_suggestions s
 join auth.users u on u.id=s.author_id
 where s.id=suggestion_id;

 if author_name is null then
  raise exception 'Suggestion not found';
 end if;

 return author_name;
end;
$$;

revoke all on function public.manacitra_suggestion_author_name(uuid)
from public, anon;

grant execute on function public.manacitra_suggestion_author_name(uuid)
to authenticated;
create index on public.manacitra_suggestions(created_at desc, id);
alter table public.manacitra_suggestions enable row level security;
revoke all on public.manacitra_suggestions from anon, authenticated;
grant select on public.manacitra_suggestions to authenticated;
grant insert(dataset, record_id, title, reason, base, proposed) on public.manacitra_suggestions to authenticated;
create policy signed_in_read on public.manacitra_suggestions for select to authenticated
 using ((select auth.uid()) is not null and coalesce((select auth.jwt())->>'is_anonymous','false') = 'false');
create policy signed_in_submit on public.manacitra_suggestions for insert to authenticated
 with check(author_id=(select auth.uid()) and status='pending' and review_note='' and reviewer_id is null and reviewed_at is null
 and coalesce((select auth.jwt())->>'is_anonymous','false') = 'false');
-- Review is a narrowly scoped operation; clients cannot rewrite a proposal or its author.
create function public.manacitra_review(suggestion_id uuid, decision text, note text default '')
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.manacitra_is_reviewer() then raise exception 'Reviewer access required'; end if;

 if decision not in ('pending','approved','rejected') then
  raise exception 'Invalid decision';
 end if;

 if decision='pending' then
  update public.manacitra_suggestions
  set status='pending',
      review_note='',
      reviewed_at=null,
      reviewer_id=null
  where id=suggestion_id
    and status in ('approved','rejected');

  if not found then
   raise exception 'Suggestion is already pending or missing';
  end if;

 else
  update public.manacitra_suggestions
  set status=decision,
      review_note=note,
      reviewed_at=now(),
      reviewer_id=auth.uid()
  where id=suggestion_id
    and status='pending';

  if not found then
   raise exception 'Suggestion already reviewed or missing';
  end if;
 end if;
end;
$$;
revoke all on function public.manacitra_review(uuid,text,text) from public, anon;
grant execute on function public.manacitra_review(uuid,text,text) to authenticated;
create function public.manacitra_delete_suggestion(suggestion_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
 if not public.manacitra_is_reviewer() then
  raise exception 'Reviewer access required';
 end if;

 delete from public.manacitra_suggestions
 where id=suggestion_id;

 if not found then
  raise exception 'Suggestion not found';
 end if;
end;
$$;

revoke all on function public.manacitra_delete_suggestion(uuid) from public, anon;
grant execute on function public.manacitra_delete_suggestion(uuid) to authenticated;
commit;
-- AFTER you create and confirm your own account, run separately with your email:
-- insert into public.manacitra_reviewers(user_id)
-- select id from auth.users where email='YOUR_EMAIL' on conflict do nothing;

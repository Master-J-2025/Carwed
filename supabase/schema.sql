create extension if not exists pgcrypto;

create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  attachment_path text,
  attachment_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.letters enable row level security;

create or replace function public.is_letter_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
$$;

revoke all on function public.is_letter_admin() from public;
grant execute on function public.is_letter_admin() to authenticated;

grant select, insert, update, delete on public.letters to authenticated;

drop policy if exists "Authenticated users can read letters" on public.letters;
create policy "Authenticated users can read letters"
  on public.letters for select to authenticated
  using (true);

drop policy if exists "Admins can create letters" on public.letters;
create policy "Admins can create letters"
  on public.letters for insert to authenticated
  with check (public.is_letter_admin());

drop policy if exists "Admins can update letters" on public.letters;
create policy "Admins can update letters"
  on public.letters for update to authenticated
  using (public.is_letter_admin())
  with check (public.is_letter_admin());

drop policy if exists "Admins can delete letters" on public.letters;
create policy "Admins can delete letters"
  on public.letters for delete to authenticated
  using (public.is_letter_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'letters',
  'letters',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'text/plain',
    'text/rtf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can read letter files" on storage.objects;
create policy "Authenticated users can read letter files"
  on storage.objects for select to authenticated
  using (bucket_id = 'letters');

drop policy if exists "Admins can upload letter files" on storage.objects;
create policy "Admins can upload letter files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'letters' and public.is_letter_admin());

drop policy if exists "Admins can update letter files" on storage.objects;
create policy "Admins can update letter files"
  on storage.objects for update to authenticated
  using (bucket_id = 'letters' and public.is_letter_admin())
  with check (bucket_id = 'letters' and public.is_letter_admin());

drop policy if exists "Admins can delete letter files" on storage.objects;
create policy "Admins can delete letter files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'letters' and public.is_letter_admin());

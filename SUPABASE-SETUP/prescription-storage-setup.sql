-- Sahodara Pharmacy: secure Prescription Storage setup
-- Run this ONCE in the Supabase SQL Editor.
-- The bucket is private because prescription images can contain sensitive health information.

insert into storage.buckets (id, name, public)
values ('prescriptions', 'prescriptions', false)
on conflict (id) do update set public = false;

-- Remove old policies if they were created previously.
drop policy if exists "Customers can upload own prescriptions" on storage.objects;
drop policy if exists "Customers can view own prescriptions" on storage.objects;
drop policy if exists "Customers can update own prescriptions" on storage.objects;
drop policy if exists "Customers can delete own prescriptions" on storage.objects;

create policy "Customers can upload own prescriptions"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'prescriptions'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Customers can view own prescriptions"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'prescriptions'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Customers can update own prescriptions"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'prescriptions'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'prescriptions'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Customers can delete own prescriptions"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'prescriptions'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- Optional but recommended: only allow common prescription formats.
-- This does not replace client-side validation.
-- You can also restrict file size from Storage settings in the Supabase dashboard.


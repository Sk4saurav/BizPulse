-- Phase 3: Supabase Schema Outline for BizPulse

-- 1. Users Table (handled natively by supabase.auth.users but we will attach profile info here)
create table profiles (
  id uuid references auth.users not null primary key,
  company_name text,
  subscription_status text default 'inactive', -- active, halted, cancelled
  razorpay_subscription_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Reports Table
create table reports (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users,   -- nullable until auth is wired
  job_id text unique,
  status text default 'queued', -- queued, processing, complete, failed
  original_filename text,
  score integer,
  pdf_url text,
  expires_at timestamp with time zone default (timezone('utc'::text, now()) + interval '90 days'), -- DPDP liability mitigation
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS)
alter table profiles enable row level security;
alter table reports enable row level security;

-- Policies: Users can only see their own reports
create policy "Users can view their own reports" on reports for select using (auth.uid() = user_id);
create policy "Users can insert their own reports" on reports for insert with check (auth.uid() = user_id);

-- Storage: Setup bucket for uploads
-- insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false);
-- insert into storage.buckets (id, name, public) values ('reports', 'reports', true); -- Or signed URLs

-- Add index for fast job_id lookups
create index reports_job_id_idx on reports(job_id);

-- RLS Policy for storage bucket:
create policy "Service role can upload reports"
  on storage.objects for insert
  with check (bucket_id = 'bizpulse-reports');

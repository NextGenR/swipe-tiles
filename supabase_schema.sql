-- ============================================================================
-- SUPABASE POSTGRESQL SCHEMA: UPSC PSIR VALUE ADDITION SWIPE SYSTEM (GOOD / BAD)
-- ============================================================================
-- Tinder-style Binary Swipe Feedback:
-- Swipe Left  = BAD (Pass / Dislike)
-- Swipe Right = GOOD (Keep / Like / Elite 300+ Value Addition)

-- 1. Enable UUID Extension
create extension if not exists "uuid-ossp";

-- 2. Master Table: Individual User Ratings & Feedback
create table if not exists public.value_addition_ratings (
    id uuid primary key default gen_random_uuid(),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    card_id text not null,
    copy_id text not null,
    topper_name text,
    air text,
    category text not null, -- 'phrase', 'framework', 'scholar', 'hook', 'exit', 'terminology', 'value_addition'
    content_title text not null,
    content_quote text,
    author_attribution text,
    context text,
    syllabus_domain text,
    question_ref text,
    rating text not null check (rating in ('good', 'bad')),
    feedback_tags text[] default '{}',
    user_note text,
    session_id text not null,
    user_id uuid references auth.users(id) on delete set null,
    client_metadata jsonb default '{}'::jsonb
);

-- 3. Aggregated Table: Real-Time Card Performance Cache & Leaderboard
create table if not exists public.value_addition_card_stats (
    card_id text primary key,
    content_title text,
    author_attribution text,
    category text,
    copy_id text,
    total_votes int default 0 not null,
    good_votes int default 0 not null,
    bad_votes int default 0 not null,
    good_percentage numeric(5, 2) default 0.00 not null,
    last_rated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. High-Performance Query Indexes
create index if not exists idx_va_ratings_card_id on public.value_addition_ratings (card_id);
create index if not exists idx_va_ratings_copy_id on public.value_addition_ratings (copy_id);
create index if not exists idx_va_ratings_category on public.value_addition_ratings (category);
create index if not exists idx_va_ratings_rating on public.value_addition_ratings (rating);
create index if not exists idx_va_ratings_created_at on public.value_addition_ratings (created_at desc);
create index if not exists idx_va_ratings_session_id on public.value_addition_ratings (session_id);
create index if not exists idx_va_stats_good_pct on public.value_addition_card_stats (good_percentage desc, total_votes desc);

-- 5. Row Level Security (RLS) Configuration
alter table public.value_addition_ratings enable row level security;
alter table public.value_addition_card_stats enable row level security;

-- Policy 1: Allow public/anonymous visitors to submit ratings
drop policy if exists "Allow anonymous rating insertion" on public.value_addition_ratings;
create policy "Allow anonymous rating insertion"
on public.value_addition_ratings
for insert
to anon, authenticated
with check (true);

-- Policy 2: Allow all users to read individual ratings
drop policy if exists "Allow reading all ratings" on public.value_addition_ratings;
create policy "Allow reading all ratings"
on public.value_addition_ratings
for select
to anon, authenticated
using (true);

-- Policy 3: Allow all users to read aggregate card stats (for live leaderboard)
drop policy if exists "Allow reading card stats" on public.value_addition_card_stats;
create policy "Allow reading card stats"
on public.value_addition_card_stats
for select
to anon, authenticated
using (true);

-- Policy 4: Allow system triggers to upsert card stats
drop policy if exists "Allow updating card stats" on public.value_addition_card_stats;
create policy "Allow updating card stats"
on public.value_addition_card_stats
for all
to anon, authenticated
using (true)
with check (true);

-- 6. Real-Time Trigger Function: Auto-Calculates Good/Bad Distribution
create or replace function public.handle_new_rating()
returns trigger as $$
begin
    insert into public.value_addition_card_stats (
        card_id,
        content_title,
        author_attribution,
        category,
        copy_id,
        total_votes,
        good_votes,
        bad_votes,
        good_percentage,
        last_rated_at
    )
    values (
        new.card_id,
        new.content_title,
        new.author_attribution,
        new.category,
        new.copy_id,
        1,
        case when new.rating = 'good' then 1 else 0 end,
        case when new.rating = 'bad' then 1 else 0 end,
        case when new.rating = 'good' then 100.00 else 0.00 end,
        now()
    )
    on conflict (card_id) do update set
        content_title = coalesce(excluded.content_title, public.value_addition_card_stats.content_title),
        author_attribution = coalesce(excluded.author_attribution, public.value_addition_card_stats.author_attribution),
        category = coalesce(excluded.category, public.value_addition_card_stats.category),
        copy_id = coalesce(excluded.copy_id, public.value_addition_card_stats.copy_id),
        total_votes = public.value_addition_card_stats.total_votes + 1,
        good_votes = public.value_addition_card_stats.good_votes + case when new.rating = 'good' then 1 else 0 end,
        bad_votes = public.value_addition_card_stats.bad_votes + case when new.rating = 'bad' then 1 else 0 end,
        good_percentage = round(
            ( (public.value_addition_card_stats.good_votes + case when new.rating = 'good' then 1 else 0 end)::numeric / 
              (public.value_addition_card_stats.total_votes + 1)::numeric ) * 100,
            2
        ),
        last_rated_at = now();
    return new;
end;
$$ language plpgsql security definer;

-- Bind Trigger to Ratings Table
drop trigger if exists on_rating_created on public.value_addition_ratings;
create trigger on_rating_created
after insert on public.value_addition_ratings
for each row execute function public.handle_new_rating();

-- 7. Analytics Views for Admin & Student Insights
-- View A: Top Rated Tiles (Ranked by Good Rating Percentage)
create or replace view public.v_top_rated_tiles as
select 
    card_id,
    content_title,
    author_attribution,
    category,
    copy_id,
    total_votes,
    good_votes,
    bad_votes,
    good_percentage,
    last_rated_at
from public.value_addition_card_stats
where total_votes >= 1
order by good_percentage desc, total_votes desc;

-- View B: Copy Performance Summary (Which topper copy has highest approval rate)
create or replace view public.v_copy_performance_summary as
select 
    copy_id,
    count(distinct card_id) as total_unique_cards_rated,
    count(*) as total_feedback_submissions,
    count(*) filter (where rating = 'good') as total_good_votes,
    count(*) filter (where rating = 'bad') as total_bad_votes,
    round((count(*) filter (where rating = 'good')::numeric / nullif(count(*), 0)) * 100, 1) as copy_approval_pct
from public.value_addition_ratings
group by copy_id
order by copy_approval_pct desc, total_feedback_submissions desc;

-- View C: Category Breakdown (Phrases vs Frameworks vs Hooks vs Scholars)
create or replace view public.v_category_breakdown as
select 
    category,
    count(*) as total_ratings,
    count(*) filter (where rating = 'good') as good_count,
    count(*) filter (where rating = 'bad') as bad_count,
    round((count(*) filter (where rating = 'good')::numeric / nullif(count(*), 0)) * 100, 1) as category_approval_pct
from public.value_addition_ratings
group by category
order by category_approval_pct desc;

-- 8. Stored Procedure for Safe Client RPC Rating Submission
create or replace function public.submit_card_rating(
    p_card_id text,
    p_copy_id text,
    p_topper_name text,
    p_air text,
    p_category text,
    p_content_title text,
    p_content_quote text,
    p_author_attribution text,
    p_context text,
    p_syllabus_domain text,
    p_question_ref text,
    p_rating text, -- 'good' or 'bad'
    p_feedback_tags text[],
    p_user_note text,
    p_session_id text,
    p_client_metadata jsonb default '{}'::jsonb
)
returns jsonb as $$
declare
    v_new_id uuid;
begin
    -- Validate rating value
    if p_rating not in ('good', 'bad') then
        return jsonb_build_object('success', false, 'error', 'Rating must be either good or bad');
    end if;

    insert into public.value_addition_ratings (
        card_id,
        copy_id,
        topper_name,
        air,
        category,
        content_title,
        content_quote,
        author_attribution,
        context,
        syllabus_domain,
        question_ref,
        rating,
        feedback_tags,
        user_note,
        session_id,
        client_metadata
    ) values (
        p_card_id,
        p_copy_id,
        p_topper_name,
        p_air,
        p_category,
        p_content_title,
        p_content_quote,
        p_author_attribution,
        p_context,
        p_syllabus_domain,
        p_question_ref,
        p_rating,
        p_feedback_tags,
        p_user_note,
        p_session_id,
        coalesce(p_client_metadata, '{}'::jsonb)
    )
    returning id into v_new_id;

    return jsonb_build_object(
        'success', true,
        'rating_id', v_new_id,
        'card_id', p_card_id,
        'rating', p_rating,
        'message', 'Rating submitted and synced successfully'
    );
end;
$$ language plpgsql security definer;

-- Grant Execution Rights to Anonymous and Authenticated Roles
grant execute on function public.submit_card_rating to anon, authenticated;
grant select on public.v_top_rated_tiles to anon, authenticated;
grant select on public.v_copy_performance_summary to anon, authenticated;
grant select on public.v_category_breakdown to anon, authenticated;

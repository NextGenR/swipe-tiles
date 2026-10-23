# 📱 UPSC PSIR Topper Value Addition: Swipe & Rate System (Tinder-Style + Supabase)

An interactive, touch-optimized swipe application for UPSC PSIR topper value addition points.
- **👈 Swipe Left**: Rate as **BAD** (Pass / Dislike)
- **👉 Swipe Right**: Rate as **GOOD** (Keep / Like / Elite 300+ Value Addition)

All ratings, approval rates, and community feedback are synced in real-time to a **Supabase PostgreSQL** cloud database.

---

## 🎮 How Swiping Works

1. **Touch / Mouse Drag**:
   - Drag card to the **Left** ($\le -70\text{px}$) $\rightarrow$ Animated red **BAD** stamp activates, card flies out left, records **BAD** vote.
   - Drag card to the **Right** ($\ge 70\text{px}$) $\rightarrow$ Animated green **GOOD** stamp activates, card flies out right, records **GOOD** vote.
2. **Tactile Bottom Action Buttons**:
   - ❌ **Red Button**: Rate as BAD and swipe left.
   - ↩️ **Undo Button**: Return to previous card.
   - 💚 **Green Button**: Rate as GOOD and swipe right.
3. **Keyboard Shortcuts**:
   - `←` (Left Arrow): Rate as BAD.
   - `→` (Right Arrow): Rate as GOOD.
   - `Z`: Undo previous swipe.
4. **First Card Gesture Hint**:
   - On the very first card, an animated prompt (`⟵ Swipe Left (BAD) • Swipe Right (GOOD) ⟶`) guides the user.
   - Dismisses immediately on your first swipe or interaction and never appears again.

---

## 🚀 Supabase Setup (3 Minutes)

### Step 1: Create a Free Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a free project.

### Step 2: Run the SQL Schema
1. In your Supabase Dashboard, go to **SQL Editor** $\rightarrow$ **New Query**.
2. Copy and paste the entire contents of [`supabase_schema.sql`](supabase_schema.sql) and click **Run**.
3. This creates:
   - `public.value_addition_ratings`: Master table for storing `good` and `bad` votes.
   - `public.value_addition_card_stats`: Real-time auto-updating leaderboard cache (`total_votes`, `good_votes`, `bad_votes`, `good_percentage`).
   - Row Level Security (RLS) policies allowing public anonymous submissions and reads.
   - Auto-aggregating database trigger `handle_new_rating()`.
   - Analytical views: `v_top_rated_tiles`, `v_copy_performance_summary`, `v_category_breakdown`.

### Step 3: Connect in the Web App
1. Go to **Project Settings** $\rightarrow$ **API** in Supabase and copy your **Project URL** and **anon / public key**.
2. Open [`index.html`](index.html), click the **Cloud Sync** badge at the top right, paste your credentials, and click **Save & Connect**.
3. All swipes will sync instantly to your cloud database!

---

## 📴 Offline Resilience
- If Supabase credentials are not entered yet, all votes are saved in browser `localStorage`.
- When credentials are entered or internet connects, the background sync queue automatically flushes to Supabase.

---

## 🗂️ File Directory

| File | Purpose |
| :--- | :--- |
| [`index.html`](index.html) | **Master Swipe Hub**: Swipes through all 544 value addition tiles across all copies |
| [`elite_deck.html`](elite_deck.html) | **Top 10% Vault**: Swipes through the 28 signature catchphrases & 15 master frameworks |
| [`copy_01.html`](copy_01.html) to [`copy_10.html`](copy_10.html) | **Individual Copy Decks**: Dedicated standalone swipe decks for each of the 10 topper copies |
| [`supabase_schema.sql`](supabase_schema.sql) | PostgreSQL schema with `good`/`bad` binary ratings, auto-triggers, RLS, and views |
| [`supabase_client.js`](supabase_client.js) | Supabase sync manager, audio synthesizer (positive chime right / subtle swoosh left) |
| [`cards_data.js`](cards_data.js) & [`cards_data.json`](cards_data.json) | Complete dataset of 544 categorized cards extracted from evaluated copies |
| [`styles.css`](styles.css) | Tinder-style design system with dynamic stamps, tilt physics, and responsive layout |

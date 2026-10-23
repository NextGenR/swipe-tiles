/**
 * Supabase Client & Offline Sync Manager for UPSC PSIR Value Addition Swipe Tiles
 * Binary Swipe Rating Engine:
 * - Swipe Left  = BAD (Pass / Reject)
 * - Swipe Right = GOOD (Keep / Like / Elite 300+ Value Addition)
 */

(function(window) {
  'use strict';

  // Constants
  const STORAGE_KEY_CONFIG = 'psir_supabase_config';
  const STORAGE_KEY_RATINGS = 'psir_ratings_history';
  const STORAGE_KEY_QUEUE = 'psir_sync_queue';
  const STORAGE_KEY_SESSION = 'psir_session_id';
  const STORAGE_KEY_CARD_STATS = 'psir_cards_stats_local';

  // Audio Context (Synthesized sound effects without external assets)
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Synthesized Sound Effects for Left/Right Swipes
  const SoundEffects = {
    playSwipeRight() {
      // Positive sparkling chime for GOOD / LIKE
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5 arpeggio

        freqs.forEach((f, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, now + (i * 0.05));

          gain.gain.setValueAtTime(0.001, now + (i * 0.05));
          gain.gain.exponentialRampToValueAtTime(0.14, now + (i * 0.05) + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + (i * 0.05) + 0.28);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + (i * 0.05));
          osc.stop(now + (i * 0.05) + 0.3);
        });
      } catch (e) {}
    },

    playSwipeLeft() {
      // Soft low swoosh for BAD / PASS
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.16);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      } catch (e) {}
    },

    playCelebration() {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const chords = [523.25, 659.25, 783.99, 1046.50]; // C Major
        chords.forEach((f, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, now + (i * 0.08));

          gain.gain.setValueAtTime(0.001, now + (i * 0.08));
          gain.gain.exponentialRampToValueAtTime(0.15, now + (i * 0.08) + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + (i * 0.08) + 0.5);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + (i * 0.08));
          osc.stop(now + (i * 0.08) + 0.55);
        });
      } catch (e) {}
    }
  };

  // Session ID Management (Anonymous UUID)
  function getSessionId() {
    let sid = localStorage.getItem(STORAGE_KEY_SESSION);
    if (!sid) {
      sid = 'session_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();
      localStorage.setItem(STORAGE_KEY_SESSION, sid);
    }
    return sid;
  }

  const DEFAULT_SUPABASE_URL = 'https://vqehftaqlmcyodyvtttc.supabase.co';
  const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxZWhmdGFxbG1jeW9keXZ0dHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3Njc5NzEsImV4cCI6MjEwODM0Mzk3MX0.nToF4Vn9NrAXAaWkUWLxIYj2NIkMxiIj_9xyzBy_-WM';

  // Supabase Client Class
  class SupabaseTileManager {
    constructor() {
      this.client = null;
      this.config = this.loadConfig();
      this.sessionId = getSessionId();
      this.isOnline = navigator.onLine;
      this.syncInProgress = false;

      this.initClient();
      this.bindNetworkListeners();
    }

    loadConfig() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
        if (raw) {
          const cfg = JSON.parse(raw);
          if (cfg.url && cfg.anonKey) return cfg;
        }
      } catch (e) {}
      return {
        url: DEFAULT_SUPABASE_URL,
        anonKey: DEFAULT_SUPABASE_KEY,
        isConfigured: true
      };
    }

    saveConfig(url, anonKey) {
      const cleanUrl = (url || '').trim().replace(/\/$/, '');
      const cleanKey = (anonKey || '').trim();
      const config = {
        url: cleanUrl,
        anonKey: cleanKey,
        isConfigured: Boolean(cleanUrl && cleanKey)
      };
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
      this.config = config;
      this.initClient();
      return this.testConnection();
    }

    initClient() {
      if (this.config.url && this.config.anonKey && window.supabase && window.supabase.createClient) {
        try {
          this.client = window.supabase.createClient(this.config.url, this.config.anonKey);
          console.log('[Supabase] Initialized client for:', this.config.url);
          this.flushQueue();
        } catch (err) {
          console.warn('[Supabase] Client init failed:', err);
          this.client = null;
        }
      } else {
        this.client = null;
      }
    }

    async testConnection(urlToTest, keyToTest) {
      const url = urlToTest || this.config.url;
      const key = keyToTest || this.config.anonKey;

      if (!url || !key) {
        return { success: false, message: 'URL and Anon Key cannot be empty.' };
      }

      if (!window.supabase || !window.supabase.createClient) {
        return { success: false, message: 'Supabase JS library not loaded. Check internet connection.' };
      }

      try {
        const testClient = window.supabase.createClient(url, key);
        const { data, error } = await testClient
          .from('value_addition_ratings')
          .select('id')
          .limit(1);

        if (error) {
          if (error.code === '42P01') {
            return {
              success: true,
              warning: true,
              message: 'Connected to Supabase! However, tables are not created yet. Please execute supabase_schema.sql in SQL Editor.'
            };
          }
          return { success: false, message: error.message || 'Supabase error: ' + error.code };
        }

        return { success: true, message: 'Successfully connected to Supabase database!' };
      } catch (err) {
        return { success: false, message: err.message || 'Connection failed' };
      }
    }

    bindNetworkListeners() {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.flushQueue();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    }

    // Submit a Binary 'good' or 'bad' Swipe Rating
    async submitRating(card, verdict, feedbackTags = [], userNote = '') {
      if (!card || !verdict) return { success: false, error: 'Invalid card or rating' };

      const cleanVerdict = verdict === 'good' ? 'good' : 'bad';

      // Play audio chime
      if (cleanVerdict === 'good') {
        SoundEffects.playSwipeRight();
      } else {
        SoundEffects.playSwipeLeft();
      }

      const ratingPayload = {
        card_id: card.id,
        copy_id: card.copy_id || 'unknown',
        topper_name: card.topper_name || '',
        air: card.air || '',
        category: card.category || 'general',
        content_title: (card.content_title || '').replace(/^"|"$/g, ''),
        content_quote: card.content_quote || '',
        author_attribution: card.author_attribution || '',
        context: card.context || '',
        syllabus_domain: card.syllabus_domain || 'PSIR Core',
        question_ref: card.question_ref || '',
        rating: cleanVerdict,
        feedback_tags: feedbackTags,
        user_note: userNote,
        session_id: this.sessionId,
        client_metadata: {
          userAgent: navigator.userAgent,
          screenWidth: window.innerWidth,
          screenHeight: window.innerHeight,
          timestamp: new Date().toISOString()
        }
      };

      // 1. Save Locally
      this.saveLocalRating(ratingPayload);
      this.updateLocalStats(card.id, cleanVerdict);

      // 2. Dispatch Rating Event for UI updates
      window.dispatchEvent(new CustomEvent('psir-rating-submitted', {
        detail: { rating: ratingPayload, totalRated: this.getRatingsHistory().length }
      }));

      // 3. Sync to Supabase if connected
      if (this.client && this.isOnline) {
        try {
          const { data, error } = await this.client
            .from('value_addition_ratings')
            .insert([ratingPayload]);

          if (error) {
            console.warn('[Supabase] Insert failed, queueing offline:', error.message);
            this.enqueueForSync(ratingPayload);
            return { success: true, synced: false, queued: true, localOnly: false };
          }

          console.log('[Supabase] Live rating synced:', ratingPayload.card_id, cleanVerdict);
          return { success: true, synced: true, localOnly: false };
        } catch (err) {
          console.warn('[Supabase] Network exception, queued:', err);
          this.enqueueForSync(ratingPayload);
          return { success: true, synced: false, queued: true, localOnly: false };
        }
      } else {
        this.enqueueForSync(ratingPayload);
        return { success: true, synced: false, queued: true, localOnly: true };
      }
    }

    saveLocalRating(payload) {
      try {
        const history = this.getRatingsHistory();
        const existingIdx = history.findIndex(r => r.card_id === payload.card_id);
        if (existingIdx >= 0) {
          history[existingIdx] = payload;
        } else {
          history.push(payload);
        }
        localStorage.setItem(STORAGE_KEY_RATINGS, JSON.stringify(history));
      } catch (e) {
        console.error('LocalStorage write failed:', e);
      }
    }

    updateLocalStats(cardId, verdict) {
      try {
        const stats = this.getLocalCardStats();
        if (!stats[cardId]) {
          stats[cardId] = {
            total_votes: 0,
            good_votes: 0,
            bad_votes: 0,
            good_percentage: 0
          };
        }
        stats[cardId].total_votes += 1;
        if (verdict === 'good') {
          stats[cardId].good_votes += 1;
        } else {
          stats[cardId].bad_votes += 1;
        }
        stats[cardId].good_percentage = Number(((stats[cardId].good_votes / stats[cardId].total_votes) * 100).toFixed(1));
        localStorage.setItem(STORAGE_KEY_CARD_STATS, JSON.stringify(stats));
      } catch (e) {}
    }

    getLocalCardStats() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_CARD_STATS);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    }

    getRatingsHistory() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_RATINGS);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    enqueueForSync(payload) {
      try {
        const queue = this.getSyncQueue();
        queue.push(payload);
        localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queue));
      } catch (e) {}
    }

    getSyncQueue() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_QUEUE);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    async flushQueue() {
      if (!this.client || this.syncInProgress || !this.isOnline) return;
      const queue = this.getSyncQueue();
      if (queue.length === 0) return;

      this.syncInProgress = true;
      console.log(`[Supabase] Flushing ${queue.length} queued ratings...`);

      try {
        const batch = queue.slice(0, 50);
        const { data, error } = await this.client
          .from('value_addition_ratings')
          .insert(batch);

        if (!error) {
          const remaining = queue.slice(batch.length);
          localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(remaining));
          console.log(`[Supabase] Flushed ${batch.length} ratings. Remaining: ${remaining.length}`);
          if (remaining.length > 0) {
            setTimeout(() => this.flushQueue(), 1000);
          }
        }
      } catch (err) {
        console.warn('[Supabase] Queue flush error:', err);
      } finally {
        this.syncInProgress = false;
      }
    }

    // Export Data Utility
    exportRatingsJSON() {
      const data = this.getRatingsHistory();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `psir_value_addition_swipe_ratings_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    exportRatingsCSV() {
      const data = this.getRatingsHistory();
      if (data.length === 0) {
        alert('No ratings recorded yet to export.');
        return;
      }

      const headers = ['Card ID', 'Copy ID', 'Topper Name', 'AIR', 'Category', 'Rating (Good/Bad)', 'Content Title', 'Attribution', 'Feedback Tags', 'User Note', 'Timestamp'];
      const rows = data.map(r => [
        `"${r.card_id}"`,
        `"${r.copy_id}"`,
        `"${r.topper_name || ''}"`,
        `"${r.air || ''}"`,
        `"${r.category || ''}"`,
        `"${r.rating.toUpperCase()}"`,
        `"${(r.content_title || '').replace(/"/g, '""')}"`,
        `"${(r.author_attribution || '').replace(/"/g, '""')}"`,
        `"${(r.feedback_tags || []).join(', ')}"`,
        `"${(r.user_note || '').replace(/"/g, '""')}"`,
        `"${r.client_metadata ? r.client_metadata.timestamp : ''}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `psir_value_addition_swipe_ratings_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // Expose Singleton instance and sound effects to window
  window.SwipeSound = SoundEffects;
  window.SwipeSupabase = new SupabaseTileManager();

})(window);

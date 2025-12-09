// src/lib/supabase.js
// Supabase client for universal bet tracking

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wxtfyhmytbrzoegvwztd.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_5JJ1L8hxRWE0ME0_9TOkIA_9h_Abw1c';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Generate or get device ID for anonymous tracking
export const getDeviceId = () => {
  let deviceId = localStorage.getItem('ev-device-id');
  if (!deviceId) {
    deviceId = 'device_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem('ev-device-id', deviceId);
  }
  return deviceId;
};

// Get username (allow users to set a display name)
export const getUsername = () => {
  return localStorage.getItem('ev-username') || null;
};

export const setUsername = (name) => {
  localStorage.setItem('ev-username', name);
};

/*
SQL Schema for Supabase (run this in your Supabase SQL editor):

-- Tracked bets table
CREATE TABLE tracked_bets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,
  username TEXT,
  sport TEXT NOT NULL CHECK (sport IN ('nba', 'football')),

  -- Match info
  match_id TEXT NOT NULL,
  match_name TEXT NOT NULL,
  match_date TIMESTAMPTZ,
  league TEXT,

  -- Bet details
  player TEXT NOT NULL,
  market TEXT NOT NULL,
  line DECIMAL(10,2),
  bet_type TEXT NOT NULL,
  bookmaker TEXT NOT NULL,

  -- Odds & EV
  displayed_odds DECIMAL(10,3) NOT NULL,
  actual_odds DECIMAL(10,3) NOT NULL,
  fair_odds DECIMAL(10,3),
  fair_prob DECIMAL(10,6),
  displayed_ev DECIMAL(10,3),
  actual_ev DECIMAL(10,3),

  -- Tracking metadata
  stake DECIMAL(10,2) DEFAULT 0,
  units DECIMAL(10,2) DEFAULT 1,

  -- Result
  result TEXT CHECK (result IN ('pending', 'won', 'lost', 'void', 'push')),
  result_updated_at TIMESTAMPTZ,
  payout DECIMAL(10,2),
  profit DECIMAL(10,2),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_tracked_bets_device_id ON tracked_bets(device_id);
CREATE INDEX idx_tracked_bets_sport ON tracked_bets(sport);
CREATE INDEX idx_tracked_bets_result ON tracked_bets(result);
CREATE INDEX idx_tracked_bets_created_at ON tracked_bets(created_at DESC);
CREATE INDEX idx_tracked_bets_match_date ON tracked_bets(match_date);

-- Enable Row Level Security (allow all for now - can restrict later)
ALTER TABLE tracked_bets ENABLE ROW LEVEL SECURITY;

-- Allow all operations (public dashboard)
CREATE POLICY "Allow all operations" ON tracked_bets
  FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tracked_bets_updated_at
  BEFORE UPDATE ON tracked_bets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
*/

-- Tracked bets table for P&L Dashboard
CREATE TABLE IF NOT EXISTS tracked_bets (
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
  result TEXT DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost', 'void', 'push')),
  result_updated_at TIMESTAMPTZ,
  payout DECIMAL(10,2),
  profit DECIMAL(10,2),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_tracked_bets_device_id ON tracked_bets(device_id);
CREATE INDEX IF NOT EXISTS idx_tracked_bets_sport ON tracked_bets(sport);
CREATE INDEX IF NOT EXISTS idx_tracked_bets_result ON tracked_bets(result);
CREATE INDEX IF NOT EXISTS idx_tracked_bets_created_at ON tracked_bets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracked_bets_match_date ON tracked_bets(match_date);

-- Enable Row Level Security
ALTER TABLE tracked_bets ENABLE ROW LEVEL SECURITY;

-- Allow all operations (public dashboard - anyone can read/write)
DROP POLICY IF EXISTS "Allow all operations" ON tracked_bets;
CREATE POLICY "Allow all operations" ON tracked_bets
  FOR ALL USING (true) WITH CHECK (true);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function
DROP TRIGGER IF EXISTS tracked_bets_updated_at ON tracked_bets;
CREATE TRIGGER tracked_bets_updated_at
  BEFORE UPDATE ON tracked_bets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE tracked_bets;

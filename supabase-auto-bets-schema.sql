-- Auto-tracked bets table - for automatic tracking of qualifying EV bets
-- Criteria: odds < 4.0 AND EV > 4%
-- Uses unique constraint to prevent duplicate entries when odds change

CREATE TABLE IF NOT EXISTS auto_tracked_bets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Unique bet identifier (prevents duplicates)
  -- Combination of: match_id + player + market + line + bet_type + bookmaker
  bet_hash TEXT UNIQUE NOT NULL,

  -- Sport type
  sport TEXT NOT NULL CHECK (sport IN ('nba', 'football')),

  -- Match info
  match_id TEXT NOT NULL,
  match_name TEXT NOT NULL,
  home_team TEXT,
  away_team TEXT,
  match_date TIMESTAMPTZ,
  league TEXT,

  -- Bet details
  player TEXT NOT NULL,
  market TEXT NOT NULL,
  line DECIMAL(10,2),
  bet_type TEXT NOT NULL,  -- 'over' or 'under'
  bookmaker TEXT NOT NULL,

  -- Odds & EV at time of detection
  odds DECIMAL(10,3) NOT NULL,
  fair_odds DECIMAL(10,3),
  fair_prob DECIMAL(10,6),
  ev_percentage DECIMAL(10,3) NOT NULL,

  -- Result tracking
  result TEXT DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost', 'void', 'push')),
  actual_stat DECIMAL(10,2),  -- The actual stat value (for verification)
  result_verified_at TIMESTAMPTZ,

  -- Timestamps
  found_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_auto_bets_sport ON auto_tracked_bets(sport);
CREATE INDEX IF NOT EXISTS idx_auto_bets_result ON auto_tracked_bets(result);
CREATE INDEX IF NOT EXISTS idx_auto_bets_found_at ON auto_tracked_bets(found_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_bets_match_date ON auto_tracked_bets(match_date);
CREATE INDEX IF NOT EXISTS idx_auto_bets_bookmaker ON auto_tracked_bets(bookmaker);
CREATE INDEX IF NOT EXISTS idx_auto_bets_bet_hash ON auto_tracked_bets(bet_hash);

-- Enable Row Level Security
ALTER TABLE auto_tracked_bets ENABLE ROW LEVEL SECURITY;

-- Allow all operations (public - anyone can read/write)
DROP POLICY IF EXISTS "Allow all operations" ON auto_tracked_bets;
CREATE POLICY "Allow all operations" ON auto_tracked_bets
  FOR ALL USING (true) WITH CHECK (true);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_auto_bets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function
DROP TRIGGER IF EXISTS auto_tracked_bets_updated_at ON auto_tracked_bets;
CREATE TRIGGER auto_tracked_bets_updated_at
  BEFORE UPDATE ON auto_tracked_bets
  FOR EACH ROW
  EXECUTE FUNCTION update_auto_bets_updated_at();

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE auto_tracked_bets;

-- View for quick stats
CREATE OR REPLACE VIEW auto_bets_stats AS
SELECT
  sport,
  bookmaker,
  COUNT(*) as total_bets,
  COUNT(*) FILTER (WHERE result = 'won') as wins,
  COUNT(*) FILTER (WHERE result = 'lost') as losses,
  COUNT(*) FILTER (WHERE result = 'pending') as pending,
  COUNT(*) FILTER (WHERE result = 'void' OR result = 'push') as void_push,
  ROUND(
    COUNT(*) FILTER (WHERE result = 'won')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE result IN ('won', 'lost')), 0) * 100,
    2
  ) as win_rate_pct,
  ROUND(AVG(ev_percentage), 2) as avg_ev,
  ROUND(AVG(odds), 3) as avg_odds
FROM auto_tracked_bets
GROUP BY sport, bookmaker
ORDER BY sport, total_bets DESC;

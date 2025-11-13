// src/pages/Match.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchEventView, fetchEventHistory, fetchStatsTrend } from "../api";
import { computeAveragesForTeam } from "../utils/stats";
import StatRow from "../components/StatRow";
import LastMatchesBox from "../components/LastMatchesBox";
import Skeleton from "../components/Skeleton";
import BettingPredictions from "../components/BettingPredictions";
import { card, small } from "../utils/ui";

function HeaderSkeleton() {
  /* unchanged skeleton */
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Skeleton height={20} width="60%" />
      <Skeleton height={14} width="40%" />
    </div>
  );
}

function TableSkeleton() {
  /* unchanged skeleton */
  return (
    <div>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} style={{ display: "grid", gap: 6, padding: "8px 0" }}>
          <Skeleton height={14} width="30%" />
          <Skeleton height={12} width="50%" />
          <div
            style={{
              height: 1,
              background: "rgba(255,255,255,0.12)",
              marginTop: 6,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function LastListSkeleton() {
  /* unchanged skeleton */
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}
        >
          <Skeleton height={14} width="70%" />
          <Skeleton height={14} width="25%" />
        </div>
      ))}
    </div>
  );
}

export default function Match() {
  const { eventId } = useParams();
  const [view, setView] = useState(null);

  const [avgHome, setAvgHome] = useState(null);
  const [avgAway, setAvgAway] = useState(null);
  const [minsHome, setMinsHome] = useState(null);
  const [maxsHome, setMaxsHome] = useState(null);
  const [minsAway, setMinsAway] = useState(null);
  const [maxsAway, setMaxsAway] = useState(null);
  const [sampleHome, setSampleHome] = useState(0);
  const [sampleAway, setSampleAway] = useState(0);
  const [homeDetails, setHomeDetails] = useState([]);
  const [awayDetails, setAwayDetails] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const homeName = view?.home?.name || view?.home_name || view?.home?.name_en;
  const awayName = view?.away?.name || view?.away_name || view?.away?.name_en;
  const kickoffISO = view?.time
    ? new Date(view.time * 1000).toISOString()
    : view?.time_start;

  useEffect(() => {
    (async () => {
      const t0 = performance.now?.() ?? Date.now();
      console.log("[Match] start", { eventId });
      try {
        setError(null);
        setLoading(true);

        const v = await fetchEventView(eventId);
        setView(v);
        console.log("[Match] view ok", {
          eventId,
          league: v?.league?.name,
          home: v?.home?.name || v?.home_name,
          away: v?.away?.name || v?.away_name,
        });

        const hist = await fetchEventHistory(eventId, 10);
        console.log("[Match] history sizes", {
          home: hist.home?.length ?? 0,
          away: hist.away?.length ?? 0,
        });

        const homeNameSafe = v?.home?.name || v?.home_name || "";
        const awayNameSafe = v?.away?.name || v?.away_name || "";
        const homeIdSafe = v?.home?.id || v?.home_id || "";
        const awayIdSafe = v?.away?.id || v?.away_id || "";

        const [h, a] = await Promise.all([
          computeAveragesForTeam(
            hist.home || [],
            (eid) => fetchStatsTrend(eid),
            (eid) => fetchEventView(eid),
            { ourName: homeNameSafe, ourId: homeIdSafe }
          ),
          computeAveragesForTeam(
            hist.away || [],
            (eid) => fetchStatsTrend(eid),
            (eid) => fetchEventView(eid),
            { ourName: awayNameSafe, ourId: awayIdSafe }
          ),
        ]);
        console.log("[Match] compute done", {
          sampleHome: h.sample,
          sampleAway: a.sample,
        });

        setAvgHome(h.averages);
        setAvgAway(a.averages);
        setMinsHome(h.mins);
        setMaxsHome(h.maxs);
        setMinsAway(a.mins);
        setMaxsAway(a.maxs);
        setSampleHome(h.sample);
        setSampleAway(a.sample);
        setHomeDetails(h.details || []);
        setAwayDetails(a.details || []);
        console.log("[Match] ok", {
          ms: Math.round((performance.now?.() ?? Date.now()) - t0),
        });
      } catch (e) {
        console.error("[Match] ERR", e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  const rows = useMemo(
    () => [
      ["shots_total", "Shots (total)"],
      ["shots_on_target", "Shots on target"],
      ["shots_off_target", "Shots off target"],
      ["offsides", "Offsides"],
      ["corners", "Corners"],
      ["yellowcards", "Yellow cards"],
      ["redcards", "Red cards"],
    ],
    []
  );

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Link to="/" style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        color: "#8b5cf6",
        textDecoration: "none",
        fontSize: 14,
        fontWeight: 600,
        padding: "8px 16px",
        background: "rgba(139, 92, 246, 0.1)",
        borderRadius: 12,
        border: "1px solid rgba(139, 92, 246, 0.2)",
        width: "fit-content",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(139, 92, 246, 0.2)";
        e.currentTarget.style.transform = "translateX(-4px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(139, 92, 246, 0.1)";
        e.currentTarget.style.transform = "translateX(0)";
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to Matches
      </Link>

      {error && (
        <div style={{
          padding: 24,
          borderRadius: 16,
          background: "linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(185, 28, 28, 0.1) 100%)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          color: "#fca5a5",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Error</div>
          <div>{error}</div>
        </div>
      )}

      <div style={{
        padding: 32,
        borderRadius: 20,
        background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 8px 16px -4px rgba(0, 0, 0, 0.4)",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: "linear-gradient(90deg, #667eea 0%, #764ba2 100%)",
        }} />

        {loading ? (
          <HeaderSkeleton />
        ) : (
          <>
            <div style={{
              fontSize: 32,
              fontWeight: 900,
              marginBottom: 16,
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}>
              <span>{homeName}</span>
              <span style={{
                fontSize: 24,
                padding: "8px 16px",
                background: "rgba(139, 92, 246, 0.2)",
                borderRadius: 12,
                color: "#a78bfa",
              }}>VS</span>
              <span>{awayName}</span>
            </div>
            <div style={{
              fontSize: 14,
              color: "#94a3b8",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}>
              <span style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                {kickoffISO ? new Date(kickoffISO).toLocaleString() : "TBD"}
              </span>
              <span>•</span>
              <span>{view?.league?.name || "—"}</span>
            </div>
          </>
        )}
      </div>

      {/* Betting Predictions Section */}
      {!loading && homeDetails.length > 0 && awayDetails.length > 0 && (
        <BettingPredictions
          homeDetails={homeDetails}
          awayDetails={awayDetails}
          homeName={homeName}
          awayName={awayName}
        />
      )}

      <div style={{
        padding: 24,
        borderRadius: 20,
        background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 4px 12px -2px rgba(0, 0, 0, 0.3)",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
        }}>
          <div style={{
            width: 4,
            height: 24,
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            borderRadius: 4,
          }} />
          <h3 style={{
            fontSize: 20,
            fontWeight: 800,
            margin: 0,
          }}>
            Statistics Comparison
          </h3>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
            fontSize: 12,
            color: "#94a3b8",
          }}
        >
          <div>
            Averages from last {sampleHome || 0} (home) / {sampleAway || 0} (away) matches
          </div>
          <div>Format: avg (min–max)</div>
        </div>

        {loading || !avgHome || !avgAway ? (
          <TableSkeleton />
        ) : (
          <div>
            {rows.map(([key, label]) => (
              <StatRow
                key={key}
                statKey={key}
                label={label}
                home={avgHome?.[key]}
                away={avgAway?.[key]}
                homeMin={minsHome?.[key]}
                homeMax={maxsHome?.[key]}
                awayMin={minsAway?.[key]}
                awayMax={maxsAway?.[key]}
              />
            ))}
          </div>
        )}
        <div style={{
          marginTop: 16,
          padding: 12,
          background: "rgba(100, 116, 139, 0.1)",
          borderRadius: 8,
          fontSize: 11,
          color: "#94a3b8",
        }}>
          ℹ️ Shots (total) = on target + off target when not supplied directly.
          Offsides are supplemented from event snapshot stats.
        </div>
      </div>

      <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))" }}>
        <div style={{
          padding: 24,
          borderRadius: 20,
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 4px 12px -2px rgba(0, 0, 0, 0.3)",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}>
            <div style={{
              width: 4,
              height: 24,
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              borderRadius: 4,
            }} />
            <h3 style={{
              fontSize: 18,
              fontWeight: 800,
              margin: 0,
            }}>
              Last 10 for {homeName || "Home"}
            </h3>
          </div>
          {loading ? (
            <LastListSkeleton />
          ) : (
            <LastMatchesBox title={null} items={homeDetails} />
          )}
        </div>
        <div style={{
          padding: 24,
          borderRadius: 20,
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 4px 12px -2px rgba(0, 0, 0, 0.3)",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}>
            <div style={{
              width: 4,
              height: 24,
              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
              borderRadius: 4,
            }} />
            <h3 style={{
              fontSize: 18,
              fontWeight: 800,
              margin: 0,
            }}>
              Last 10 for {awayName || "Away"}
            </h3>
          </div>
          {loading ? (
            <LastListSkeleton />
          ) : (
            <LastMatchesBox title={null} items={awayDetails} />
          )}
        </div>
      </div>
    </div>
  );
}

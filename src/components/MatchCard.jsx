// src/components/MatchCard.jsx
import { Link } from "react-router-dom";
import Countdown from "./Countdown";

function teamName(ev, side) {
  return ev?.[`${side}_name`] || ev?.[side]?.name || "—";
}

function kickoffISO(ev) {
  if (typeof ev?.time === "number")
    return new Date(ev.time * 1000).toISOString();
  if (ev?.time_start) return new Date(ev.time_start).toISOString();
  return undefined;
}

export default function MatchCard({ ev }) {
  const id = ev.id || ev.event_id || ev.Fid;
  const home = teamName(ev, "home");
  const away = teamName(ev, "away");
  const ko = kickoffISO(ev);

  return (
    <Link
      to={`/match/${id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "20px",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
        color: "#e2e8f0",
        textDecoration: "none",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)";
        e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.5)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
      }}
    >
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: "linear-gradient(90deg, #667eea 0%, #764ba2 100%)",
      }} />

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}>
        <div style={{ fontWeight: 700, fontSize: 18, flex: 1 }}>
          {home}
        </div>
        <div style={{
          fontSize: 16,
          fontWeight: 600,
          color: "#94a3b8",
          padding: "4px 12px",
          background: "rgba(148, 163, 184, 0.1)",
          borderRadius: 8,
        }}>
          VS
        </div>
        <div style={{ fontWeight: 700, fontSize: 18, flex: 1, textAlign: "right" }}>
          {away}
        </div>
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 12,
        borderTop: "1px solid rgba(255,255,255,0.08)",
        gap: 12,
      }}>
        <div style={{
          fontSize: 12,
          color: "#94a3b8",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          {ko ? new Date(ko).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }) : "TBD"}
        </div>

        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          {ko && <Countdown targetDate={ko} compact={true} />}
        </div>
      </div>
    </Link>
  );
}

// src/components/LastMatchesBox.jsx
import { small } from "../utils/ui";

export default function LastMatchesBox({ title, items = [] }) {
  return (
    <div>
      {title && <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>}
      <div style={{ display: "grid", gap: 6 }}>
        {items.map((m) => (
          <div
            key={m.eventId}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 8,
              padding: "6px 8px",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{m.opponent}</div>
              <div style={small}>
                {m.dateISO ? new Date(m.dateISO).toLocaleString() : "—"}
                {m.score ? ` · Score: ${m.score}` : ""}
                {m.league_name ? ` · ${m.league_name}` : ""}
              </div>
            </div>
            <div style={{ textAlign: "right", ...small }}>
              {m.side === "home" ? "Home" : "Away"}
            </div>
          </div>
        ))}
        {!items.length && (
          <div style={small}>No recent matches with stats coverage.</div>
        )}
      </div>
    </div>
  );
}

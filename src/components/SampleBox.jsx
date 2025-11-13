// src/components/SampleBox.jsx
import { small } from "../utils/ui";

export default function SampleBox({ title, summary }) {
  return (
    <div
      style={{
        border: "1px solid #1b2a4a",
        borderRadius: 12,
        padding: "12px 14px",
        background: "#0e1730",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      {!summary ? (
        <div style={small}>No data.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={small}>
            Listed: {summary.total_listed} · With stats:{" "}
            {summary.total_with_stats} ({summary.coveragePct.toFixed(0)}%
            coverage)
          </div>
          <div style={small}>
            Venue mix: {summary.homeCount} as home · {summary.awayCount} as away
          </div>
          <div style={small}>
            Competitions:{" "}
            {summary.competitions.length
              ? summary.competitions
                  .map((c) => `${c.name} (${c.count})`)
                  .join(", ")
              : "—"}
          </div>
        </div>
      )}
    </div>
  );
}

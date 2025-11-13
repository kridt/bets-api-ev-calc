// src/components/StatRow.jsx
import { small } from "../utils/ui";

function fmt(x, decimals = 2) {
  if (x == null || Number.isNaN(x)) return "—";
  const n = typeof x === "number" ? x : Number(x);
  const d = Number.isInteger(n) ? 0 : decimals;
  return n.toFixed(d);
}

function lowerIsBetter(key) {
  return ["yellowcards", "redcards", "offsides"].includes(key);
}

function colorFor(valA, valB, key) {
  if (valA == null || valB == null) return "#d7e3f3";
  const invert = lowerIsBetter(key);
  const better = invert ? valA < valB : valA > valB;
  const worse = invert ? valA > valB : valA < valB;
  if (better) return "#4ade80";
  if (worse) return "#f87171";
  return "#d7e3f3";
}

export default function StatRow({
  label,
  home,
  away,
  homeMin,
  homeMax,
  awayMin,
  awayMax,
  statKey,
}) {
  const homeColor = colorFor(home, away, statKey);
  const awayColor = colorFor(away, home, statKey);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        padding: "8px 0",
        borderBottom: "1px dashed #1b2a4a",
      }}
    >
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ textAlign: "center", ...small }}>avg (min–max)</div>
      <div />
      <div
        style={{
          gridColumn: "1 / 2",
          textAlign: "left",
          color: homeColor,
          fontWeight: 600,
        }}
      >
        {fmt(home)}{" "}
        <span style={{ ...small, color: "#9fb4d0", fontWeight: 400 }}>
          ({fmt(homeMin)}–{fmt(homeMax)})
        </span>
      </div>
      <div />
      <div
        style={{
          gridColumn: "3 / 4",
          textAlign: "right",
          color: awayColor,
          fontWeight: 600,
        }}
      >
        {fmt(away)}{" "}
        <span style={{ ...small, color: "#9fb4d0", fontWeight: 400 }}>
          ({fmt(awayMin)}–{fmt(awayMax)})
        </span>
      </div>
    </div>
  );
}

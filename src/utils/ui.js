// src/utils/ui.js
export const small = { fontSize: 12, opacity: 0.8 };

export const card = (opts = {}) => ({
  padding: 16,
  borderRadius: 14,
  background: "rgba(8,17,35,0.7)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
  color: "#d7e3f3",
  ...opts,
});

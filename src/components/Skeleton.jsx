// src/components/Skeleton.jsx
export default function Skeleton({
  height = 16,
  width = "100%",
  radius = 8,
  style = {},
}) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.06) 63%)",
        backgroundSize: "400% 100%",
        animation: "skl-shimmer 1.2s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

if (
  typeof document !== "undefined" &&
  !document.getElementById("skl-anim-style")
) {
  const el = document.createElement("style");
  el.id = "skl-anim-style";
  el.textContent = `
  @keyframes skl-shimmer {
    0% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
  }`;
  document.head.appendChild(el);
}

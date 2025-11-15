import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Match from "./pages/Match.jsx";
import Basketball from "./pages/Basketball.jsx";

export default function Router() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/match/:eventId" element={<Match />} />
      <Route path="/basketball" element={<Basketball />} />
    </Routes>
  );
}

import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Match from "./pages/Match.jsx";
import Basketball from "./pages/Basketball.jsx";
import EPLMatch from "./pages/EPLMatch.jsx";
import Today from "./pages/Today.jsx";
import Results from "./pages/Results.jsx";

export default function Router() {
  return (
    <Routes>
      <Route path="/" element={<Today />} />
      <Route path="/home" element={<Home />} />
      <Route path="/match/:eventId" element={<Match />} />
      <Route path="/epl/match/:gameId" element={<EPLMatch />} />
      <Route path="/basketball" element={<Basketball />} />
      <Route path="/results" element={<Results />} />
    </Routes>
  );
}

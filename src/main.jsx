// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App.jsx";
import NBAEVScraping from "./pages/NBAEVScraping.jsx";
import FootballEVScraping from "./pages/FootballEVScraping.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CachedNBAEV from "./pages/CachedNBAEV.jsx";
import CachedFootballEV from "./pages/CachedFootballEV.jsx";
import "./index.css";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <App />,
      children: [
        { index: true, element: <CachedNBAEV /> },
        { path: "nba-ev", element: <NBAEVScraping /> },
        { path: "nba-ev-cached", element: <CachedNBAEV /> },
        { path: "football-ev", element: <CachedFootballEV /> },
        { path: "football-ev-live", element: <FootballEVScraping /> },
        { path: "football-ev-cached", element: <CachedFootballEV /> },
        { path: "dashboard", element: <Dashboard /> },
      ],
    },
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  }
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

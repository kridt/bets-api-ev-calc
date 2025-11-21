// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App.jsx";
import Basketball from "./pages/Basketball.jsx";
import Today from "./pages/Today.jsx";
import EPLMatch from "./pages/EPLMatch.jsx";
import Results from "./pages/Results.jsx";
import "./index.css";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <App />,
      children: [
        { index: true, element: <Today /> },
        { path: "basketball", element: <Basketball /> },
        { path: "epl/match/:gameId", element: <EPLMatch /> },
        { path: "results", element: <Results /> },
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

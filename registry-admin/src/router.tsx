import { createBrowserRouter, Navigate } from "react-router-dom";
import AdminLayout from "./pages/AdminLayout";
import LoginPage from "./pages/LoginPage";
import NotAdminPage from "./pages/NotAdminPage";
import AppsPage from "./pages/AppsPage";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/apps" replace /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/not-admin", element: <NotAdminPage /> },
  {
    path: "/",
    element: <AdminLayout />,
    children: [{ path: "apps", element: <AppsPage /> }],
  },
]);

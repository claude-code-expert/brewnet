import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.js';
import { Apps } from './pages/Apps.js';
import { Catalog } from './pages/Catalog.js';
const router = createBrowserRouter([
  { path: '/',     element: <Dashboard /> },
  { path: '/apps', element: <Apps /> },
  { path: '/apps/:name', element: <Navigate to="/apps" replace /> },
  { path: '/catalog', element: <Catalog /> },
]);

export function Router() {
  return <RouterProvider router={router} />;
}

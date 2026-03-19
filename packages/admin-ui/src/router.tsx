import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.js';
import { Apps } from './pages/Apps.js';

const router = createBrowserRouter([
  { path: '/',     element: <Dashboard /> },
  { path: '/apps', element: <Apps /> },
  { path: '/apps/:name', element: <Navigate to="/apps" replace /> },
]);

export function Router() {
  return <RouterProvider router={router} />;
}

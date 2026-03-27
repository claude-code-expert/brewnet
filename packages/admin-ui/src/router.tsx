import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.js';
import { Apps } from './pages/Apps.js';
import { Catalog } from './pages/Catalog.js';
import { DbViewer } from './pages/DbViewer.js';

const router = createBrowserRouter([
  { path: '/',     element: <Dashboard /> },
  { path: '/apps', element: <Apps /> },
  { path: '/apps/:name', element: <Navigate to="/apps" replace /> },
  { path: '/catalog', element: <Catalog /> },
  { path: '/debug/db', element: <DbViewer /> },
]);

export function Router() {
  return <RouterProvider router={router} />;
}

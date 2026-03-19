import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.js';
import { Apps } from './pages/Apps.js';
import { AppDetail } from './pages/AppDetail.js';

const router = createBrowserRouter([
  { path: '/',          element: <Dashboard /> },
  { path: '/apps',      element: <Apps /> },
  { path: '/apps/:name', element: <AppDetail /> },
]);

export function Router() {
  return <RouterProvider router={router} />;
}

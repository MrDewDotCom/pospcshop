import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { AccountPage } from '@/features/auth/AccountPage';
import { GuestOnly, RequireAuth, SetupGate } from '@/features/auth/guards';
import { LoginPage } from '@/features/auth/LoginPage';
import { RecoverPage } from '@/features/auth/RecoverPage';
import { HomePage } from '@/features/home/HomePage';
import { NotFoundPage } from '@/features/home/NotFoundPage';
import { SettingsLayout } from '@/features/settings/SettingsLayout';
import { SetupPage } from '@/features/setup/SetupPage';
import { AuditLogPage } from '@/features/users/AuditLogPage';
import { UsersPage } from '@/features/users/UsersPage';

export const router = createBrowserRouter([
  {
    element: <SetupGate />,
    children: [
      { path: '/setup', element: <SetupPage /> },
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/recover', element: <RecoverPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <HomePage /> },
              { path: 'account', element: <AccountPage /> },
              {
                path: 'settings',
                element: <SettingsLayout />,
                children: [
                  { path: 'users', element: <UsersPage /> },
                  { path: 'audit', element: <AuditLogPage /> },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);

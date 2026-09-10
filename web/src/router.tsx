import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { AccountPage } from '@/features/auth/AccountPage';
import { GuestOnly, RequireAuth, SetupGate } from '@/features/auth/guards';
import { LoginPage } from '@/features/auth/LoginPage';
import { RecoverPage } from '@/features/auth/RecoverPage';
import { HomePage } from '@/features/home/HomePage';
import { NotFoundPage } from '@/features/home/NotFoundPage';
import { NumberingPage } from '@/features/settings/NumberingPage';
import { PhoneAccessPage } from '@/features/settings/PhoneAccess';
import { SettingsLayout } from '@/features/settings/SettingsLayout';
import { ShopSettingsPage } from '@/features/settings/ShopSettingsPage';
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
                  { path: 'shop', element: <ShopSettingsPage /> },
                  { path: 'numbering', element: <NumberingPage /> },
                  { path: 'users', element: <UsersPage /> },
                  { path: 'network', element: <PhoneAccessPage /> },
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

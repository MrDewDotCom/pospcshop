import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { AccountPage } from '@/features/auth/AccountPage';
import { CategoriesPage } from '@/features/categories/CategoriesPage';
import { GuestOnly, RequireAuth, SetupGate } from '@/features/auth/guards';
import { LoginPage } from '@/features/auth/LoginPage';
import { RecoverPage } from '@/features/auth/RecoverPage';
import { HomePage } from '@/features/home/HomePage';
import { NotFoundPage } from '@/features/home/NotFoundPage';
import { ProductDetailPage } from '@/features/products/ProductDetailPage';
import { ProductCreatePage, ProductEditPage } from '@/features/products/ProductFormPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { ReceivingDetailPage } from '@/features/receiving/ReceivingDetailPage';
import { ReceivingFormPage } from '@/features/receiving/ReceivingFormPage';
import { ReceivingListPage } from '@/features/receiving/ReceivingListPage';
import { BackupPage } from '@/features/settings/BackupPage';
import { NumberingPage } from '@/features/settings/NumberingPage';
import { PhoneAccessPage } from '@/features/settings/PhoneAccess';
import { SettingsLayout } from '@/features/settings/SettingsLayout';
import { ShopSettingsPage } from '@/features/settings/ShopSettingsPage';
import { SetupPage } from '@/features/setup/SetupPage';
import { StockAdjustPage } from '@/features/stock/StockAdjustPage';
import { StockLookupPage } from '@/features/stock/StockLookupPage';
import { StockMovementsPage } from '@/features/stock/StockMovementsPage';
import { SuppliersPage } from '@/features/suppliers/SuppliersPage';
import { TagsPage } from '@/features/tags/TagsPage';
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
              { path: 'products', element: <ProductsPage /> },
              { path: 'products/new', element: <ProductCreatePage /> },
              { path: 'products/:id', element: <ProductDetailPage /> },
              { path: 'products/:id/edit', element: <ProductEditPage /> },
              { path: 'categories', element: <CategoriesPage /> },
              { path: 'suppliers', element: <SuppliersPage /> },
              { path: 'receiving', element: <ReceivingListPage /> },
              { path: 'receiving/new', element: <ReceivingFormPage /> },
              { path: 'receiving/:id', element: <ReceivingDetailPage /> },
              { path: 'stock/lookup', element: <StockLookupPage /> },
              { path: 'stock/movements', element: <StockMovementsPage /> },
              { path: 'stock/adjust', element: <StockAdjustPage /> },
              {
                path: 'settings',
                element: <SettingsLayout />,
                children: [
                  { path: 'shop', element: <ShopSettingsPage /> },
                  { path: 'tags', element: <TagsPage /> },
                  { path: 'numbering', element: <NumberingPage /> },
                  { path: 'users', element: <UsersPage /> },
                  { path: 'backup', element: <BackupPage /> },
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

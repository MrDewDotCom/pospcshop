import { createBrowserRouter } from 'react-router';
import { CrashPage } from '@/components/CrashPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { AccountPage } from '@/features/auth/AccountPage';
import { CategoriesPage } from '@/features/categories/CategoriesPage';
import { CustomerDetailPage } from '@/features/customers/CustomerDetailPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { GuestOnly, RequireAuth, RequirePermission, SetupGate } from '@/features/auth/guards';
import { LoginPage } from '@/features/auth/LoginPage';
import { RecoverPage } from '@/features/auth/RecoverPage';
import { HomePage } from '@/features/home/HomePage';
import { NotFoundPage } from '@/features/home/NotFoundPage';
import { PosPage } from '@/features/pos/PosPage';
import { SaleDetailPage } from '@/features/sales/SaleDetailPage';
import { SalesPage } from '@/features/sales/SalesPage';
import { ProductDetailPage } from '@/features/products/ProductDetailPage';
import { ProductCreatePage, ProductEditPage } from '@/features/products/ProductFormPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { ReceivingDetailPage } from '@/features/receiving/ReceivingDetailPage';
import { ReceivingFormPage } from '@/features/receiving/ReceivingFormPage';
import { ReceivingListPage } from '@/features/receiving/ReceivingListPage';
import { BackupPage } from '@/features/settings/BackupPage';
import { NumberingPage } from '@/features/settings/NumberingPage';
import { SampleDataPage } from '@/features/settings/SampleDataPage';
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
    // Any render error below here shows the crash screen instead of a blank page.
    errorElement: <CrashPage />,
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
                element: <RequirePermission permission="sale.create" />,
                children: [{ path: 'pos', element: <PosPage /> }],
              },
              { path: 'products', element: <ProductsPage /> },
              { path: 'products/new', element: <ProductCreatePage /> },
              { path: 'products/:id', element: <ProductDetailPage /> },
              { path: 'products/:id/edit', element: <ProductEditPage /> },
              { path: 'suppliers', element: <SuppliersPage /> },
              { path: 'sales', element: <SalesPage /> },
              { path: 'sales/:id', element: <SaleDetailPage /> },
              { path: 'customers', element: <CustomersPage /> },
              { path: 'customers/:id', element: <CustomerDetailPage /> },
              { path: 'receiving', element: <ReceivingListPage /> },
              { path: 'receiving/new', element: <ReceivingFormPage /> },
              { path: 'receiving/:id', element: <ReceivingDetailPage /> },
              { path: 'stock/lookup', element: <StockLookupPage /> },
              { path: 'stock/movements', element: <StockMovementsPage /> },
              // Owner-only screens: staff who type the URL get a "ไม่มีสิทธิ์" page, not a dead form.
              {
                element: <RequirePermission permission="category.manage" />,
                children: [{ path: 'categories', element: <CategoriesPage /> }],
              },
              {
                element: <RequirePermission permission="stock.adjust" />,
                children: [{ path: 'stock/adjust', element: <StockAdjustPage /> }],
              },
              {
                path: 'settings',
                element: <SettingsLayout />,
                children: [
                  { path: 'network', element: <PhoneAccessPage /> },
                  {
                    element: <RequirePermission permission="settings.manage" />,
                    children: [
                      { path: 'shop', element: <ShopSettingsPage /> },
                      { path: 'numbering', element: <NumberingPage /> },
                      { path: 'sample-data', element: <SampleDataPage /> },
                    ],
                  },
                  {
                    element: <RequirePermission permission="tag.manage" />,
                    children: [{ path: 'tags', element: <TagsPage /> }],
                  },
                  {
                    element: <RequirePermission permission="users.manage" />,
                    children: [{ path: 'users', element: <UsersPage /> }],
                  },
                  {
                    element: <RequirePermission permission="backup.manage" />,
                    children: [{ path: 'backup', element: <BackupPage /> }],
                  },
                  {
                    element: <RequirePermission permission="audit.view" />,
                    children: [{ path: 'audit', element: <AuditLogPage /> }],
                  },
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

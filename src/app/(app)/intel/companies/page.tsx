// src/app/(app)/intel/companies/page.tsx
// spec §8 coverage directory. Protected (app) route: login required (decision H default). The admin check only
// decides whether the empty state links /admin/dq.
import { requireAdminUser } from '@/lib/admin/auth';
import { Disclaimer } from '@/components/Disclaimer';
import { CompanyDirectory } from '@/components/company/directory/CompanyDirectory';

export const dynamic = 'force-dynamic';

export default async function CompaniesDirectoryPage() {
  let isAdmin = false;
  try { await requireAdminUser(); isAdmin = true; } catch { isAdmin = false; }
  return (
    <>
      <CompanyDirectory isAdmin={isAdmin} />
      <Disclaimer />
    </>
  );
}

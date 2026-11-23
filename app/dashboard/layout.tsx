import '@/styles/dashboard.css';

/** Loads the workspace theme (oxblood and cream, like the landing page) for every dashboard page. */
export const metadata = {
  title: 'HireLabs | Recruiter Workspace',
  description: 'Private resume library and AI-assisted candidate evaluation.',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import NavBar from '@/components/NavBar';
import OfflineStatus from '@/components/OfflineStatus';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <OfflineStatus />
      <NavBar />
    </>
  );
}

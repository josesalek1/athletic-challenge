import NavBar from '@/components/NavBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <NavBar />
    </>
  );
}

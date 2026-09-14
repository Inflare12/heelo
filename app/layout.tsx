import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LiveShare — Browse together',
  description: 'Real-time collaborative browsing rooms for teams and friends.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

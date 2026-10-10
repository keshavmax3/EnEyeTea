import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Eneyetea - Anonymous Campus Community',
  description: 'Anonymous campus community where college students share confessions, campus gossip, and relatable stories with real-time chat and open-source AI insights.',
  openGraph: {
    title: 'Eneyetea - Anonymous Campus Community',
    description: 'Anonymous campus community where college students share confessions, campus gossip, and relatable stories with real-time chat and open-source AI insights.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Eneyetea - Anonymous Campus Community',
    description: 'Anonymous campus community where college students share confessions, campus gossip, and relatable stories with real-time chat and open-source AI insights.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body className="bg-[#fcfaf7] text-[#1c1917] antialiased selection:bg-amber-200 selection:text-amber-900" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

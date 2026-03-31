import './globals.css';

export const metadata = {
  title: 'CertVerify — Stellar Soroban Certificate Verifier',
  description: 'Issue and verify tamper-proof certificates on the Stellar blockchain using a Soroban smart contract.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* ─── Animated Background ─── */}
        <div className="bg-grid"></div>
        <div className="bg-glow bg-glow--1"></div>
        <div className="bg-glow bg-glow--2"></div>
        <div className="bg-glow bg-glow--3"></div>
        
        {children}
      </body>
    </html>
  );
}

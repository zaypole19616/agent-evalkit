import './globals.css'
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { Nav } from '@/components/nav'
import { AuthProvider } from '@/lib/auth-context'
import { AuthGuard } from '@/components/auth-guard'

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' })
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'agent-evalkit — agent eval dashboard',
  description: 'Open-source evaluation framework for file- and tool-producing AI agents. (Demo data — all models and scores are synthetic.)',
}

// Ambient layer — two soft radial gradients painted behind everything,
// plus a faint grid. Position is fixed so the glow follows the viewport
// rather than scrolling out of view. ``pointer-events-none`` keeps it
// purely decorative. Tuned for a light bg — low-opacity tints so the
// page reads as "white with a hint of cyan/violet" not "tinted".
function Ambient() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-cyan-300/25 blur-3xl" />
      <div className="absolute bottom-[-20%] left-[-10%] h-[520px] w-[520px] rounded-full bg-violet-300/25 blur-3xl" />
      <div className="absolute inset-0 bg-subtle-grid bg-[size:48px_48px] opacity-60" />
    </div>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <AuthProvider>
          <Ambient />
          <Nav />
          <main className="px-6 py-8 max-w-7xl mx-auto">
            <AuthGuard>{children}</AuthGuard>
          </main>
        </AuthProvider>
      </body>
    </html>
  )
}

import Link from 'next/link'

export function NavBar() {
  return (
    <nav className="flex items-center px-6 py-5 max-w-4xl mx-auto">
      <Link
        href="/"
        className="text-sm font-bold tracking-widest uppercase text-gray-800 hover:text-gray-600 transition-colors"
      >
        TESKEIÐ<span className="text-gray-400 font-normal">.is</span>
      </Link>
    </nav>
  )
}

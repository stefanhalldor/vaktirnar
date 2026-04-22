interface FooterProps {
  tagline: string
  copyright: string
}

export function Footer({ tagline, copyright }: FooterProps) {
  return (
    <footer className="border-t border-gray-200 mt-24 py-10 px-4">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-400">
        <span>{tagline}</span>
        <span>{copyright}</span>
      </div>
    </footer>
  )
}

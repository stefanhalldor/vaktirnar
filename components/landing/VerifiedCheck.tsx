'use client'

interface VerifiedCheckProps {
  size?: 'sm' | 'md'
}

export function VerifiedCheck({ size = 'sm' }: VerifiedCheckProps) {
  const dim = size === 'sm' ? 14 : 18
  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 16 16"
      fill="none"
      aria-label="Staðfest"
      className="inline-block flex-shrink-0"
    >
      <circle cx="8" cy="8" r="8" fill="#3B82F6" />
      <path
        d="M4.5 8.5 L6.5 10.5 L11 6"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

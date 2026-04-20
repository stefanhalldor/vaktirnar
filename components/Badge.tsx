'use client'

type BadgeVariant = 'warning' | 'success' | 'info' | 'gray'

interface BadgeProps {
  variant: BadgeVariant
  children: React.ReactNode
  pulse?: boolean
}

const styles: Record<BadgeVariant, string> = {
  warning: 'bg-amber-100 text-amber-700',
  success: 'bg-green-100 text-green-700',
  info:    'bg-blue-100 text-blue-700',
  gray:    'bg-gray-100 text-gray-500',
}

const pulseColors: Record<BadgeVariant, string> = {
  warning: 'bg-amber-400',
  success: 'bg-green-400',
  info:    'bg-blue-400',
  gray:    'bg-gray-400',
}

export function Badge({ variant, children, pulse = false }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${styles[variant]}`}>
      {pulse && (
        <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${pulseColors[variant]}`} />
      )}
      {children}
    </span>
  )
}

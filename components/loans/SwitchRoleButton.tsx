'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { switchLoanRole } from '@/lib/loans/actions'

interface SwitchRoleButtonProps {
  loanId: string
  currentRole: 'lender' | 'borrower'
  hasPendingInvitation: boolean
  labels: {
    switchToLender: string
    switchToBorrower: string
    pendingWarning: string
    error: string
  }
}

export function SwitchRoleButton({
  loanId,
  currentRole,
  hasPendingInvitation,
  labels,
}: SwitchRoleButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function handleSwitch() {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await switchLoanRole(loanId)
      if (result.ok) {
        router.refresh()
      } else {
        setErrorMsg(labels.error)
      }
    })
  }

  const switchLabel =
    currentRole === 'lender' ? labels.switchToBorrower : labels.switchToLender

  return (
    <div className="flex flex-col gap-2">
      {hasPendingInvitation && (
        <p className="text-xs text-[#72796e]">{labels.pendingWarning}</p>
      )}
      <button
        type="button"
        onClick={handleSwitch}
        disabled={isPending}
        aria-busy={isPending}
        className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-sm font-medium rounded-md border border-[#cad9c5] text-[#154212] bg-white hover:bg-[#f0f7ef] disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        {switchLabel}
      </button>
      {errorMsg && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}
    </div>
  )
}

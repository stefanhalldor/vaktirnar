import type { ExpenseGroupStatus, ExpenseItemView, ExpenseMemberView } from './contracts'

export function canEditExpense(input: {
  expenseStatus: ExpenseItemView['status']
  groupStatus: ExpenseGroupStatus
  createdBySelf: boolean
  canManage: boolean
}): boolean {
  return input.expenseStatus === 'active'
    && input.groupStatus !== 'closed'
    && (input.createdBySelf || input.canManage)
}

export function canActAsExpenseMember(input: {
  actorUserId: string
  memberStatus: ExpenseMemberView['status']
  memberUserId: string | null | undefined
}): boolean {
  return input.memberStatus === 'active'
    && input.memberUserId === input.actorUserId
}

export function canManageExpenseMemberOnBehalf(input: {
  canManage: boolean
  memberStatus: ExpenseMemberView['status'] | undefined
  memberUserId: string | null | undefined
}): boolean {
  return input.canManage && (
    (input.memberStatus === 'active' && input.memberUserId === null)
    || input.memberStatus === 'invited'
  )
}

export function canLinkExpenseGuest(input: {
  groupStatus: ExpenseGroupStatus
  canManage: boolean
}): boolean {
  return input.canManage && input.groupStatus !== 'closed'
}

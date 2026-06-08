import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { ChildForm } from '@/components/children/ChildForm'
import { InviteCodeDisplay } from '@/components/contacts/InviteCodeDisplay'
import { Avatar } from '@/components/ui/Avatar'

export default async function EditChildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getTranslations('children')
  const supabase = await createClient()

  const { data: child } = await supabase
    .from('children')
    .select('*')
    .eq('id', id)
    .single()

  if (!child) notFound()

  const { data: inviteCode } = await supabase
    .from('invite_codes')
    .select('code')
    .eq('child_id', id)
    .single()

  // Get all parents of this child with their profiles
  const { data: parentRows } = await supabase
    .from('parent_child')
    .select('role, parent:profiles(id, display_name)')
    .eq('child_id', id)

  const parents = parentRows ?? []

  return (
    <>
      <Header title={t('editChild')} backHref="/children" />
      <div className="p-4 flex flex-col gap-6">
        {inviteCode && (
          <div className="flex flex-col gap-1">
            <InviteCodeDisplay code={inviteCode.code} childName={child.name} />
            <p className="text-xs text-gray-500 text-center px-2">{t('shareCodeHint')}</p>
          </div>
        )}

        {parents.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">{t('coparents')}</p>
            <div className="flex flex-col gap-2">
              {parents.map((row: any, idx: number) => (
                <div key={row.parent?.id ?? `parent-${idx}`} className="flex items-center gap-3 rounded-2xl bg-white border border-gray-100 px-4 py-3">
                  <Avatar name={row.parent?.display_name || '?'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {row.parent?.display_name || '—'}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {row.role === 'primary' ? t('primaryParent') : t('coparent')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <ChildForm initial={child} />
      </div>
    </>
  )
}

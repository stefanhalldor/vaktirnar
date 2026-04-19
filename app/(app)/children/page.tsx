import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { ChildCard } from '@/components/children/ChildCard'
import { Button } from '@/components/ui/Button'
import { Plus, Baby, UserPlus } from 'lucide-react'

export default async function ChildrenPage() {
  const t = await getTranslations('children')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: rows } = await supabase
    .from('parent_child')
    .select('child:children(*), role')
    .eq('parent_id', user!.id)

  const children = rows?.map((r) => ({ ...r.child, role: r.role })).filter(Boolean) ?? []

  return (
    <>
      <Header
        title={t('title')}
        action={
          <div className="flex gap-2">
            <Link href="/children/join">
              <Button size="sm" variant="secondary">
                <UserPlus className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/children/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                {t('addChild')}
              </Button>
            </Link>
          </div>
        }
      />
      <div className="p-4">
        {children.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-gray-500">
            <Baby className="h-12 w-12 text-gray-200" />
            <p className="text-sm">{t('noChildren')}</p>
            <div className="flex gap-2">
              <Link href="/children/new">
                <Button size="sm" variant="secondary">{t('addChild')}</Button>
              </Link>
              <Link href="/children/join">
                <Button size="sm" variant="secondary">{t('joinAsCoparent')}</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {children.map((child: any) => (
              <ChildCard key={child.id} child={child} userId={user!.id} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

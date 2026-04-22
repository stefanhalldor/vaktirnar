import { getTranslations } from 'next-intl/server'
import { Header } from '@/components/layout/Header'
import { ChildForm } from '@/components/children/ChildForm'

export default async function NewChildPage() {
  const t = await getTranslations('children')
  return (
    <>
      <Header title={t('addChild')} backHref="/children" />
      <div className="p-4">
        <ChildForm />
      </div>
    </>
  )
}

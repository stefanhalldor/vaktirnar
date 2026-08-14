import { useTranslations } from 'next-intl'
import { ClosedTestingBanner } from '@/components/teskeid/ClosedTestingBanner'

const FEEDBACK_URL = 'https://www.facebook.com/profile.php?id=61590612753245'

export function WeatherBetaBanner() {
  const t = useTranslations('teskeid.vedrid')
  return (
    <ClosedTestingBanner
      body={t('betaBannerBody')}
      feedbackHref={FEEDBACK_URL}
      feedbackLabel={t('betaBannerFeedback')}
    />
  )
}

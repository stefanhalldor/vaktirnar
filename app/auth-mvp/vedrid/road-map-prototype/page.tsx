import { createClient } from '@/lib/supabase/server'
import { RoadMapPrototypeMap } from '@/components/weather/RoadMapPrototypeMap'

export default async function RoadMapPrototypePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="h-screen bg-background overflow-hidden">
      <RoadMapPrototypeMap isAuthenticated={!!(user?.email)} />
    </main>
  )
}

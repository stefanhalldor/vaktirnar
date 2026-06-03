import { NavBar, BottomNav } from '@/components/teskeid/NavBar'
import { LoginWaitlistForm } from '@/components/teskeid/LoginWaitlistForm'

export const metadata = {
  title: 'Innskráning — Teskeið',
}

export default function InnskraningPage() {
  return (
    <main className="min-h-screen bg-[#fbf9f4] pb-32">
      <NavBar />

      <section className="max-w-[768px] mx-auto px-5 pt-12 pb-16">
        {/* Intro */}
        <div className="mb-10">
          <h1 className="text-[32px] leading-[40px] font-semibold tracking-[-0.02em] text-[#154212] mb-4">
            Innskráning kemur bráðum
          </h1>
          <p className="text-lg leading-[28px] text-[#42493e] max-w-[520px]">
            Við opnum fyrir aðgang og prófíla þegar fyrsta teskeiðin fer í loftið. Þá geturðu búið til þinn prófíl og byrjað að lifa lífinu með allt í Teskeið.
          </p>
        </div>

        {/* Supporting copy */}
        <div className="bg-white/70 backdrop-blur-sm rounded-xl border border-black/5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-6 mb-8">
          <p className="text-base leading-[24px] text-[#42493e]">
            Fyrsta skrefið er að koma hugmyndabankanum vel af stað. Svo bætum við innskráningu, prófílum og fyrstu teskeiðinni við, einni teskeið í einu.
          </p>
        </div>

        {/* Waitlist */}
        <div className="bg-white/70 backdrop-blur-sm rounded-xl border border-black/5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-6">
          <h2 className="text-xl font-medium text-[#154212] mb-1">
            Láttu mig vita
          </h2>
          <p className="text-base text-[#42493e] mb-5">
            Skráðu netfangið þitt og við sendum þér póst þegar innskráning opnar.
          </p>
          <LoginWaitlistForm />
        </div>
      </section>

      <BottomNav />
    </main>
  )
}

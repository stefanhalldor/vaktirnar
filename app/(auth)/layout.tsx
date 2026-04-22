export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-violet-50 to-purple-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-4xl">🧒</span>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Krakkavaktin</h1>
        </div>
        {children}
      </div>
    </div>
  )
}

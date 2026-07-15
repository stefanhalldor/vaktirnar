'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronLeft, CloudSun, ChevronDown, ChevronUp } from 'lucide-react'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { WeatherBetaBanner } from '@/components/weather/WeatherBetaBanner'
import type { WeatherAnswerEnvelope, WeatherStatus } from '@/lib/weather/types'
import { MapConfirmation } from '@/components/weather/MapConfirmation'
import { PlaceSearch, type PlaceResult } from '@/components/weather/PlaceSearch'

const STATUS_STYLES: Record<WeatherStatus, { dot: string; label: string }> = {
  graent: { dot: 'bg-[#2d5a27]', label: 'text-[#2d5a27]' },
  gult:   { dot: 'bg-amber-500', label: 'text-amber-700' },
  rautt:  { dot: 'bg-destructive', label: 'text-destructive' },
}

type ConfirmedPlace = { name: string; lat: number; lon: number }

export function VedridClient() {
  const t = useTranslations('teskeid.vedrid')
  const EXAMPLE_QUESTIONS = [
    t('exampleQuestion1'),
    t('exampleQuestion2'),
    t('exampleQuestion3'),
  ]
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WeatherAnswerEnvelope | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showPlaceSearch, setShowPlaceSearch] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const submitQuestion = useCallback(async (q: string, confirmedPlace?: ConfirmedPlace) => {
    setLoading(true)
    setResult(null)
    setError(null)
    setShowDetails(false)
    setShowPlaceSearch(false)

    try {
      const res = await fetch('/api/teskeid/weather/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          confirmedPlace: confirmedPlace ?? undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errorCodeKeys: Record<string, Parameters<typeof t>[0]> = {
          unsupported_intent: 'errorUnsupportedIntent',
          unknown_place: 'errorUnknownPlace',
          forecast_unavailable: 'errorForecastUnavailable',
          provider_not_configured: 'errorProviderNotConfigured',
          unknown_route: 'errorUnknownRoute',
          route_unavailable: 'errorRouteUnavailable',
        }
        // unknown_place with a pending question → offer PlaceSearch
        if (data?.error === 'unknown_place') {
          setPendingQuestion(q)
          setShowPlaceSearch(true)
          setError(t('errorUnknownPlace'))
        } else {
          const key = errorCodeKeys[data?.error] ?? 'errorGeneral'
          setError(t(key))
        }
      } else {
        setResult(data as WeatherAnswerEnvelope)
        setPendingQuestion(q)
      }
    } catch {
      setError(t('errorGeneral'))
    } finally {
      setLoading(false)
    }
  }, [t])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || loading) return
    await submitQuestion(question.trim())
  }

  function handleChip(q: string) {
    setQuestion(q)
    textareaRef.current?.focus()
  }

  function handlePlaceSelected(place: PlaceResult) {
    setShowPlaceSearch(false)
    const q = pendingQuestion ?? question.trim()
    submitQuestion(q, { name: place.name, lat: place.lat, lon: place.lon })
  }

  function handleChangePlace() {
    setShowPlaceSearch(true)
  }

  const status = result?.deterministic.stada
  const statusStyle = status ? STATUS_STYLES[status] : null
  const placeInfo = result?.place

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 pt-8 pb-10 flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center gap-2">
          <Link
            href="/auth-mvp/heim"
            aria-label={t('backLink')}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft size={20} aria-hidden />
          </Link>
          <div className="flex-1 flex items-center gap-2">
            <CloudSun size={20} className="text-primary" aria-hidden />
            <h1 className="text-lg font-semibold text-primary">{t('title')}</h1>
          </div>
          <TeskeidMenu variant="authenticated" />
        </div>

        {/* Beta banner */}
        <WeatherBetaBanner />

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label htmlFor="vedrid-question" className="text-sm font-medium text-foreground">
            {t('prompt')}
          </label>
          <textarea
            id="vedrid-question"
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('placeholder')}
            rows={3}
            disabled={loading}
            className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            style={{ fontSize: '16px' }}
          />

          {/* Example chips */}
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleChip(q)}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-full border border-border bg-card text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {loading ? t('submitting') : t('submit')}
          </button>
        </form>

        {/* Place search — shown on unknown_place or when user clicks "Breyta stað" */}
        {showPlaceSearch && (
          <PlaceSearch
            onPlaceSelected={handlePlaceSelected}
            onCancel={() => setShowPlaceSearch(false)}
          />
        )}

        {/* Error (shown alongside PlaceSearch for unknown_place) */}
        {error && !showPlaceSearch && (
          <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        {/* Answer */}
        {result && statusStyle && (
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">

            {/* Status */}
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusStyle.dot} shrink-0`} aria-hidden />
              <span className={`text-xs font-medium ${statusStyle.label}`}>
                {t(`status${status!.charAt(0).toUpperCase()}${status!.slice(1)}` as 'statusGraent' | 'statusGult' | 'statusRautt')}
              </span>
            </div>

            {/* Main answer */}
            <p className="text-sm text-foreground leading-relaxed">{result.displayed.svar}</p>

            {/* Action suggestion */}
            {result.displayed.adgerd && (
              <p className="text-sm text-muted-foreground">{result.displayed.adgerd}</p>
            )}

            {/* Details disclosure */}
            {result.deterministic.facts && result.deterministic.facts.length > 0 && (
              <div className="border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  aria-expanded={showDetails}
                >
                  {showDetails ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                  {t('whyLabel')}
                </button>
                {showDetails && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {result.deterministic.facts.map((f, i) => (
                      <li key={i} className="text-xs text-muted-foreground">{f}</li>
                    ))}
                    {result.displayed.source === 'ai' && (
                      <li className="text-xs text-muted-foreground italic">{t('aiSource')}</li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {/* Map confirmation */}
            {placeInfo?.staticMapUrl && !showPlaceSearch && (
              <div className="border-t border-border pt-3">
                <MapConfirmation
                  placeName={placeInfo.name}
                  staticMapUrl={placeInfo.staticMapUrl}
                  onChangePlace={handleChangePlace}
                />
              </div>
            )}
          </div>
        )}


      </main>
    </div>
  )
}

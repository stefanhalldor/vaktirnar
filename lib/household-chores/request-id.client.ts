'use client'

export class HouseholdChoreRequestIds {
  private readonly requestIds = new Map<string, string>()
  private readonly inFlight = new Set<string>()

  constructor(private readonly generate = () => crypto.randomUUID()) {}

  begin(fingerprint: string): string | null {
    if (this.inFlight.has(fingerprint)) return null

    let requestId = this.requestIds.get(fingerprint)
    if (!requestId) {
      requestId = this.generate()
      this.requestIds.set(fingerprint, requestId)
    }
    this.inFlight.add(fingerprint)
    return requestId
  }

  returned(
    fingerprint: string,
    result: { ok: boolean; error?: string },
  ) {
    this.inFlight.delete(fingerprint)
    // save_failed can represent a transport/RPC failure after the database
    // committed. Keep the key so a retry replays the exact sealed request.
    if (result.ok || result.error !== 'save_failed') {
      this.requestIds.delete(fingerprint)
    }
  }

  uncertain(fingerprint: string) {
    this.inFlight.delete(fingerprint)
  }
}

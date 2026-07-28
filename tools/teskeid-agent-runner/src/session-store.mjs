const MAX_OPAQUE_ID_CHARS = 512;

export class SessionStoreError extends Error {
  constructor(category = "adapter_session_store_failed") {
    super(category);
    this.name = "SessionStoreError";
    this.category = category;
    this.retryable = false;
  }
}

function requireOpaqueId(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_OPAQUE_ID_CHARS ||
    /[\r\n\0]/u.test(value)
  ) {
    throw new SessionStoreError();
  }
  return value;
}

export function validateSessionStore(store) {
  if (
    !store ||
    typeof store !== "object" ||
    typeof store.get !== "function" ||
    typeof store.set !== "function" ||
    typeof store.delete !== "function" ||
    (store.release !== undefined && typeof store.release !== "function")
  ) {
    throw new SessionStoreError();
  }
  return store;
}

export function createMemorySessionStore(initialEntries = []) {
  const sessions = new Map();
  for (const [conversationId, providerSessionId] of initialEntries) {
    sessions.set(
      requireOpaqueId(conversationId),
      requireOpaqueId(providerSessionId),
    );
  }

  return {
    async get(conversationId) {
      return sessions.get(requireOpaqueId(conversationId)) ?? null;
    },
    async set(conversationId, providerSessionId) {
      sessions.set(
        requireOpaqueId(conversationId),
        requireOpaqueId(providerSessionId),
      );
    },
    async delete(conversationId) {
      sessions.delete(requireOpaqueId(conversationId));
    },
    release() {
      sessions.clear();
    },
  };
}

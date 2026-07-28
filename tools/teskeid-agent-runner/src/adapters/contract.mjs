const PROVIDER_KEY = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/u;
const SAFE_VERSION = /^[0-9A-Za-z][0-9A-Za-z .+_-]{0,159}$/u;

export class AdapterContractError extends Error {
  constructor(category = "adapter_invalid_contract") {
    super(category);
    this.name = "AdapterContractError";
    this.category = category;
    this.retryable = false;
  }
}

export function validateProviderKey(value) {
  if (typeof value !== "string" || !PROVIDER_KEY.test(value)) {
    throw new AdapterContractError();
  }
  return value;
}

export function defineAdapterFactory({ provider, create }) {
  return Object.freeze({
    provider: validateProviderKey(provider),
    create:
      typeof create === "function"
        ? create
        : (() => {
            throw new AdapterContractError();
          })(),
  });
}

export function validateAdapter(adapter, expectedProvider) {
  if (
    !adapter ||
    typeof adapter !== "object" ||
    Array.isArray(adapter) ||
    validateProviderKey(adapter.provider) !== expectedProvider ||
    typeof adapter.version !== "string" ||
    !SAFE_VERSION.test(adapter.version) ||
    typeof adapter.run !== "function" ||
    (adapter.clear !== undefined && typeof adapter.clear !== "function")
  ) {
    throw new AdapterContractError();
  }
  return adapter;
}

export class AdapterRegistry {
  #factories = new Map();

  constructor(factories = []) {
    for (const factory of factories) this.register(factory);
  }

  register(factory) {
    const definition = defineAdapterFactory(factory);
    if (this.#factories.has(definition.provider)) {
      throw new AdapterContractError("adapter_duplicate_provider");
    }
    this.#factories.set(definition.provider, definition.create);
    return this;
  }

  providers() {
    return [...this.#factories.keys()].sort();
  }

  async create(provider, options) {
    const key = validateProviderKey(provider);
    const factory = this.#factories.get(key);
    if (!factory) {
      const error = new AdapterContractError("adapter_unsupported_provider");
      throw error;
    }
    return validateAdapter(await factory(options), key);
  }
}

export function createAdapterRegistry(factories = []) {
  return new AdapterRegistry(factories);
}

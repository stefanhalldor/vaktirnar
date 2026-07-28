# Teskeið agent bridge protocol v1

This document is the contract assumed by the reference runner. All endpoints
are `POST`, use JSON, and live on the single origin supplied with `--url`.
Redirects are rejected.

## Pair

`POST /api/agent-bridge/v1/pair`

```json
{
  "protocolVersion": 1,
  "code": "one-time-code",
  "provider": "codex",
  "capabilities": ["chat.reply.read_only"]
}
```

Response:

```json
{
  "accessToken": "connector-bearer-token",
  "connectorId": "opaque-id",
  "providerKey": "codex",
  "displayName": "Local Codex",
  "tokenExpiresAt": "2026-08-26T18:00:00.000Z",
  "pollIntervalMs": 3000
}
```

The runner validates `tokenExpiresAt` as an ISO timestamp. Interactive mode
keeps it and `accessToken` in process memory only. Explicit Windows background
mode stores the connector metadata and bearer in a current-user DPAPI-protected,
user-ACL local file so the same per-user connector can restart at logon. It
never stores the pairing code, prompts, replies, provider/API keys, or raw
events. Every other endpoint has `Authorization: Bearer <accessToken>`.
Protocol v1 does not refresh a token in place; a 401 stops the runner, clears
the local protected state in background mode, and requires revoke/re-pair as
appropriate.

## Claim

The runner creates one random `leaseOwnerId` UUID per process.

`POST /api/agent-bridge/v1/claim`

```json
{"protocolVersion":1,"leaseOwnerId":"runner-instance-uuid"}
```

An empty claim is HTTP 200:

```json
{"run":null,"pollAfterMs":3000}
```

A claimed run is:

```json
{
  "run": {
    "id": "opaque-run-id",
    "leaseId": "opaque-lease-id",
    "conversationId": "opaque-conversation-id",
    "prompt": "collaboration message",
    "mode": "read_only_reply",
    "createdAt": "2026-07-27T18:00:00.000Z",
    "agentSessionId": null
  },
  "pollAfterMs": 3000
}
```

The runner rejects any mode other than `read_only_reply`. It keys its provider
thread map by `conversationId`. Interactive mode keeps that map in memory;
Windows background mode can persist only the opaque ID pair inside the same
DPAPI state. The Codex reference adapter does not trust a server-supplied
`agentSessionId`.

## Heartbeat

While the provider is working, the runner periodically sends:

`POST /api/agent-bridge/v1/heartbeat`

```json
{
  "protocolVersion": 1,
  "runId": "opaque-run-id",
  "leaseId": "opaque-lease-generation-id",
  "leaseOwnerId": "runner-instance-uuid"
}
```

Loss of the heartbeat lease cancels the local provider run. A heartbeat has a
new idempotency key per logical heartbeat; retries of that request reuse it.
Both `leaseId` and `leaseOwnerId` are required so a stale lease generation
cannot heartbeat or finish work after the run has been re-leased.

## Complete

`POST /api/agent-bridge/v1/complete`

```json
{
  "protocolVersion": 1,
  "runId": "opaque-run-id",
  "leaseId": "opaque-lease-generation-id",
  "leaseOwnerId": "runner-instance-uuid",
  "body": "bounded final agent reply"
}
```

Only the final text is uploaded. Raw Codex JSONL events, commands, reasoning,
thread IDs, filesystem paths, and process output are not uploaded.

## Fail

`POST /api/agent-bridge/v1/fail`

```json
{
  "protocolVersion": 1,
  "runId": "opaque-run-id",
  "leaseId": "opaque-lease-generation-id",
  "leaseOwnerId": "runner-instance-uuid",
  "failureCategory": "runner_error",
  "retryable": true
}
```

Failures contain one of `provider_unavailable`, `provider_auth`, `runner_error`,
`timeout`, `output_too_large`, or `cancelled`; never exception text, stderr,
provider output, a prompt, a path, or an HTTP response body. More specific safe
categories may remain in local diagnostic logs but are not sent to the API.

## Idempotency and retries

Every request includes `Idempotency-Key`. Claim uses one random key per logical
request and reuses it for that request's transport retries. Complete and fail
derive stable SHA-256 keys from protocol version, action, runner instance, run
ID, and lease generation ID. Their network/408/425/429/5xx retries reuse the
same key. Pair is deliberately **not retried**: because the raw bearer is
returned only once and the server stores only its hash, a lost pair response has
an uncertain outcome. The runner reports `pairing_outcome_uncertain` and the
user must create a fresh one-time code. A definite HTTP 429 is reported as
`pairing_rate_limited`, not as an uncertain exchange. The server remains the
authority and must enforce all other idempotency transactionally.

After claim's bounded per-request retries are exhausted, the connection loop
keeps the in-memory connector token and retries retryable network,
408/425/429, and 5xx failures with bounded exponential backoff and jitter. A
401, connector-token expiry, cancellation, or non-retryable protocol response
ends the connection. An interactive process restart requires a new one-time
pairing. An explicitly installed Windows background connector can reuse only
its locally DPAPI-protected, non-expired bearer.

## Required server guarantees

The reference client assumes that the server:

- stores only hashes of one-time pairing codes and connector tokens;
- gives connector tokens a bounded lifetime, supports immediate revocation,
  and requires a fresh one-time pairing after expiry or revocation;
- rechecks the owner's private-beta entitlement on pairing and every connector
  operation, and does not revive an older credential after access is re-granted;
- makes pairing codes short-lived, single-use, capability-scoped, and bound to
  the authenticated user's private workspace;
- isolates every workspace, conversation, run, and connector by tenant;
- rejects expired/revoked tokens and capabilities other than
  `chat.reply.read_only`;
- leases each run to exactly one `(leaseId, leaseOwnerId)` generation, expires
  abandoned leases, and validates both values on heartbeat, completion, and
  failure;
- derives message idempotency from the run and never creates duplicate agent
  messages on retries;
- bounds all strings and request bodies at the edge;
- never treats ordinary chat text as approval for file writes, SQL, commits,
  pushes, deployments, secret access, or other side effects;
- keeps secrets, prompts, message bodies, addresses, paths, tokens, and raw
  provider responses out of logs.

The local provider workspace must be a sanitized checkout with no secrets.
Protocol v1 does not turn a read-only filesystem into a file-read allowlist.

The bridge is not a remote shell. Future write-capable work requires a separate
structured action/approval protocol and is outside protocol v1.

`provider` and `capabilities` are protocol declarations, not remote
attestation. The server validates their shape and limits the HTTP contract, but
it cannot prove what an independently distributed connector does on the local
machine. Public distribution therefore requires a signed/approved connector
policy in addition to this protocol. Until then, custom connectors are an
explicit private-beta trust decision by the user.

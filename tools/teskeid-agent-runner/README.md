# Teskeið agent runner (reference adapter)

This is a small, provider-neutral reference runner for connecting a coding AI
to a private Teskeið collaboration channel. Version 1 intentionally supports
only **read-only replies**. It cannot approve or perform file writes, commits,
pushes, deployments, SQL, or web searches, and the runner never supplies
connector secrets to the provider.

**Status: private beta/reference implementation.** Do not use it with a
repository that contains secrets or with participants you do not trust.

The included Codex adapter starts its **own dedicated Codex CLI thread**. It
does not attach to, wake, or inject messages into an existing Codex IDE or
ChatGPT conversation. Conversation-to-thread mappings live only in this
process, so restarting the runner starts fresh dedicated threads.

This directory is also the reference for other coding-AI providers. A provider
adapter only has to accept an opaque claimed run and return a bounded text
reply; bridge authentication, leasing, retries, safe logging, and completion
stay provider-independent.

## Using Teskeið with another coding AI

The Teskeið service is multi-tenant and provider-neutral: every signed-in user
gets a separate personal conversation and pairs a connector with a short-lived,
single-use code. An external provider does not need access to Teskeið cookies,
Supabase, or user identity. Its trusted local connector implements the bounded
outbound-only HTTP flow in [PROTOCOL.md](./PROTOCOL.md): pair, claim, heartbeat,
complete, and fail.

Only the Codex reference connector is shipped here. “Claude Code” and “other”
in the UI mean bring-your-own connectors; they are not implemented, signed, or
verified by Teskeið. A custom connector must use one fixed provider key, request
only `chat.reply.read_only`, keep its bearer token in memory, enforce its own
read-only provider boundary, and never upload raw events or secrets. Teskeið
can restrict its bridge to prompts and text replies, but cannot prevent an
untrusted third-party program from doing something else on the user's computer.

Broad external availability is a later release gate. Before that, Teskeið needs
signed connector distribution, OS/container filesystem isolation, distributed
pairing and connector rate limits, retention/privacy terms, and operational
support. The current code is suitable for controlled private-beta validation,
not an unqualified public security promise.

The server-side feature is fail-closed: both `AUTH_MVP_ENABLED` and
`AGENT_COLLABORATION_ENABLED` must be exactly `true`. SQL migration 95 must also
be applied separately, and the signed-in user must have the server-managed
`agent-collaboration-private-beta` feature-access row. Removing that row blocks
browser access and every connector operation immediately. Re-granting access
does not revive an older pairing or token; the user must pair again. This
repository change does not set either flag, grant access, or run the migration.

## Requirements

- Node.js 20 or newer
- A locally authenticated Codex CLI for the included adapter
- A short-lived, one-time pairing code created inside Teskeið
- A local repository directory that the agent may inspect

No package installation is required.

## Check the local adapter

From the repository root:

```powershell
node tools/teskeid-agent-runner/bin/teskeid-agent-runner.mjs doctor --provider=codex
```

If Codex is not on `PATH`, the runner also checks common VS Code extension
locations. An explicit executable can be supplied with `--codex-bin=PATH`.
The resolved path is never printed.

## Pair and connect

Prefer passing the one-time code over stdin so it does not remain in shell
history:

```powershell
Read-Host "Pairing code" | node tools/teskeid-agent-runner/bin/teskeid-agent-runner.mjs connect --url=https://www.teskeid.is --code=- --provider=codex --cwd=C:\path\to\repo
```

`--code=CODE` is also supported. A non-local URL must use HTTPS. The runner
connects outward to the configured Teskeið origin; it opens no inbound port.
Stop it with Ctrl+C. If pairing reports `pairing_outcome_uncertain`, create a
fresh one-time code; the runner deliberately never retries a pairing exchange
whose response may have been lost. A definite HTTP 429 is instead reported as
`pairing_rate_limited`; wait before creating or submitting another code.

Connector tokens have a server-declared expiry (30 days in the initial
Teskeið deployment). The runner validates the returned ISO expiry, stores it
only in memory, does not rotate it automatically, and stops when the bridge
returns 401. Re-pair with a new one-time code after expiry or revocation.
An intentional runner process restart also requires a fresh pairing code,
because the connector token is deliberately never persisted to disk.

After the bridge client's bounded per-request retries, temporary claim network,
408/425/429, and 5xx failures keep the same in-memory connection alive. The
runner retries claims with bounded exponential backoff and jitter. It stops on
401, token expiry, cancellation, or a non-retryable/protocol-invalid response.

## Enforced Codex invocation

The reference adapter always launches Codex without a shell and with these
hard-coded controls:

```text
codex -a never -s read-only -C <workspace> \
  -c shell_environment_policy.inherit="core" -c web_search="disabled" \
  -c developer_instructions=<fixed-read-only-policy> \
  -c project_doc_max_bytes=0 -c features.hooks=false \
  -c features.apps=false -c features.multi_agent=false \
  -c projects.<quoted-workspace>.trust_level="untrusted" \
  exec --ignore-user-config --ignore-rules --json -
```

For a subsequent message in the same in-memory conversation mapping it uses
`exec resume --ignore-user-config --ignore-rules --json <thread-id> -` with the
same global controls. The fixed safety policy is a Codex developer instruction;
child stdin contains only the untrusted collaboration message, and the prompt
is never placed in process arguments. The workspace is forced untrusted,
project instruction documents are disabled, user/project rules are ignored,
and hooks, apps, subagents, and web search are disabled. Raw JSONL events are
discarded locally, and only the final bounded `agent_message` text is returned
to Teskeið.

The runner itself never writes configuration, connector credentials, prompts,
or responses to disk. The pairing code and bearer token stay in process memory
and are not passed to the provider subprocess. The Codex process receives a
small cross-platform allowlist of OS, locale, TLS/proxy, Codex-home, and provider
authentication environment variables; unrelated environment variables are
dropped. Model-launched shell commands are separately constrained by
`shell_environment_policy.inherit="core"`. Codex CLI authentication and
its dedicated session history remain governed by the user's existing Codex
installation; this runner does not copy or manage them. Do not send secrets in
collaboration messages.

Important: `read-only` prevents Codex tools from changing the checkout and from
using network tools, but it is not a file-read allowlist. The child process may
be able to read any file permitted to its operating-system user, including files
outside `--cwd`. A sanitized checkout alone is therefore insufficient when that
same user can read `.env` files, private keys, credentials, production exports,
or other secrets elsewhere. Run this private beta under an isolated OS user or
container whose filesystem allowlist contains only the sanitized checkout and
the minimum provider authentication material. The developer instruction
forbids secret access, but instructions and legacy read-only sandboxing are not
a hardened boundary. A hosted or multi-party adapter must enforce this boundary
before it can be considered production-hardened.

## Safe diagnostics

Logs are JSON records chosen from a fixed event and metadata allowlist. They do
not include the pairing code, bearer token, prompt, response body, repository
path, request/response body, URL, user identity, provider event stream, or
exception text. Example:

```json
{"event":"job_failed","category":"adapter_process_failed","retryable":true}
```

## Provider adapter contract

An adapter created by `src/adapters/registry.mjs` exposes:

```js
{
  provider: "provider-key",
  version: "safe-version",
  async run(run, { signal }) { return { text: "bounded reply" }; },
  clear() {}
}
```

Provider implementations must enforce the same or stronger read-only boundary,
keep provider session handles out of logs, honor cancellation, and return no
raw provider events. Add a provider explicitly to the registry; never select an
arbitrary executable from a server-supplied value.

See [PROTOCOL.md](./PROTOCOL.md) for the HTTP contract and server-side security
requirements.

## Tests

```powershell
node --test tools/teskeid-agent-runner/test/bridge-client.test.mjs tools/teskeid-agent-runner/test/codex-adapter.test.mjs tools/teskeid-agent-runner/test/runner.test.mjs
```

The tests use fake HTTP and provider adapters. They make no network calls and
do not invoke Codex.

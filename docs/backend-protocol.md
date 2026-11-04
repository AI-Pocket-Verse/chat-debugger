# Backend protocol

English | [简体中文](backend-protocol.zh-CN.md)

chat-debugger runs entirely in the browser and calls the backend under test directly. The backend has to implement the endpoints below. [`mock/server.mjs`](../mock/server.mjs) is a complete, dependency-free reference implementation.

## Conventions

- **Base URL**: you enter a prefix such as `https://example.com/companion`; endpoints are appended to it, e.g. `https://example.com/companion/debug/token`.
- **CORS**: the browser calls the backend directly, so the backend must allow the debugger's origin and the request headers `Content-Type`, `X-Debug-Key`, `Authorization`, plus any headers you configure under *Extra headers*. Alternatively, reverse-proxy the backend under the debugger's own domain (see *Deployment* in the README).
- **Extra headers**: the JSON object configured in the UI is added to every request (useful for client-version headers and the like).
- **Envelope**: every response except the `/chat` stream is `{"code": 200, "msg": "ok", "data": {...}}`. Business errors (wrong key, expired token, …) may use HTTP 200 with a non-200 `code`; the debugger checks `code` and shows `msg` as the error. On error, `/chat` may return this JSON envelope (`Content-Type: application/json`) instead of an event stream.
- **Auth**: `/debug/*` admin endpoints use the `X-Debug-Key` header. `/chat` and `/debug/prompt-preview` use the `Authorization` header with the raw token returned by `/debug/token` (no `Bearer` prefix).
- Unknown request fields should be ignored, and extra response fields are ignored by the debugger.

## Session endpoints

### `POST /debug/token` (`X-Debug-Key`)

Creates a new test account and returns its session token.

- Request: `{"ta_gender": 1 | 2, "count": 1}`. `ta_gender` selects the role the account is bound to: `1` → role 1, `2` → role 2 (roles with other ids are requested with `2`).
- Response `data`: `{"tokens": [{"token", "uid", "memory_id", "user_code", "expires_at"}]}`. `token`, `uid` and `memory_id` are required; `user_code` and `expires_at` are optional.

The role is bound to the token at this step: `/chat` routes by token, so the debugger keeps one token per role and switches tokens when you switch roles.

### `GET /debug/roles` (`X-Debug-Key`)

Role list for the role picker. Response `data`:

```json
{
  "roles": [
    {
      "id": 1,
      "name": "Sample Role A",
      "gender": 1,
      "prompt_persona": {
        "identity_base": "…",
        "daily_style": "…",
        "relationship_base": "…",
        "emotion_support": "…",
        "media_policy": "…",
        "reality_boundary": "…",
        "safety_boundary": "…"
      }
    }
  ]
}
```

- `id` and `name` are required.
- `prompt_persona` is optional. When present, its string fields are shown in the left *Prompt assembly* panel before the first message of a role, so you can read the persona without chatting first. Any subset of the seven keys works.

### `GET /debug/models` (`X-Debug-Key`, optional)

Model list for the *Model* picker in *Connection*. Response `data`:

```json
{ "models": [{ "id": "mock-fast", "name": "Mock Fast" }, { "id": "mock-pro" }], "default": "mock-fast" }
```

- `id` is required, `name` is optional. `default` is the model used when the client does not send one; it is only used for display.
- If the endpoint is missing or fails, the debugger falls back to a free-text model ID field.

## `POST /chat` (`Authorization`)

Request body:

| Field | Type | Notes |
| --- | --- | --- |
| `content` | string | What the user said this turn |
| `content_type` | `"text"` | Always text |
| `role_id` | number | The selected role; may be ignored because the role is bound to the token |
| `debug_trace` | `true` | Asks the backend to emit trace frames |
| `model` | string, optional | Only sent when a model is selected in *Connection*. Absent means "use the backend default". An unknown model should produce an error (JSON envelope or error frame) |

Response: `text/event-stream`. Each frame is one line `data: <envelope JSON>` followed by a blank line.

| Frame | Shape | Handling |
| --- | --- | --- |
| Text | `{"code": 200, "data": {"text": "delta"}}` | Appended to the answer; other fields in `data` are optional metadata |
| Trace | `{"code": 200, "data": {"status": "pipeline_trace" \| "pipeline_trace_final", "session_id", "ts", "trace": {...}}}` | Updates the trace graph and the prompt sections. `pipeline_trace_final` is the final version that includes the generation result |
| Done | `{"code": 200, "type": "done"}` | End of the turn |
| Error | `{"code": <non-200>, "type": "done", "data": {"error_type", "message", "retryable"}}` | The turn failed; `data.message` (or `msg`) is shown |

If the stream closes without a done frame, the debugger marks the answer as possibly incomplete. If a turn ends without any trace frame (early return, audio turn, …), the reply is marked *No trace this turn* and the debugger infers the likely branch from the reply text.

The full `trace` shape is `ChatPipelineTrace` in [`web/src/types/trace.ts`](../web/src/types/trace.ts): input, safety, emotion and intent, relationship and persona, routing decision, prompt sections, memory and generation stats. Missing fields show up as "not hit" or "—" in the graph instead of failing. Put the model that actually served the turn in `trace.generation.model`; the debugger shows it in the trace graph.

## Admin endpoints (`X-Debug-Key`)

| Endpoint | Request | Response `data` |
| --- | --- | --- |
| `POST /debug/preset` | `{"uid", "role_id", "stage", "love_score", "trust_score", "dependency_risk", "active_state"}` | anything |
| `POST /debug/prompt-override` | see below | see below |

`/debug/preset` sets the relationship state of a test account directly; it takes effect on the next turn. `stage` is 0–4 (S0 just met … S4 steady partners), `active_state` is one of `active`, `cooling`, `dormant`, `rewarming`.

`/debug/prompt-override` is a **global** prompt-section override shared by everyone using the backend:

| `action` | Other fields | Response `data` |
| --- | --- | --- |
| `get` | — | `{"override_active", "safety_touched", "overridable_sections": [...], "override": {"sections": {"Name": "content"}} \| null}` |
| `set` | `sections: {"Name": "content"}`, `ttl_seconds` (0 = forever), `operator` | same as `get` |
| `clear` | `operator` | same as `get` (clears the overrides of **all** sections; there is no per-section clear) |
| `history` | `limit` | `{"history": [{"at", "action", "operator", "sections", "ttl_seconds"}]}` — `at` is an RFC 3339 timestamp with time zone |

## `POST /debug/prompt-preview` (`Authorization`)

Request `{"input": "latest user message"}`. Returns the prompt sections the backend would assemble right now, without side effects:

```json
{ "sections": [{ "name": "CurrentTime", "chars": 30, "content": "…", "source_node": "context", "overridden": false }], "total_chars": 30 }
```

The left panel groups sections by `source_node`. *Refresh live* calls this endpoint to update time- and memory-dependent sections without sending a message.

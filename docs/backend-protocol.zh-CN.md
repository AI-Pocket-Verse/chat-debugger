# 被测后端接口约定

[English](backend-protocol.md) | 简体中文

chat-debugger 完全运行在浏览器里，直接调用被测对话后端，后端需要实现下面这些接口。[`mock/server.mjs`](../mock/server.mjs) 是一份完整的示例实现，没有第三方依赖，可以对照着看。

## 共同约定

- **地址**：填的是前缀，如 `https://example.com/companion`，接口拼成 `https://example.com/companion/debug/token`。
- **跨域**：浏览器直连后端，所以后端要放行观测台页面的 Origin，并允许请求头 `Content-Type`、`X-Debug-Key`、`Authorization` 以及「额外请求头」里配置的头。也可以用反向代理把后端挂到观测台同域名下（见 README「部署」）。
- **额外请求头**：界面里配置的 JSON 对象会加到每个请求上，用于后端要求的客户端版本头等。
- **响应信封**：除 `/chat` 的流式响应外都返回 `{"code": 200, "msg": "ok", "data": {...}}`。业务错误（口令错、token 失效等）可以用 HTTP 200 + 非 200 的 `code`，观测台会检查 `code` 并把 `msg` 显示为错误原因。`/chat` 出错时可以直接返回这个 JSON 信封（`Content-Type: application/json`）代替事件流。
- **鉴权**：`/debug/*` 管理类接口用请求头 `X-Debug-Key`；`/chat` 和 `/debug/prompt-preview` 用请求头 `Authorization`，值是 `/debug/token` 返回的 token 原文，不加 `Bearer` 前缀。
- 后端应忽略不认识的请求字段；响应里多出来的字段观测台也会忽略。

## 会话类接口

### `POST /debug/token`（`X-Debug-Key`）

为一个新的测试账号铸造会话 token。

- 请求：`{"ta_gender": 1 | 2, "count": 1}`。`ta_gender` 决定账号绑定哪个角色：`1` 对应角色 1，`2` 对应角色 2（其他 id 的角色一律按 `2` 请求）。
- 响应 `data`：`{"tokens": [{"token", "uid", "memory_id", "user_code", "expires_at"}]}`。`token`、`uid`、`memory_id` 必需，`user_code`、`expires_at` 可选。

角色在这一步就绑定到 token 上：`/chat` 按 token 找角色，所以观测台按角色分别保存 token，切换角色时同时切换 token。

### `GET /debug/roles`（`X-Debug-Key`）

角色下拉的数据来源。响应 `data`：

```json
{
  "roles": [
    {
      "id": 1,
      "name": "示例角色 A",
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

- `id`、`name` 必需。
- `prompt_persona` 可选。有这个字段时，某个角色还没发过消息，左侧「提示词组装」会先展示其中的字符串字段，不用先聊一轮就能看到人设。七个键给出任意几个都可以。

### `GET /debug/models`（`X-Debug-Key`，可选）

「连接配置」里「模型」下拉的数据来源。响应 `data`：

```json
{ "models": [{ "id": "mock-fast", "name": "Mock Fast" }, { "id": "mock-pro" }], "default": "mock-fast" }
```

- `id` 必需，`name` 可选。`default` 是客户端不指定模型时后端使用的模型，只用于显示。
- 后端没有实现这个接口或调用失败时，观测台退回到手动填写模型 ID 的输入框。

## `POST /chat`（`Authorization`）

请求体：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `content` | string | 用户这一轮说的话 |
| `content_type` | `"text"` | 固定为文本 |
| `role_id` | number | 当前选中的角色；角色已绑定在 token 上，后端可以忽略 |
| `debug_trace` | `true` | 要求后端下发 trace 帧 |
| `model` | string，可选 | 只有在「连接配置」里选了模型时才发送；不带表示使用后端默认模型。不认识的模型应返回错误（JSON 信封或错误帧） |

响应：`text/event-stream`，每帧一行 `data: <信封 JSON>`，以空行结束。

| 帧 | 形状 | 处理 |
| --- | --- | --- |
| 正文 | `{"code": 200, "data": {"text": "增量文字"}}` | 累加成回答；`data` 里的其他字段为可选元数据 |
| trace | `{"code": 200, "data": {"status": "pipeline_trace" \| "pipeline_trace_final", "session_id", "ts", "trace": {...}}}` | 更新链路图与 prompt 分段；`pipeline_trace_final` 是带生成结果的最终版 |
| 结束 | `{"code": 200, "type": "done"}` | 本轮结束 |
| 出错 | `{"code": <非 200>, "type": "done", "data": {"error_type", "message", "retryable"}}` | 本轮出错，显示 `data.message`（没有时用 `msg`） |

流在没有结束帧的情况下关闭时，观测台会把回答标为「可能不完整」。一轮结束都没收到 trace 帧（早返回、音频轮等）时，回复会标为「本轮未产生链路」，并根据回复正文推断可能的分支。

`trace` 的完整字段见 [`web/src/types/trace.ts`](../web/src/types/trace.ts) 的 `ChatPipelineTrace`：输入、安全、情绪与意图、关系与人格、路由决策、prompt 分段、记忆、生成统计。缺少的字段在链路图上显示为「未命中」或「—」，不会报错。实际生成这一轮的模型请放在 `trace.generation.model`，观测台会在链路图里显示。

## 管理类接口（`X-Debug-Key`）

| 接口 | 请求 | 响应 `data` |
| --- | --- | --- |
| `POST /debug/preset` | `{"uid", "role_id", "stage", "love_score", "trust_score", "dependency_risk", "active_state"}` | 任意 |
| `POST /debug/prompt-override` | 见下 | 见下 |

`/debug/preset` 直接设定测试账号的关系状态，下一轮对话生效。`stage` 取 0–4（S0 初识 … S4 稳定恋人），`active_state` 取 `active`、`cooling`、`dormant`、`rewarming` 之一。

`/debug/prompt-override` 是**全局**的 prompt 分段覆盖，所有使用这个后端的人共享：

| `action` | 其他字段 | 响应 `data` |
| --- | --- | --- |
| `get` | -- | `{"override_active", "safety_touched", "overridable_sections": [...], "override": {"sections": {"段名": "内容"}} \| null}` |
| `set` | `sections: {"段名": "内容"}`、`ttl_seconds`（0 为永久）、`operator` | 同 `get` |
| `clear` | `operator` | 同 `get`（清空的是**全部**段的覆盖，协议没有按段清除） |
| `history` | `limit` | `{"history": [{"at", "action", "operator", "sections", "ttl_seconds"}]}`，`at` 为带时区的 RFC 3339 时间 |

## `POST /debug/prompt-preview`（`Authorization`）

请求 `{"input": "最近一条用户消息"}`，返回此刻会拼出的 prompt 分段，无副作用：

```json
{ "sections": [{ "name": "CurrentTime", "chars": 30, "content": "…", "source_node": "context", "overridden": false }], "total_chars": 30 }
```

左侧按 `source_node` 分组展示这些分段。「刷新实时段」调用这个接口，不发消息就能更新时间、记忆等实时段。

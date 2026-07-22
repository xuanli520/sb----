# API Contract

[`novel-platform.openapi.json`](novel-platform.openapi.json) is the checked-in OpenAPI 3.1 contract for the implemented backend controllers.

The document uses backend paths such as `/api/v1/public/books`. Browser callers use the same route suffix through the Next BFF instead: `/api/novel/public/books`. The BFF is the only browser-facing route for protected resources; it owns the opaque session cookie, CSRF check, and private upstream headers. The internal `/api/v1/auth/*` entries remain in the contract so BFF-to-backend session behavior is explicit, but they are not exposed through the browser catch-all proxy.

The contract deliberately describes only implemented behavior. Email registration verification is available only through a fully configured authenticated SMTP provider and fails closed when that deployment configuration is absent. It does not expose or claim production availability for phone verification, WeChat/QQ OAuth, payment providers, or Qwen credentials. Platform tokens and redemption codes are not a fiat payment API.

Validate syntax and controller coverage after changing an API mapping or DTO contract:

```bash
node -e "JSON.parse(require('fs').readFileSync('docs/openapi/novel-platform.openapi.json', 'utf8'))"
DEBUG=false mvn --batch-mode --no-transfer-progress -pl apps/backend -Dtest=OpenApiContractTest test
```

`OpenApiContractTest` reads Spring's live request mappings and fails if a documented backend operation has no controller or a controller operation is missing from the artifact. Each operation's `x-response-data-schema` points to its `data` schema inside the standard `{ code, msg, data }` response envelope.

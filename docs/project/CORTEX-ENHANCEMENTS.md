# MAGE IDE -- Cortex Enhancements

All Cortex-side changes needed to support MAGE IDE integration. These are modifications to the [AulendurForge/Cortex](https://github.com/AulendurForge/Cortex) codebase.

## Enhancement Summary

| Enhancement | Phase | Priority | Cortex File(s) | Complexity |
|-------------|-------|----------|----------------|------------|
| CORS for Electron origins | Phase 1 | High | `backend/src/main.py` | Low |
| `POST /v1/fim/completions` | Phase 2 | High | New: `backend/src/routes/fim.py` | Medium |
| FIM proxy to llama.cpp `/infill` | Phase 2 | High | `backend/src/routes/fim.py` | Medium |
| FIM template registry | Phase 2 | High | New: `backend/src/fim_templates.py` | Low |
| `GET /v1/ide/status` | Phase 3 | Medium | New: `backend/src/routes/ide.py` | Low |
| `supports_tool_calling` field | Phase 4 | Medium | `backend/src/routes/models.py` | Low |

---

## Enhancement 1: CORS for Electron Origins

**Phase:** 1
**Priority:** High
**Complexity:** Low

### Problem

MAGE IDE runs in Electron. When the renderer process makes fetch requests to Cortex, the `Origin` header may be `file://` or `null` (depending on Electron's security settings and the protocol used). Cortex's CORS configuration needs to accept these origins.

### Implementation

File: `docker.compose.dev.yaml` (or `.env` configuration)

Add Electron-compatible origins to the CORS allowlist:

```yaml
environment:
  CORS_ALLOW_ORIGINS: >-
    http://localhost:3001,
    http://127.0.0.1:3001,
    http://${HOST_IP}:3001,
    file://,
    null,
    mage-ide://
```

Alternatively, in `backend/src/main.py`, update the CORS middleware to handle these origins:

```python
# In the FastAPI app setup
origins = os.getenv("CORS_ALLOW_ORIGINS", "").split(",")
origins = [o.strip() for o in origins if o.strip()]

# Always allow Electron origins for MAGE IDE
origins.extend(["file://", "null", "mage-ide://"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Testing

```bash
# Test from Electron-like origin
curl -H "Origin: file://" -H "Authorization: Bearer $TOKEN" \
    http://localhost:8084/v1/models/running

# Should return 200 with Access-Control-Allow-Origin header
```

---

## Enhancement 2: FIM Completions Endpoint

**Phase:** 2
**Priority:** High
**Complexity:** Medium

### Problem

MAGE IDE's inline code completion needs Fill-in-the-Middle (FIM) support. The current `/v1/completions` endpoint requires the IDE to build model-specific FIM prompts. A dedicated endpoint abstracts this complexity.

### Endpoint Specification

**Route:** `POST /v1/fim/completions`
**Authentication:** API key (`Authorization: Bearer <key>`)
**Scope:** `completions`

### Request Schema

```python
class FIMRequest(BaseModel):
    model: str                          # Model served_name
    prefix: str                         # Code before cursor
    suffix: str                         # Code after cursor
    max_tokens: int = 128               # Max tokens to generate
    temperature: float = 0.2            # Low temp for code
    top_p: float = 0.95                 # Nucleus sampling
    stop: list[str] = []                # Additional stop tokens
    stream: bool = True                 # SSE streaming
    filepath: str | None = None         # Optional file path hint
    language: str | None = None         # Optional language hint
```

### Response Schema (Non-Streaming)

```json
{
    "id": "fim-abc123",
    "object": "text_completion",
    "created": 1707300000,
    "model": "codestral-22b",
    "choices": [
        {
            "index": 0,
            "text": "total += item.price * item.quantity;",
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 245,
        "completion_tokens": 12,
        "total_tokens": 257
    }
}
```

### Response Schema (Streaming)

Standard SSE format matching OpenAI's streaming completions:

```
data: {"id":"fim-abc123","object":"text_completion","choices":[{"index":0,"text":"total","finish_reason":null}]}

data: {"id":"fim-abc123","object":"text_completion","choices":[{"index":0,"text":" += ","finish_reason":null}]}

data: {"id":"fim-abc123","object":"text_completion","choices":[{"index":0,"text":"item.price","finish_reason":null}]}

data: [DONE]
```

### Response Headers

```
X-Cortex-TTFT-Ms: 45          # Time to first token in milliseconds
X-Cortex-Model-Engine: vllm    # Which engine served the request
X-Cortex-FIM-Template: codestral  # Which FIM template was used
```

### Implementation

New file: `backend/src/routes/fim.py`

```python
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from ..auth import verify_api_key
from ..fim_templates import build_fim_prompt, get_fim_stop_tokens
from ..proxy import proxy_to_model

router = APIRouter()

@router.post("/v1/fim/completions")
async def fim_completion(request: FIMRequest, api_key_data=Depends(verify_api_key)):
    """
    Fill-in-the-Middle completion for IDE code completion.
    Builds the FIM prompt based on the model's template, then routes
    to the appropriate engine.
    """
    # 1. Look up model in registry
    model_entry = await get_model_by_served_name(request.model)
    if not model_entry:
        raise HTTPException(404, f"Model '{request.model}' not found or not running")

    # 2. Determine routing strategy
    if model_entry.engine_type == "llamacpp":
        # Use llama.cpp's native /infill endpoint
        return await proxy_fim_to_llamacpp(model_entry, request)
    else:
        # Build FIM prompt and send to /v1/completions
        return await proxy_fim_to_vllm(model_entry, request)


async def proxy_fim_to_llamacpp(model_entry, request: FIMRequest):
    """
    llama.cpp has a native /infill endpoint that handles FIM internally.
    Proxy directly to it.
    """
    infill_request = {
        "input_prefix": request.prefix,
        "input_suffix": request.suffix,
        "n_predict": request.max_tokens,
        "temperature": request.temperature,
        "top_p": request.top_p,
        "stop": request.stop,
        "stream": request.stream,
    }

    container_url = f"http://{model_entry.container_name}:8000/infill"
    return await proxy_request(container_url, infill_request, stream=request.stream)


async def proxy_fim_to_vllm(model_entry, request: FIMRequest):
    """
    Build FIM prompt using model-specific template, then send to /v1/completions.
    """
    fim_prompt = build_fim_prompt(
        model_name=model_entry.served_model_name,
        repo_id=model_entry.repo_id,
        prefix=request.prefix,
        suffix=request.suffix,
        filepath=request.filepath,
        language=request.language,
    )

    stop_tokens = get_fim_stop_tokens(model_entry.served_model_name, model_entry.repo_id)
    all_stops = list(set(request.stop + stop_tokens))

    completion_request = {
        "model": model_entry.served_model_name,
        "prompt": fim_prompt,
        "max_tokens": request.max_tokens,
        "temperature": request.temperature,
        "top_p": request.top_p,
        "stop": all_stops,
        "stream": request.stream,
    }

    container_url = f"http://{model_entry.container_name}:8000/v1/completions"
    return await proxy_request(container_url, completion_request, stream=request.stream)
```

Register the router in `backend/src/main.py`:

```python
from .routes.fim import router as fim_router
app.include_router(fim_router)
```

---

## Enhancement 3: FIM Template Registry

**Phase:** 2
**Priority:** High
**Complexity:** Low

### Implementation

New file: `backend/src/fim_templates.py`

```python
"""
FIM (Fill-in-the-Middle) template registry.
Maps model families to their specific FIM token formats.
"""

from typing import Optional

# Template definitions: (prefix_format, suffix_format, middle_format)
FIM_TEMPLATES = {
    # Codestral / Mistral models (reversed order: suffix first)
    "codestral": {
        "format": "[SUFFIX]{suffix}[PREFIX]{prefix}[MIDDLE]",
        "stop_tokens": ["[PREFIX]", "[SUFFIX]", "[MIDDLE]", "</s>"],
    },
    # DeepSeek Coder family
    "deepseek": {
        "format": "<fim_prefix>{prefix}<fim_suffix>{suffix}<fim_middle>",
        "stop_tokens": ["<fim_prefix>", "<fim_suffix>", "<fim_middle>", "<|endoftext|>"],
    },
    # StarCoder family
    "starcoder": {
        "format": "<fim_prefix>{prefix}<fim_suffix>{suffix}<fim_middle>",
        "stop_tokens": ["<fim_prefix>", "<fim_suffix>", "<fim_middle>", "<|endoftext|>"],
    },
    # CodeLlama family
    "codellama": {
        "format": "<PRE>{prefix} <SUF>{suffix} <MID>",
        "stop_tokens": ["<PRE>", "<SUF>", "<MID>", "</s>"],
    },
    # Qwen Coder family
    "qwen": {
        "format": "<fim_prefix>{prefix}<fim_suffix>{suffix}<fim_middle>",
        "stop_tokens": ["<fim_prefix>", "<fim_suffix>", "<fim_middle>", "<|endoftext|>"],
    },
    # Generic fallback (prefix-only, no FIM tokens)
    "generic": {
        "format": "{prefix}",
        "stop_tokens": ["\n\n\n", "</s>"],
    },
}


def detect_model_family(model_name: str, repo_id: Optional[str] = None) -> str:
    """Detect model family from name or repo ID for FIM template selection."""
    search_text = f"{model_name} {repo_id or ''}".lower()

    if "codestral" in search_text or "mistral" in search_text:
        return "codestral"
    elif "deepseek" in search_text:
        return "deepseek"
    elif "starcoder" in search_text:
        return "starcoder"
    elif "codellama" in search_text or "code-llama" in search_text:
        return "codellama"
    elif "qwen" in search_text:
        return "qwen"
    else:
        return "generic"


def build_fim_prompt(
    model_name: str,
    repo_id: Optional[str],
    prefix: str,
    suffix: str,
    filepath: Optional[str] = None,
    language: Optional[str] = None,
) -> str:
    """Build a FIM prompt using the model's template."""
    family = detect_model_family(model_name, repo_id)
    template = FIM_TEMPLATES[family]

    # Optionally prepend filepath as context
    if filepath:
        prefix = f"# filepath: {filepath}\n{prefix}"

    return template["format"].format(prefix=prefix, suffix=suffix)


def get_fim_stop_tokens(model_name: str, repo_id: Optional[str] = None) -> list[str]:
    """Get FIM-specific stop tokens for a model."""
    family = detect_model_family(model_name, repo_id)
    return FIM_TEMPLATES[family]["stop_tokens"]
```

---

## Enhancement 4: IDE Status Endpoint

**Phase:** 3
**Priority:** Medium
**Complexity:** Low

### Problem

The MAGE IDE Model Manager panel needs to poll multiple pieces of information (running models, GPU metrics, system health). Making 4 separate API calls every 5 seconds is inefficient. A combined endpoint solves this.

### Endpoint Specification

**Route:** `GET /v1/ide/status`
**Authentication:** API key (`Authorization: Bearer <key>`)
**Scope:** `chat` (or a new `ide` scope)

### Response Schema

```json
{
    "running_models": [
        {
            "served_model_name": "gpt-oss-120b-abliterated",
            "task": "generate",
            "engine_type": "llamacpp",
            "state": "running"
        },
        {
            "served_model_name": "codestral-22b",
            "task": "generate",
            "engine_type": "vllm",
            "state": "running"
        }
    ],
    "system": {
        "cpu_pct": 45.2,
        "ram_pct": 62.1,
        "ram_used_gb": 49.7,
        "ram_total_gb": 80.0,
        "disk_pct": 35.0
    },
    "gpus": [
        {
            "index": 0,
            "name": "NVIDIA L40S",
            "mem_total_mb": 46080,
            "mem_used_mb": 38400,
            "utilization_pct": 92,
            "temperature_c": 71,
            "flash_attention_supported": true
        }
    ],
    "gateway_healthy": true,
    "total_models": 5,
    "running_model_count": 2,
    "timestamp": 1707300000
}
```

### Implementation

New file: `backend/src/routes/ide.py`

```python
from fastapi import APIRouter, Depends
from ..auth import verify_api_key
from ..system_metrics import get_system_summary, get_gpu_metrics
from ..models import get_running_models, get_model_count

router = APIRouter()

@router.get("/v1/ide/status")
async def ide_status(api_key_data=Depends(verify_api_key)):
    """
    Combined status endpoint for MAGE IDE.
    Returns running models, system health, and GPU metrics in one call.
    """
    running_models = await get_running_models()
    system = await get_system_summary()
    gpus = await get_gpu_metrics()
    total_models = await get_model_count()

    return {
        "running_models": running_models,
        "system": system,
        "gpus": gpus,
        "gateway_healthy": True,
        "total_models": total_models,
        "running_model_count": len(running_models),
        "timestamp": int(time.time()),
    }
```

Register in `backend/src/main.py`:

```python
from .routes.ide import router as ide_router
app.include_router(ide_router)
```

### Performance Notes

This endpoint aggregates data from:
- Model registry (in-memory, fast)
- psutil system metrics (fast, ~5ms)
- GPU metrics via NVML or DCGM (may take ~50ms)

Total expected latency: < 100ms. Safe to poll every 5 seconds.

---

## Enhancement 5: Tool Calling Metadata

**Phase:** 4
**Priority:** Medium
**Complexity:** Low

### Problem

MAGE IDE's agent mode needs to know which models support function/tool calling. Currently, the model constraints endpoint doesn't include this information.

### Implementation

File: `backend/src/routes/models.py`

Add `supports_tool_calling` to the model constraints response:

```python
@router.get("/v1/models/{model_name}/constraints")
async def get_model_constraints(model_name: str, ...):
    # ... existing logic ...

    # Determine tool calling support based on model family
    supports_tools = detect_tool_calling_support(model)

    return {
        "served_model_name": model.served_model_name,
        "engine_type": model.engine_type,
        "task": model.task,
        "context_size": model.context_size,
        "max_model_len": model.max_model_len,
        "max_tokens_default": model.max_tokens_default,
        "supports_streaming": True,
        "supports_system_prompt": True,
        "supports_tool_calling": supports_tools,  # NEW
    }
```

Tool calling detection logic:

```python
def detect_tool_calling_support(model) -> bool:
    """
    Detect whether a model supports OpenAI-style tool/function calling.
    Based on model family heuristics and configuration.
    """
    name = f"{model.served_model_name} {model.repo_id or ''}".lower()

    # Models known to support tool calling
    tool_capable_families = [
        "deepseek",
        "qwen",
        "llama-3.1", "llama-3.2", "llama-3.3",
        "mistral",
        "gpt-oss",  # Needs testing -- may vary
    ]

    for family in tool_capable_families:
        if family in name:
            return True

    # Also check if model has explicit override in config
    if hasattr(model, 'supports_tool_calling') and model.supports_tool_calling is not None:
        return model.supports_tool_calling

    return False
```

Optionally, add an `supports_tool_calling` boolean field to the Model database schema so administrators can manually override detection:

```python
# In model creation/update schema
class ModelUpdate(BaseModel):
    # ... existing fields ...
    supports_tool_calling: bool | None = None  # None = auto-detect
```

---

## Testing Plan

### FIM Endpoint Tests

```bash
# Test FIM with a vLLM model (Codestral)
curl -X POST http://localhost:8084/v1/fim/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "codestral-22b",
    "prefix": "def calculate_total(items):\n    total = 0\n    for item in items:\n        ",
    "suffix": "\n    return total",
    "max_tokens": 50,
    "temperature": 0.2,
    "stream": false
  }'

# Test FIM with a llama.cpp model (GPT-OSS)
curl -X POST http://localhost:8084/v1/fim/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-oss-120b",
    "prefix": "function validateEmail(email) {\n    ",
    "suffix": "\n}",
    "max_tokens": 100,
    "stream": false
  }'

# Test FIM streaming
curl -N -X POST http://localhost:8084/v1/fim/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "codestral-22b",
    "prefix": "import os\n\ndef read_config():\n    ",
    "suffix": "\n    return config",
    "stream": true
  }'
```

### IDE Status Endpoint Tests

```bash
# Test IDE status
curl http://localhost:8084/v1/ide/status \
  -H "Authorization: Bearer $TOKEN"

# Verify response contains all sections
# Should return: running_models, system, gpus, gateway_healthy
```

### Tool Calling Metadata Tests

```bash
# Test model constraints with tool calling field
curl http://localhost:8084/v1/models/codestral-22b/constraints \
  -H "Authorization: Bearer $TOKEN"

# Response should include: "supports_tool_calling": true/false
```

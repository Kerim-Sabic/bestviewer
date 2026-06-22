# VLM report service (language path)

A local OpenAI-compatible LLM server for the **report draft** panel. This is the
**language** path — strictly separate from the clinical segmentation/measurement
path (SaMD §I.2). The model drafts an impression *over measurements and
AI-generated segment labels that already exist*; it never produces masks or
measurements. Output is labeled AI-generated, research use only, clinician-editable.

The viewer's `/api/report` route forwards to this server when
`REPORT_PROVIDER=local`. For production, swap in **MedGemma** (gated on Hugging
Face) behind the same OpenAI-compatible contract — only the model file changes.

## Setup + run

```bash
cd services/vlm
python -m venv .venv-vlm
.venv-vlm/Scripts/python -m pip install "llama-cpp-python[server]" \
    --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu
.venv-vlm/Scripts/python -m pip install huggingface_hub
.venv-vlm/Scripts/python -c "from huggingface_hub import hf_hub_download; \
    hf_hub_download('Qwen/Qwen2.5-1.5B-Instruct-GGUF', 'qwen2.5-1.5b-instruct-q4_k_m.gguf', local_dir='models')"

.venv-vlm/Scripts/python -m llama_cpp.server \
    --model models/qwen2.5-1.5b-instruct-q4_k_m.gguf --host 127.0.0.1 --port 8001 \
    --n_ctx 4096 --chat_format chatml
```

Then in `.env.local`:

```
REPORT_PROVIDER=local
REPORT_LOCAL_URL=http://localhost:8001/v1/chat/completions
REPORT_MODEL=qwen2.5-1.5b-instruct
```

> The shipped 1.5B model proves the pipeline; it is a general model, not a
> medical one. Use MedGemma (or a frontier API via `REPORT_PROVIDER=anthropic|openai`)
> for clinically useful drafts.

# HireLabs evaluator · local run, 23 November 2026

**The selected HireLabs checkout served a candidate analysis with the locally fine-tuned model.** The authenticated request returned `data.model_used=hirelabs-evaluator`. The local console displayed that value in its badge. The same route returned HTTP 401 without a session. [API response](authenticated-api-response.json) · [Screenshot](local-demo.png)

## What was trained

The pilot updated a 1.5B-parameter Qwen2.5 instruct model with a rank-8 LoRA adapter on 25 synthetic examples. All 112 LoRA B matrices contained nonzero updates after 50 optimizer steps on an RTX 4060 Ti. Average training loss was 0.751 in epoch 1 and 0.118 in epoch 2. The export merged the adapter into the base weights and quantized them to Q4_K_M. The verified GGUF occupies 986,652,192 bytes. [Training log](training-run.json) · [Loss curve](training-loss.png) · [Model checksum](GGUF-SHA256.txt)

## Matched before-and-after checks

Both Ollama models saw identical prompts and schemas for an unseen platform-developer role, with temperature 0, seed 42, 4,096 context tokens and a 1,024-token output limit. All three cases parsed as JSON and passed the app contract for each model. Each model matched the synthetic reference verdict on 2 of 3 cases.

| Fictional resume evidence | Synthetic reference | Untouched base | Fine-tuned pilot |
|---|---|---|---|
| Built Python APIs and deployed to Kubernetes | Strong | Strong, 90 | Strong, 87 |
| Built a Python API and wrote tests | Moderate | Strong, 90 | Strong, 87 |
| Resume heading only | Insufficient evidence | Insufficient evidence, 0 | Insufficient evidence, 0 |

The pilot’s skills assessment failed in both directions. It listed Kubernetes as demonstrated for the Python-only resume and listed Kubernetes deployment as missing when the resume explicitly documented it. Schema validation caught neither error. The three synthetic checks provide no evidence of improved verdict accuracy or calibrated numerical scores. The team’s private dev benchmark and 95% dev validity target remain unmeasured. [Base generations](base-generations.json) · [Tuned generations](tuned-generations.json)

## Local setup

The interactive console uses the normal authenticated candidate route in the `(2)` checkout and a disposable local Supabase Auth account. The screenshot shows the pilot console. Evaluation of the full recruiter dashboard and other model services was outside this pilot. [Run instructions](README.md)

"""Fine-tune and export the local synthetic pilot. Run on a BF16-capable CUDA GPU."""
import argparse
import hashlib
import json
import random
from pathlib import Path

import peft
import torch
import transformers
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base", type=Path)
    ap.add_argument("training", type=Path)
    ap.add_argument("output", type=Path)
    args = ap.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(42)
    rng = random.Random(42)
    tokenizer = AutoTokenizer.from_pretrained(args.base, local_files_only=True)
    model = AutoModelForCausalLM.from_pretrained(args.base, dtype=torch.bfloat16, local_files_only=True,
                                                attn_implementation="sdpa").to("cuda")
    model.config.use_cache = False
    lora = LoraConfig(r=8, lora_alpha=16, target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
                      lora_dropout=0, task_type="CAUSAL_LM")
    model = get_peft_model(model, lora)
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant":False})
    model.train()
    examples = []
    for line in args.training.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        chat = row["messages"]
        prefix = tokenizer.apply_chat_template(chat[:-1], tokenize=True, add_generation_prompt=True)
        ids = tokenizer.apply_chat_template(chat, tokenize=True)
        if ids[:len(prefix)] != prefix or len(ids) > 4096:
            raise ValueError(f"Check the token boundary or context for {row['id']}")
        examples.append((row["id"], ids, len(prefix)))
    optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=2e-4)
    losses = []
    for epoch in range(2):
        order = list(examples)
        rng.shuffle(order)
        for identifier, ids, start in order:
            x = torch.tensor([ids], device="cuda")
            # Compute vocab logits only for positions predicting assistant tokens.
            length = len(ids)-start
            logits = model(input_ids=x, logits_to_keep=length+1).logits[:, :-1, :]
            loss = torch.nn.functional.cross_entropy(logits.float().reshape(-1, logits.shape[-1]), x[:,start:].reshape(-1))
            if not torch.isfinite(loss): raise RuntimeError("Non-finite loss")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            optimizer.zero_grad(set_to_none=True)
            losses.append(dict(step=len(losses)+1, epoch=epoch+1, example=identifier, loss=loss.item()))
            print(f"Step {len(losses)} loss {loss.item():.4f}", flush=True)
            del x, logits, loss
    model.peft_config["default"].base_model_name_or_path = "Qwen/Qwen2.5-1.5B-Instruct"
    model.peft_config["default"].revision = "989aa7980e4cf806f80c7fef2b1adb7bc71aa306"
    model.save_pretrained(args.output/"adapter")
    model.eval()
    merged = model.merge_and_unload().to("cpu")
    merged.config.use_cache = True
    merged.save_pretrained(args.output/"merged")
    tokenizer.save_pretrained(args.output/"merged")
    report = dict(base="Qwen/Qwen2.5-1.5B-Instruct", revision="989aa7980e4cf806f80c7fef2b1adb7bc71aa306",
                  method="BF16 LoRA, assistant-only loss", r=8, alpha=16, lr=2e-4, epochs=2, seed=42,
                  targets=lora.to_dict()["target_modules"], examples=len(examples), data_sha256=hashlib.sha256(args.training.read_bytes()).hexdigest(),
                  gpu=torch.cuda.get_device_name(), torch=torch.__version__, transformers=transformers.__version__, peft=peft.__version__, losses=losses)
    report["targets"] = sorted(report["targets"])
    (args.output/"training-run.json").write_text(json.dumps(report,indent=2),encoding="utf-8")


if __name__ == "__main__":
    main()

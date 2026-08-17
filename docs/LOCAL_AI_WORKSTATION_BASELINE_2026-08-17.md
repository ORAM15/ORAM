# Local AI Workstation Baseline — 2026-08-17

This note records the verified local-AI execution baseline used during Capability Sprint 21 preparation.

## Verified workstation baseline

- Local model runtime: Ollama
- Model: `qwen3.5:4b`
- Quantization: Q4_K_M
- Local model storage: `D:\BRDR\AI\Models`
- Ollama server endpoint: `http://127.0.0.1:11434`
- Anthropic-compatible transport: `/v1/messages`
- Claude Code integration: verified through Ollama's Claude launcher
- Tool calling: verified through the Anthropic-compatible interface
- Runtime context used for the current experiment: 8192 tokens
- Inference device during the experiment: CPU
- Hardware baseline: 12th Gen Intel Core i5-1235U, 8 GB system RAM, Intel Iris Xe integrated graphics

## Engineering constraints discovered

The local stack is operational, but repository-scale agent work is resource constrained on this workstation. Large Claude Code prompts can be substantially more expensive than simple inference, and the local model is CPU-bound in the current configuration.

The experiment also established that the agent harness must be treated as a separate concern from the model transport: the Ollama Anthropic-compatible endpoint and direct tool calls work, while Claude Code tool naming and agent-loop behavior still require bounded, explicit use.

## ORAM safety boundary

This baseline does not authorize autonomous repository modification. Capability Sprint 21 must continue to preserve the existing human approval boundary and the deterministic `MemoryProvider` path until the real provider integration is verified by repository tests and controlled local execution.

## Purpose

This document is an evidence record for Sprint 21 environment setup. It is intentionally separate from provider implementation so that workstation findings do not become implicit architectural behavior.

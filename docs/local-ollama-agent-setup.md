# Local Ollama Agent Setup

ORAM can be developed with a local AI execution stack without embedding a model-specific dependency into the core engineering pipeline.

## Reference setup

```text
Claude Code
    ↓
Ollama
    ↓
Local coding model
```

The repository's engineering workflow remains provider-agnostic. A local model is execution infrastructure, not the definition of ORAM's engineering control plane.

## Verification checklist

Before using a local agent for repository changes, verify:

1. The Ollama service is running.
2. The selected model is installed and responds to a normal prompt.
3. The Anthropic-compatible `/v1/messages` endpoint responds successfully when used through Ollama.
4. Structured tool calling works for the selected model.
5. Claude Code can open the repository and perform a read-only inspection.
6. The repository is clean and on the intended branch before any write-enabled experiment.

## Safety boundary

A working local agent does not by itself prove that autonomous repository modification is safe. ORAM should preserve its explicit human-approval boundary and validate actual repository changes before publication.

## Current development note

This document records the local-agent setup as development infrastructure only. It does not introduce a concrete Provider implementation, change Runtime behavior, or enable automatic publishing.

# Modular Agents for OpenCode

> Split large agent prompts into multiple maintainable files.

This plugin allows you to define agents using **folders** instead of single `.md` files. Each folder can contain an `index.md` plus any number of additional modular files (`.md` or `.txt`).

## Features

- Define agents as folders in `.opencode/agents/` or `~/.config/opencode/agents/`
- Split prompts across multiple files (e.g. `rules.md`, `examples.md`, `tools.md`)
- Supports **all** agent configuration fields via YAML frontmatter
- Clean, alphabetical concatenation of modular files
- Works alongside native single-file agents

## Installation

### Local (Recommended for now)

1. Create the plugin folder:
```bash
mkdir -p .opencode/plugins
```

2. Add the files:
- `modular-agents.ts`
- `package.json` (optional but recommended)

3. Restart OpenCode.

### Via npm

```bash
opencode plugin install modular-agents
```

Or add to your `opencode.json`:

```json
{
  "plugin": ["opencode-modular-agents"]
}
```

## Usage

Create a folder for your agent:

```
.opencode/agents/my-coder/
├── index.md
├── rules.md
├── examples.md
└── style.md
```

### Example `index.md`

```markdown
---
description: Expert TypeScript developer
mode: primary
model: anthropic/claude-sonnet-4-20250514
temperature: 0.3
permission:
  edit: allow
  bash: ask
---

You are an expert TypeScript developer.
```

Additional files (`rules.md`, `examples.md`, etc.) will be automatically appended.

## How It Works

1. The plugin scans both global and project-level `agents/` directories.
2. Folders containing `.md` or `.txt` files are treated as agents.
3. `index.md` can contain YAML frontmatter + the base prompt.
4. All other `.md`/`.txt` files are appended (in alphabetical order).
5. The final `prompt` is injected into OpenCode's agent configuration.

## Limitations

- Changes to agent files require restarting the session to take effect.
- The `name` field in YAML is only used to override the agent name (it is removed afterward).
- This plugin is mainly useful for **large or complex agents**.

## License

MIT

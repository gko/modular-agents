# Modular Agents for OpenCode

[![npmjs.com](https://img.shields.io/npm/v/modular-agents.svg?color=blue)](https://www.npmjs.com/modular-agents) [![tests](https://github.com/gko/modular-agents/actions/workflows/test.yml/badge.svg)](https://github.com/gko/modular-agents/actions/workflows/test.yml)

> Define agents as folders with multiple maintainable prompt files.

## Features

- Agents as folders instead of single files
- Recursively includes all `.md` and `.txt` files
- Deduplicates files automatically
- Supports all agent configuration fields via YAML frontmatter
- Works alongside native single-file agents

## Installation

### From npm (Recommended)

```bash
opencode plugin modular-agents --global
```

Or add it to your `opencode.json`:

```json
{
  "plugin": ["modular-agents"]
}
```

### Local Development

Place `modular-agents.ts` and `package.json` in:

- `.opencode/plugins/` (project level)
- or `~/.config/opencode/plugins/` (global)

## Usage

Create a folder structure like this:

```
.opencode/agents/rust-expert/
├── index.md
├── rules.md
├── examples/
│   └── good-patterns.md
└── constraints.md
```

The plugin will recursively find all `.md` and `.txt` files and combine them into one prompt.

## Limitations

- Changes require restarting the session.
- Best suited for complex or large agents.

## License

This project is open source and available under the [MIT](/LICENSE) license.

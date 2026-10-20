# pstack in this Codex project

The installed skills are copied from the official `cursor/plugins/pstack` source into `.agents/skills/`. In Codex, invoke them with `$` names, for example `$poteto-mode`, `$how`, or `$tdd`. Start a new Codex session after installation so it discovers the project-local skills.

## Translate the Cursor workflow

- Use the pstack playbook and acceptance criteria as written, but translate Cursor `/skill` references to Codex `$skill` references.
- Translate Cursor `Task` calls to the available Codex collaboration agent tool only when the user has authorized delegation for the task. The parent remains responsible for inspecting every result.
- Codex agents in this workspace share the same files. Do not let parallel agents write overlapping files. Prefer a read-only review or one writer at a time unless the work is demonstrably isolated.
- When a delegated worker should follow pstack, put the absolute path to `.agents/pstack/agents/poteto-agent.md` in its prompt and instruct it to read `.agents/skills/poteto-mode/SKILL.md` in full first. Codex does not register this Cursor agent file as a named subagent type automatically.
- Do not assume Cursor-only cloud agents, `/loop`, Cursor automation packs, or plugin-specific control skills exist in Codex. Use the browser and shell tools available here and report any workflow step that cannot be translated.

## Model settings

The official `setup-pstack` skill writes `~/.cursor/rules/pstack-models.mdc`, so it is Cursor-specific. For this Codex setup, `~/.agents/pstack-models.md` is the compatibility setting. It records the user's choice to use the parent conversation model for all roles with the `large (xhigh)` budget. Model aliases are resolved at runtime, which avoids hard-coded model names that may not exist on another host.

When this project moves to another Codex host, read that host's available model list and update `~/.agents/pstack-models.md` there. Do not copy a user model configuration into the game repository or assume it transfers with the project.

## Official agent prompts

`.agents/pstack/agents/poteto-agent.md` and `.agents/pstack/agents/comment-sicko.md` are the official pstack agent prompts. The current Codex collaboration tool accepts general agents rather than named pstack subagent types, so include the relevant prompt text when delegating. Existing project instructions still govern whether delegation is allowed.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Plugin } from "@opencode-ai/plugin";
import { parse as parseYaml } from "yaml";

export const ModularAgentsPlugin: Plugin = async (ctx) => {
	const { client, directory } = ctx;

	/**
	 * Assembles modular agents from subdirectories.
	 * Each folder can contain:
	 * - index.md (optional) → YAML frontmatter + main prompt
	 * - Any number of additional .md or .txt files (appended in alphabetical order)
	 */
	const assembleAgents = async (targetConfig: any) => {
		const targetDirs = [
			join(directory, ".opencode", "agents"),
			join(homedir(), ".config", "opencode", "agents"),
		];

		if (!targetConfig.agent) {
			targetConfig.agent = {};
		}

		for (const baseDir of targetDirs) {
			try {
				const entries = await readdir(baseDir, { withFileTypes: true });

				for (const entry of entries) {
					if (!entry.isDirectory()) continue;

					const folderName = entry.name;
					const agentDirPath = join(baseDir, folderName);

					const files = await readdir(agentDirPath);
					const hasIndex = files.includes("index.md");

					const moduleFiles = files
						.filter(
							(f) =>
								f !== "index.md" && (f.endsWith(".md") || f.endsWith(".txt"))
						)
						.sort((a, b) => a.localeCompare(b));

					if (!hasIndex && moduleFiles.length === 0) continue;

					let agentConfig: Record<string, any> = {};
					let finalPrompt = "";

					// === 1. Process index.md (frontmatter + body) ===
					if (hasIndex) {
						const indexPath = join(agentDirPath, "index.md");
						const content = await readFile(indexPath, "utf-8");

						const frontmatterMatch = content.match(
							/^---\n([\s\S]*?)\n---\n([\s\S]*)$/
						);

						if (frontmatterMatch) {
							try {
								const parsed = parseYaml(frontmatterMatch[1]);
								if (parsed && typeof parsed === "object") {
									agentConfig = parsed;
								}
								finalPrompt = frontmatterMatch[2].trim();
							} catch (err) {
								await client.app.log({
									body: {
										service: "modular-agents",
										level: "error",
										message: `YAML parse error in ${folderName}/index.md`,
										extra: { error: (err as Error).message },
									},
								});
								finalPrompt = content.trim();
							}

							// Allow overriding the agent name from YAML
							if (agentConfig.name) {
								// We don't delete it here — the config system will ignore unknown top-level fields anyway
							}
						} else {
							finalPrompt = content.trim();
						}
					}

					// === 2. Append all additional modular files ===
					for (const file of moduleFiles) {
						const filePath = join(agentDirPath, file);
						const content = await readFile(filePath, "utf-8");
						const cleanContent = content
							.replace(/^---[\s\S]*?---\n?/, "")
							.trim();

						finalPrompt += `\n\n### ${file}\n${cleanContent}`;
					}

					const agentName = agentConfig.name || folderName;

					// === 3. Register the agent ===
					// We spread agentConfig first so ALL fields from YAML are preserved,
					// then we set/override `prompt` with the assembled modular content.
					targetConfig.agent[agentName] = {
						...agentConfig,
						prompt: finalPrompt.trim(),
					};

					// Remove the name field if it was only used for naming
					if (targetConfig.agent[agentName].name) {
						delete targetConfig.agent[agentName].name;
					}

					await client.app.log({
						body: {
							service: "modular-agents",
							level: "info",
							message: `Registered modular agent: ${agentName}`,
							extra: {
								folder: folderName,
								mode: agentConfig.mode || "subagent",
								modules: moduleFiles.length,
								hasIndex,
							},
						},
					});
				}
			} catch (err) {
				if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
					await client.app.log({
						body: {
							service: "modular-agents",
							level: "error",
							message: `Failed to read agent directory: ${baseDir}`,
							extra: { error: (err as Error).message },
						},
					});
				}
			}
		}
	};

	return {
		/**
		 * Official hook for injecting agents into the config.
		 * This is the correct and supported way to register agents from a plugin.
		 */
		config: async (config) => {
			await assembleAgents(config);
		},

		/**
		 * Event hooks for lifecycle and file watching
		 */
		event: async ({ event }) => {
			if (event.type === "session.created") {
				// Agents are already registered via the config hook.
				// This is here for future extensibility.
			}

			if (event.type === "file.edited") {
				const filePath = (event as any).path || "";

				if (filePath.includes("/agents/")) {
					await client.app.log({
						body: {
							service: "modular-agents",
							level: "info",
							message:
								"Agent file modified — restart session to reload changes",
							extra: { path: filePath },
						},
					});
				}
			}
		},
	};
};

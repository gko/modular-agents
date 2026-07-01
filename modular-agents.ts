import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Plugin } from "@opencode-ai/plugin";
import { parse as parseYaml } from "yaml";

export const ModularAgentsPlugin: Plugin = async (ctx) => {
    const { client, directory } = ctx;

    const assembleAgents = async (targetConfig: any) => {
        const targetDirs = [
            join(directory, ".opencode", "agents"),
            join(homedir(), ".config", "opencode", "agents"),
        ];

        if (!targetConfig.agent) targetConfig.agent = {};

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
                                f !== "index.md" &&
                                (f.endsWith(".md") || f.endsWith(".txt")),
                        )
                        .sort((a, b) => a.localeCompare(b));

                    if (!hasIndex && moduleFiles.length === 0) continue;

                    let agentConfig: Record<string, any> = {};
                    let finalPrompt = "";

                    // Process index.md (optional YAML frontmatter + body)
                    if (hasIndex) {
                        const indexPath = join(agentDirPath, "index.md");
                        const content = await readFile(indexPath, "utf-8");
                        const match = content.match(
                            /^---\n([\s\S]*?)\n---\n([\s\S]*)$/,
                        );

                        if (match) {
                            try {
                                const parsed = parseYaml(match[1]);
                                if (parsed && typeof parsed === "object") {
                                    agentConfig = parsed;
                                }
                                finalPrompt = match[2].trim();
                            } catch (err) {
                                await client.app.log({
                                    body: {
                                        service: "modular-agents",
                                        level: "error",
                                        message: `YAML parse error in ${folderName}/index.md`,
                                        extra: {
                                            error: (err as Error).message,
                                        },
                                    },
                                });
                                finalPrompt = content.trim();
                            }
                        } else {
                            finalPrompt = content.trim();
                        }
                    }

                    // Append additional modular files
                    for (const file of moduleFiles) {
                        const filePath = join(agentDirPath, file);
                        const content = await readFile(filePath, "utf-8");
                        const cleanContent = content
                            .replace(/^---[\s\S]*?---\n?/, "")
                            .trim();
                        finalPrompt += `\n\n### ${file}\n${cleanContent}`;
                    }

                    const agentName = agentConfig.name || folderName;

                    // Register agent (preserves all YAML fields)
                    targetConfig.agent[agentName] = {
                        ...agentConfig,
                        prompt: finalPrompt.trim(),
                    };

                    // Clean up name if it was only used for renaming
                    delete targetConfig.agent[agentName].name;

                    await client.app.log({
                        body: {
                            service: "modular-agents",
                            level: "info",
                            message: `Registered modular agent: ${agentName}`,
                            extra: {
                                folder: folderName,
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
        config: async (config) => {
            await assembleAgents(config);
        },

        event: async ({ event }) => {
            if (event.type === "file.edited") {
                const filePath = (event as any).path || "";
                if (filePath.includes("/agents/")) {
                    await client.app.log({
                        body: {
                            service: "modular-agents",
                            level: "info",
                            message:
                                "Agent files changed — restart session to reload",
                            extra: { path: filePath },
                        },
                    });
                }
            }
        },
    };
};

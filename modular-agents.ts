import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { homedir } from "node:os";
import type { Plugin } from "@opencode-ai/plugin";
import { parse as parseYaml } from "yaml";

export const ModularAgentsPlugin: Plugin = async (ctx) => {
    const { client, directory } = ctx;

    // Recursively find all .md and .txt files
    async function findAllFiles(dir: string): Promise<string[]> {
        const entries = await readdir(dir, { withFileTypes: true });
        const files: string[] = [];

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                const subFiles = await findAllFiles(fullPath);
                files.push(...subFiles);
            } else if (
                entry.name.endsWith(".md") ||
                entry.name.endsWith(".txt")
            ) {
                files.push(fullPath);
            }
        }
        return files;
    }

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

                    // Get all .md and .txt files recursively
                    const allFiles = await findAllFiles(agentDirPath);

                    if (allFiles.length === 0) continue;

                    // Deduplicate files (by relative path)
                    const seen = new Set<string>();
                    const uniqueFiles: string[] = [];

                    for (const filePath of allFiles) {
                        const relPath = relative(agentDirPath, filePath);
                        if (!seen.has(relPath)) {
                            seen.add(relPath);
                            uniqueFiles.push(filePath);
                        }
                    }

                    // Separate index.md from other files
                    const indexFile = uniqueFiles.find((f) =>
                        f.endsWith("index.md"),
                    );
                    const otherFiles = uniqueFiles
                        .filter((f) => !f.endsWith("index.md"))
                        .sort((a, b) =>
                            relative(agentDirPath, a).localeCompare(
                                relative(agentDirPath, b),
                            ),
                        );

                    let agentConfig: Record<string, any> = {};
                    let finalPrompt = "";

                    // Process index.md
                    if (indexFile) {
                        const content = await readFile(indexFile, "utf-8");
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

                    // Append all other files
                    for (const filePath of otherFiles) {
                        const content = await readFile(filePath, "utf-8");
                        const cleanContent = content
                            .replace(/^---[\s\S]*?---\n?/, "")
                            .trim();
                        const relPath = relative(agentDirPath, filePath);
                        finalPrompt += `\n\n### ${relPath}\n${cleanContent}`;
                    }

                    const agentName = agentConfig.name || folderName;

                    targetConfig.agent[agentName] = {
                        ...agentConfig,
                        prompt: finalPrompt.trim(),
                    };

                    delete targetConfig.agent[agentName].name;

                    await client.app.log({
                        body: {
                            service: "modular-agents",
                            level: "info",
                            message: `Registered modular agent: ${agentName}`,
                            extra: {
                                folder: folderName,
                                totalFiles: uniqueFiles.length,
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

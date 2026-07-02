import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { homedir } from "node:os";
import type { Plugin } from "@opencode-ai/plugin";

async function findAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
        const entries = await readdir(dir, { withFileTypes: true });
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
    } catch {}
    return files;
}

async function enrichAgents(targetConfig: any, baseDir: string) {
    if (!targetConfig.agent) targetConfig.agent = {};

    try {
        const entries = await readdir(baseDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const folderName = entry.name;
            const agentDirPath = join(baseDir, folderName);
            const topLevelIndexPath = join(agentDirPath, "index.md");

            const allFiles = await findAllFiles(agentDirPath);
            if (allFiles.length === 0) continue;

            // Only skip the top-level index.md (handled by OpenCode)
            // Include index.md files from subfolders
            const additionalFiles = allFiles
                .filter((f) => f !== topLevelIndexPath)
                .sort((a, b) =>
                    relative(agentDirPath, a).localeCompare(
                        relative(agentDirPath, b),
                    ),
                );

            if (additionalFiles.length === 0) continue;

            const existingAgent = targetConfig.agent[folderName];

            let promptAddition = "";
            for (const filePath of additionalFiles) {
                const content = await readFile(filePath, "utf-8");
                const cleanContent = content
                    .replace(/^---[\s\S]*?---\n?/, "")
                    .trim();
                const relPath = relative(agentDirPath, filePath);
                promptAddition += `\n\n### ${relPath}\n${cleanContent}`;
            }

            if (existingAgent) {
                // Enrich agent that OpenCode already created from index.md
                existingAgent.prompt = (
                    (existingAgent.prompt || "") + promptAddition
                ).trim();
            } else {
                // Fallback: create agent if no index.md exists
                targetConfig.agent[folderName] = {
                    mode: "primary",
                    prompt: promptAddition.trim(),
                };
            }
        }
    } catch {}
}

export const ModularAgentsPlugin: Plugin = async (ctx) => {
    const { client, directory } = ctx;

    return {
        config: async (config) => {
            let currentConfig = config || {};
            const globalAgentsDir = join(
                homedir(),
                ".config",
                "opencode",
                "agents",
            );

            if (typeof directory === "string") {
                const projectAgentsDir = join(directory, ".opencode", "agents");
                await enrichAgents(currentConfig, projectAgentsDir);
            }

            await enrichAgents(currentConfig, globalAgentsDir);

            return currentConfig;
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

        __test__: {
            enrichAgents,
        } as const,
    };
};

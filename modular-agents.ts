import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { homedir } from "node:os";
import type { Plugin } from "@opencode-ai/plugin";
import { parse as parseYaml } from "yaml";

/**
 * Recursively finds all .md and .txt files.
 * Note: Follows symlinks. Acceptable for v1, but can cause issues with circular links.
 */
async function findAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                try {
                    const subFiles = await findAllFiles(fullPath);
                    files.push(...subFiles);
                } catch {
                    // Ignore unreadable subdirectories (error resilience)
                }
            } else if (
                entry.name.endsWith(".md") ||
                entry.name.endsWith(".txt")
            ) {
                files.push(fullPath);
            }
        }
    } catch {
        // Ignore unreadable top-level directories
    }

    return files;
}

/**
 * Core logic - exported for testing.
 * Assembles agents from a given base directory into targetConfig.agent
 */
export async function assembleAgents(
    targetConfig: any,
    baseDir: string,
    log?: (level: "info" | "error", message: string, extra?: any) => void,
) {
    if (!targetConfig.agent) targetConfig.agent = {};

    try {
        const entries = await readdir(baseDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const folderName = entry.name;
            const agentDirPath = join(baseDir, folderName);

            const allFiles = await findAllFiles(agentDirPath);
            if (allFiles.length === 0) continue;

            // Notice: Deduplication logic completely removed here!

            const indexFile = allFiles.find((f) => f.endsWith("index.md"));
            const otherFiles = allFiles
                .filter((f) => !f.endsWith("index.md"))
                .sort((a, b) =>
                    relative(agentDirPath, a).localeCompare(
                        relative(agentDirPath, b),
                    ),
                );

            let agentConfig: Record<string, any> = {};
            let finalPrompt = "";

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
                    } catch {
                        if (log) {
                            log(
                                "error",
                                `YAML parse error in ${folderName}/index.md`,
                            );
                        }
                        finalPrompt = content.trim();
                    }
                } else {
                    finalPrompt = content.trim();
                }
            }

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

            if (log) {
                log("info", `Registered modular agent: ${agentName}`, {
                    folder: folderName,
                });
            }
            delete targetConfig.agent[agentName].name;
        }
    } catch {
        // Silently ignore errors reading the agents directory
    }
}

export const ModularAgentsPlugin: Plugin = async (ctx) => {
    const { client, directory } = ctx;

    return {
        config: async (config) => {
            const globalAgentsDir = join(
                homedir(),
                ".config",
                "opencode",
                "agents",
            );
            const projectAgentsDir = join(directory, ".opencode", "agents");

            await assembleAgents(config, projectAgentsDir);
            await assembleAgents(config, globalAgentsDir);
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

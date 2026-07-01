import { join } from "node:path";
import { homedir } from "node:os";
import type { Plugin } from "@opencode-ai/plugin";

import { assembleAgents } from "./core";

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

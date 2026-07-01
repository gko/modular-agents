import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { assembleAgents } from "../core";

describe("assembleAgents", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = join(tmpdir(), `modular-test-${randomUUID()}`);
        await mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    async function createFiles(files: Record<string, string>) {
        for (const [path, content] of Object.entries(files)) {
            const fullPath = join(tempDir, path);
            await mkdir(join(fullPath, ".."), { recursive: true });
            await writeFile(fullPath, content);
        }
    }

    it("should create agent from index.md only", async () => {
        await createFiles({
            "my-agent/index.md": "---\nmode: subagent\n---\nYou are helpful.",
        });

        const config: any = {};
        await assembleAgents(config, tempDir);

        expect(config.agent["my-agent"]).toBeDefined();
        expect(config.agent["my-agent"].mode).toBe("subagent");
        expect(config.agent["my-agent"].prompt).toContain("You are helpful.");
    });

    it("should include files from nested folders", async () => {
        await createFiles({
            "deep-agent/index.md": "Base prompt",
            "deep-agent/rules/core.md": "Core rules here",
            "deep-agent/examples/example1.md": "Example content",
        });

        const config: any = {};
        await assembleAgents(config, tempDir);

        const prompt = config.agent["deep-agent"].prompt;
        expect(prompt).toContain("### rules/core.md");
        expect(prompt).toContain("### examples/example1.md");
    });

    it("should use folder name when there is no index.md", async () => {
        await createFiles({
            "no-index-agent/style.md": "Be concise and clear",
            "no-index-agent/examples.md": "Show good examples",
        });

        const config: any = {};
        await assembleAgents(config, tempDir);

        expect(config.agent["no-index-agent"]).toBeDefined();
        expect(config.agent["no-index-agent"].prompt).toContain("Be concise");
    });

    it("should handle YAML parse errors gracefully and trigger error log", async () => {
        const mockLog = vi.fn();

        await createFiles({
            "bad-yaml/index.md":
                "---\ninvalid: yaml: here\n---\nPrompt content",
        });

        const config: any = {};
        await assembleAgents(config, tempDir, mockLog);

        expect(config.agent["bad-yaml"]).toBeDefined();
        expect(config.agent["bad-yaml"].prompt).toContain("Prompt content");

        // Ensure the error was logged
        expect(mockLog).toHaveBeenCalledWith(
            "error",
            "YAML parse error in bad-yaml/index.md",
        );
    });

    it("should trigger success log when an agent is registered", async () => {
        const mockLog = vi.fn();

        await createFiles({
            "good-agent/index.md": "---\nmode: primary\n---\nAll good.",
        });

        const config: any = {};
        await assembleAgents(config, tempDir, mockLog);

        // Ensure the success registration was logged
        expect(mockLog).toHaveBeenCalledWith(
            "info",
            "Registered modular agent: good-agent",
            { folder: "good-agent" },
        );
    });
});

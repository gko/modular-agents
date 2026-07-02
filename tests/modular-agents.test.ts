import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { ModularAgentsPlugin } from "../modular-agents";

const { enrichAgents } = (await ModularAgentsPlugin({})).__test__;

describe("enrichAgents", () => {
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

    it("should enrich an existing agent (simulating OpenCode parsing index.md)", async () => {
        await createFiles({
            "my-agent/index.md":
                "---\nmode: primary\n---\nYou are a helpful assistant.",
            "my-agent/rules.md": "Always follow best practices.",
            "my-agent/examples/example1.md": "Here is a good example.",
        });

        const config: any = {
            agent: {
                "my-agent": {
                    mode: "primary",
                    prompt: "You are a helpful assistant.",
                },
            },
        };

        await enrichAgents(config, tempDir);

        const prompt = config.agent["my-agent"].prompt;
        expect(prompt).toContain("You are a helpful assistant.");
        expect(prompt).toContain("### rules.md");
        expect(prompt).toContain("Always follow best practices.");
        expect(prompt).toContain("### examples/example1.md");
    });

    it("should include index.md from subfolders as supporting content", async () => {
        await createFiles({
            "deep-agent/index.md": "Base prompt from index.md",
            "deep-agent/section/index.md":
                "This is content from a subfolder index.md",
            "deep-agent/notes.md": "Additional notes",
        });

        const config: any = {
            agent: {
                "deep-agent": { prompt: "Base prompt from index.md" },
            },
        };

        await enrichAgents(config, tempDir);

        const prompt = config.agent["deep-agent"].prompt;
        expect(prompt).toContain("### section/index.md");
        expect(prompt).toContain("This is content from a subfolder index.md");
        expect(prompt).toContain("### notes.md");
    });

    it("should create agent from files only if no index.md exists", async () => {
        await createFiles({
            "no-index-agent/rules.md": "Be concise.",
            "no-index-agent/style.md": "Use clear language.",
        });

        const config: any = {};
        await enrichAgents(config, tempDir);

        expect(config.agent["no-index-agent"]).toBeDefined();
        expect(config.agent["no-index-agent"].prompt).toContain("### rules.md");
        expect(config.agent["no-index-agent"].prompt).toContain("### style.md");
    });

    it("should strip frontmatter from additional files", async () => {
        await createFiles({
            "agent-with-yaml/index.md": "Base prompt",
            "agent-with-yaml/config.txt":
                "---\nname: something\n---\nThis is actual content.",
        });

        const config: any = {
            agent: { "agent-with-yaml": { prompt: "Base prompt" } },
        };

        await enrichAgents(config, tempDir);

        const prompt = config.agent["agent-with-yaml"].prompt;
        expect(prompt).toContain("### config.txt");
        expect(prompt).toContain("This is actual content.");
        expect(prompt).not.toContain("name: something");
    });

    it("should sort additional files alphabetically by relative path", async () => {
        await createFiles({
            "sorted-agent/index.md": "Base",
            "sorted-agent/z-last.md": "Z content",
            "sorted-agent/a-first.md": "A content",
            "sorted-agent/b-middle.md": "B content",
        });

        const config: any = {
            agent: { "sorted-agent": { prompt: "Base" } },
        };

        await enrichAgents(config, tempDir);

        const prompt = config.agent["sorted-agent"].prompt;
        const aIndex = prompt.indexOf("### a-first.md");
        const bIndex = prompt.indexOf("### b-middle.md");
        const zIndex = prompt.indexOf("### z-last.md");

        expect(aIndex).toBeLessThan(bIndex);
        expect(bIndex).toBeLessThan(zIndex);
    });
});

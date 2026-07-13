import { expect, test } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const tvctl = join(root, "tools/tvctl");

function run(args: string[]) {
	return Bun.spawnSync([tvctl, ...args], {
		cwd: root,
		stdout: "pipe",
		stderr: "pipe",
	});
}

test("tvctl advertises the isolated Titan test lifecycle", () => {
	const result = run(["help"]);
	const stdout = result.stdout.toString();
	expect(result.exitCode).toBe(0);
	expect(stdout).toContain("kit test deploy");
	expect(stdout).toContain("kit test verify");
	expect(stdout).toContain("kit test stop");
});

test("tvctl rejects colliding Titan test ports before operating services", () => {
	const result = Bun.spawnSync(
		[
			"env",
			"TV_TEST_SERVER_PORT=4000",
			"TV_TEST_REMOTE_PORT=4000",
			tvctl,
			"kit",
			"test",
			"verify",
		],
		{ cwd: root, stdout: "pipe", stderr: "pipe" },
	);
	expect(result.exitCode).toBe(64);
	expect(result.stderr.toString()).toContain(
		"TV_TEST_*_PORT values must be distinct",
	);
});

test("tvctl rejects unknown Titan test log targets", () => {
	const result = run(["kit", "test", "logs", "player"]);
	expect(result.exitCode).toBe(64);
	expect(result.stderr.toString()).toContain(
		"service must be server or remote",
	);
});

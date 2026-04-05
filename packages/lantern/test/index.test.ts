import { expect, test } from "bun:test";
import { greet } from "../src";

test("lantern package should greet correctly", () => {
	expect(greet("World")).toBe("Hello, World! Welcome to the lantern package.");
});

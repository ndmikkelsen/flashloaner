import { describe, it, expect } from "vitest";
import { BOT_VERSION, FlashloanBot } from "../src/index.js";

describe("project setup", () => {
  it("should export bot version", () => {
    expect(BOT_VERSION).toBe("0.1.0");
  });

  it("should export FlashloanBot class", () => {
    expect(FlashloanBot).toBeDefined();
  });

  it("should have ethers available", async () => {
    const { ethers } = await import("ethers");
    expect(ethers.version).toBeDefined();
  });
});

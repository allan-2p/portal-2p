import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error script utilitário em JS puro
import { readmeAtualizado } from "../scripts/readme-sync.mjs";

describe("README.md", () => {
  it("está fiel ao código (scripts, variáveis, gatilhos e rotas)", () => {
    const atual = readFileSync("README.md", "utf8");
    expect(
      readmeAtualizado(),
      "README.md desatualizado — rode `npm run readme:sync`",
    ).toBe(atual);
  });
});

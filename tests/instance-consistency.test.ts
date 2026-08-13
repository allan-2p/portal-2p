import { describe, expect, it } from "vitest";
import { validateAdminVisibility, GROUP_FEATURES } from "@/lib/instance-consistency";

describe("consistência de visibilidade entre instâncias", () => {
  it("expõe as opções de grupo do Solar em todas as instâncias", () => {
    const report = validateAdminVisibility();
    expect(report.issues.map((i) => i.message)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("tem pelo menos as telas de administração no baseline", () => {
    expect(GROUP_FEATURES.length).toBeGreaterThan(0);
  });
});

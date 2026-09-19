import { describe, expect, it, vi } from "vitest";
import { LicenseManager } from "../src/license-manager";
import { DEFAULT_SETTINGS } from "../src/main";
import type { CanvasSyncSettings } from "../src/types";

describe("LicenseManager", () => {
  it("generates a persistent instanceId if none exists", () => {
    const settings: CanvasSyncSettings = { ...DEFAULT_SETTINGS };
    expect(settings.licenseInstanceId).toBeUndefined();

    const id1 = LicenseManager.getOrCreateInstanceId(settings);
    expect(id1).toMatch(/^vlt_/);
    expect(settings.licenseInstanceId).toBe(id1);

    const id2 = LicenseManager.getOrCreateInstanceId(settings);
    expect(id2).toBe(id1);
  });

  it("handles offline grace period validation", async () => {
    const settings: CanvasSyncSettings = {
      ...DEFAULT_SETTINGS,
      licenseKey: "CSPRO-TEST-KEY",
      isPro: true,
      lastLicenseCheck: Date.now() - 2 * 24 * 60 * 60 * 1000 // 2 days ago
    };

    const res = await LicenseManager.validateLicense(settings);
    expect(res.valid).toBe(true);
  });

  it("returns invalid for missing license key on validation", async () => {
    const settings: CanvasSyncSettings = {
      ...DEFAULT_SETTINGS,
      licenseKey: "",
      isPro: false
    };

    const res = await LicenseManager.validateLicense(settings);
    expect(res.valid).toBe(false);
  });
});

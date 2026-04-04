import { describe, expect, test } from "bun:test";

import { parseDoctorOptions } from "../../src/core/doctor.ts";

describe("doctor command", () => {
  test("accepts no options", () => {
    expect(parseDoctorOptions([])).toEqual({ showHelp: false });
  });

  test("accepts help", () => {
    expect(parseDoctorOptions(["--help"])).toEqual({ showHelp: true });
    expect(parseDoctorOptions(["-h"])).toEqual({ showHelp: true });
  });

  test("rejects removed registration mode", () => {
    expect(() => parseDoctorOptions(["--register"])).toThrow("Unknown doctor option: --register");
  });
});

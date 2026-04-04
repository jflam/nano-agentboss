import { describe, expect, test } from "bun:test";

import { parseDoctorOptions } from "../../src/core/doctor.ts";

describe("doctor command", () => {
  test("accepts no options", () => {
    expect(parseDoctorOptions([])).toEqual({ showHelp: false, register: false });
  });

  test("accepts help", () => {
    expect(parseDoctorOptions(["--help"])).toEqual({ showHelp: true, register: false });
    expect(parseDoctorOptions(["-h"])).toEqual({ showHelp: true, register: false });
  });

  test("accepts registration mode", () => {
    expect(parseDoctorOptions(["--register"])).toEqual({ showHelp: false, register: true });
  });
});

import "./preload.ts";

import { accessSync, chmodSync, constants, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { resolveNanobossInstallDir } from "./src/install-path.ts";

const outfile = "./dist/nanoboss";

const result = await Bun.build({
  entrypoints: ["./nanoboss.ts"],
  compile: {
    outfile,
    autoloadBunfig: true,
    autoloadTsconfig: false,
    autoloadPackageJson: false,
  },
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exitCode = 1;
} else {
  const installDir = resolveNanobossInstallDir({
    overrideDir: Bun.env.NANOBOSS_INSTALL_DIR,
  });
  const target = join(installDir, "nanoboss");

  mkdirSync(dirname(outfile), { recursive: true });
  mkdirSync(installDir, { recursive: true });
  copyFileSync(outfile, target);
  chmodSync(target, 0o755);

  console.log(`Installed nanoboss to ${target}`);

  try {
    accessSync(installDir, constants.W_OK | constants.X_OK);
  } catch {
    console.warn(`Warning: ${installDir} may not be writable/executable in this environment.`);
  }
}

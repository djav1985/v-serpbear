import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

/* eslint-disable security/detect-non-literal-fs-filename -- dir is created by mkdtempSync in this helper */
export const createTempAppDataDir = (prefix: string) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  mkdirSync(path.join(dir, 'data'));
  const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(dir);

  return {
    dir,
    cleanup: () => {
      cwdSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    },
  };
};

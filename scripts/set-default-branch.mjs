#!/usr/bin/env node
import { execSync } from 'node:child_process';

const runCommand = (command, description) => {
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`✔ ${description}`);
    return true;
  } catch (error) {
    console.warn(`⚠️  Unable to ${description}.`);
    if (error?.stderr) {
      console.warn(error.stderr.toString());
    }
    return false;
  }
};

const globalUpdated = runCommand('git config --global init.defaultBranch main', 'set global git default branch to "main"');
const localUpdated = runCommand('git config --local init.defaultBranch main', 'set repository default branch to "main"');

if (!globalUpdated) {
  console.warn('\nGit did not permit updating the global configuration.');
  console.warn('You can run the following command manually if desired:');
  console.warn('  git config --global init.defaultBranch main');
}

if (!localUpdated) {
  console.warn('\nGit did not permit updating the local repository configuration.');
  console.warn('Ensure you run this script from inside the repository root.');
}

if (globalUpdated || localUpdated) {
  console.log('\nDefault branch configuration has been updated.');
} else {
  console.error('\nFailed to update any git configuration.');
  process.exitCode = 1;
}

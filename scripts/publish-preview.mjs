#!/usr/bin/env node
// Publish this checkout to the existing iOS and Android preview installations.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env, EXPO_NO_DOTENV: '1' };

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ''} failed; publishing stopped.`);
  return result.stdout?.trim() ?? '';
}

function easJson(args) {
  const output = run('eas', [...args, '--json', '--non-interactive'], true);
  // EAS 24 prints an environment-loading message before fingerprint JSON.
  const start = output.search(/^[{[]/m);
  if (start < 0) throw new Error(`EAS ${args[0]} returned no JSON.`);
  return JSON.parse(output.slice(start));
}

function assertClean() {
  if (run('git', ['status', '--porcelain'], true)) {
    throw new Error('Commit or stash checkout changes before publishing (including untracked files).');
  }
}

try {
  const { values } = parseArgs({
    options: {
      message: { type: 'string', short: 'm' },
      check: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log('Usage: node scripts/publish-preview.mjs --message "Describe the update" [--check]');
    console.log('--check runs tests and runtime checks without publishing. No message is required.');
    process.exit(0);
  }
  if (!values.check && !values.message?.trim()) throw new Error('Provide --message "Describe the update".');

  assertClean();
  const commit = run('git', ['rev-parse', 'HEAD'], true);
  console.log(`Preview release from ${commit}`);
  run('eas', ['whoami']);
  run('npm', ['run', 'typecheck']);
  run('npm', ['test', '--', '--ci', '--runInBand']);

  for (const platform of ['ios', 'android']) {
    const [build] = easJson([
      'build:list', '--platform', platform, '--build-profile', 'preview',
      '--channel', 'preview', '--distribution', 'internal', '--status', 'finished', '--limit', '1',
    ]);
    if (!build?.runtime?.version || build.isForIosSimulator) {
      throw new Error(`No finished ${platform} device preview build with a runtime was found.`);
    }
    const fingerprint = easJson([
      'fingerprint:generate', '--platform', platform, '--environment', 'preview',
    ]);
    if (fingerprint.hash !== build.runtime.version) {
      throw new Error(
        `${platform} runtime mismatch: checkout ${fingerprint.hash}, preview build ${build.runtime.version}. ` +
        'Restore native configuration compatibility or distribute a new native build first.',
      );
    }
    console.log(`${platform}: compatible with preview build ${build.id} (${fingerprint.hash})`);
  }

  // Catch edits made by another process while checks were running.
  assertClean();
  if (run('git', ['rev-parse', 'HEAD'], true) !== commit) {
    throw new Error('HEAD changed during verification; run again.');
  }
  if (values.check) {
    console.log('Preview checks passed. Nothing was published.');
  } else {
    run('eas', [
      'update', '--platform', 'all', '--channel', 'preview', '--environment', 'preview',
      '--message', values.message.trim(), '--non-interactive',
    ]);
    console.log('Published. Open the app online, wait for download, then fully close and reopen it.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

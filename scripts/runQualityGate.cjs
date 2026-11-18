const { spawnSync } = require('child_process');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const mode = process.argv[2] || 'full';
const scripts = mode === 'selenium'
  ? ['qa:selenium', 'qa:selenium:bug-report', 'qa:selenium:public']
  : mode === 'full'
    ? ['verify', 'qa:selenium', 'qa:selenium:bug-report', 'qa:selenium:public']
    : [];

if (!scripts.length) {
  console.error(`Unknown quality gate mode: ${mode}`);
  process.exit(2);
}

for (const script of scripts) {
  console.log(`\n[quality-gate] running npm run ${script}`);
  const result = spawnSync(npmCommand, ['run', script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`[quality-gate] ${script} could not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[quality-gate] ${script} failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
  console.log(`[quality-gate] ${script} passed`);
}

console.log(`\n[quality-gate] ${mode} gate passed (${scripts.length}/${scripts.length} stages)`);

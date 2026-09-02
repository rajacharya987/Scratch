/**
 * Install Husky git hooks locally. Skip on CI/Vercel where husky is unused
 * and may not be on PATH (production installs omit root devDependencies).
 */
if (process.env.VERCEL || process.env.CI || process.env.HUSKY === '0') {
    process.exit(0);
}

const {spawnSync} = require('child_process');
const result = spawnSync('husky', ['install'], {stdio: 'inherit', shell: true});
if (result.error && result.error.code === 'ENOENT') {
    process.exit(0);
}
process.exit(result.status === null ? 0 : result.status);

/**
 * Vercel production build for the Scratch GUI playground (editor + player).
 * Prints diagnostics so a missing webpack-cli fails immediately instead of
 * waiting on an interactive "install webpack-cli?" prompt.
 */
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const root = process.cwd();
const guiDir = path.join(root, 'packages', 'scratch-gui');

console.log('vercel-build: node', process.version);
console.log('vercel-build: cwd', root);

const resolveCli = () => {
    try {
        return require.resolve('webpack-cli/bin/cli.js', {paths: [guiDir, root]});
    } catch (err) {
        return null;
    }
};

const cli = resolveCli();
const binDir = path.join(root, 'node_modules', '.bin');
if (fs.existsSync(binDir)) {
    const webpackBins = fs.readdirSync(binDir).filter(name => name.toLowerCase().includes('webpack'));
    console.log('vercel-build: root .bin webpack*', webpackBins.join(', ') || '(none)');
}
if (!cli) {
    console.error('vercel-build: webpack-cli is not installed. Install devDependencies and retry.');
    process.exit(1);
}
console.log('vercel-build: using', cli);

const result = spawnSync(process.execPath, [cli, '--progress', '--color'], {
    cwd: guiDir,
    stdio: 'inherit',
    env: Object.assign({}, process.env, {
        NODE_ENV: 'development',
        BUILD_TYPE: 'dev',
        CI: '',
        WEBPACK_CLI_SKIP_INSTALL: 'true',
        NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=6144'
    })
});

if (result.error) {
    console.error('vercel-build:', result.error);
    process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);

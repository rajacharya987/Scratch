/**
 * Vercel production build for the Scratch GUI playground (editor + player + game).
 * Prints diagnostics so a missing webpack-cli fails immediately instead of
 * waiting on an interactive "install webpack-cli?" prompt.
 */
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const root = process.cwd();
const guiDir = path.join(root, 'packages', 'scratch-gui');
const buildDir = path.join(guiDir, 'build');
const gameSrc = path.join(root, 'game', 'game', 'index.html');
const gameDest = path.join(buildDir, 'static', 'game', 'index.html');

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

console.log('vercel-build: starting webpack');
const result = spawnSync(process.execPath, [cli, '--color', '--stats', 'errors-warnings'], {
    cwd: guiDir,
    stdio: 'inherit',
    env: Object.assign({}, process.env, {
        NODE_ENV: 'development',
        BUILD_TYPE: 'dev',
        VERCEL: process.env.VERCEL || '1',
        WEBPACK_CLI_SKIP_INSTALL: 'true',
        NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=6144'
    })
});

if (result.error) {
    console.error('vercel-build:', result.error);
    process.exit(1);
}
console.log('vercel-build: webpack exit', result.status);
if (result.status) {
    process.exit(result.status);
}

const indexHtml = path.join(buildDir, 'index.html');
if (!fs.existsSync(indexHtml)) {
    console.error('vercel-build: missing', indexHtml);
    process.exit(1);
}

fs.mkdirSync(path.dirname(gameDest), {recursive: true});
if (fs.existsSync(gameSrc)) {
    fs.copyFileSync(gameSrc, gameDest);
    console.log('vercel-build: copied game to', path.relative(root, gameDest));
} else if (!fs.existsSync(gameDest)) {
    console.error('vercel-build: missing game HTML at', gameSrc);
    process.exit(1);
}

console.log('vercel-build: ok', path.relative(root, buildDir));
process.exit(0);

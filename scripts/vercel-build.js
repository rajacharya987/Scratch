/**
 * Vercel production build for the Scratch GUI playground (editor + player + game).
 * Resolves the monorepo root even when Vercel cwd is a package folder, then
 * copies the editor into `public` (and task-herder dist/public) so dashboard
 * Vite defaults still find an index.html.
 */
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const findRepoRoot = start => {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
        const pkgFile = path.join(dir, 'package.json');
        if (fs.existsSync(pkgFile)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
                if (pkg.workspaces) return dir;
            } catch (err) {
                void err;
            }
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return path.resolve(start);
};

const root = findRepoRoot(process.cwd());
const guiDir = path.join(root, 'packages', 'scratch-gui');
const buildDir = path.join(guiDir, 'build');
const gameSrc = path.join(root, 'game', 'game', 'index.html');
const gameDest = path.join(buildDir, 'static', 'game', 'index.html');

console.log('vercel-build: node', process.version);
console.log('vercel-build: cwd', process.cwd());
console.log('vercel-build: root', root);

const resolveCli = () => {
    try {
        return require.resolve('webpack-cli/bin/cli.js', {paths: [guiDir, root]});
    } catch (err) {
        return null;
    }
};

const cli = resolveCli();
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
}

const copyBuild = dest => {
    fs.rmSync(dest, {recursive: true, force: true});
    fs.cpSync(buildDir, dest, {recursive: true});
    console.log('vercel-build: output', path.relative(root, dest));
};

copyBuild(path.join(root, 'public'));
copyBuild(path.join(root, 'packages', 'task-herder', 'public'));
copyBuild(path.join(root, 'packages', 'task-herder', 'dist'));
copyBuild(path.join(root, 'packages', 'scratch-gui', 'public'));

if (!fs.existsSync(path.join(root, 'public', 'index.html'))) {
    console.error('vercel-build: public/index.html missing');
    process.exit(1);
}

console.log('vercel-build: ok');
process.exit(0);

'use strict';

const fs = require('fs/promises');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'www');

const entries = [
    'index.html',
    'manifest.webmanifest',
    'sw.js',
    'css',
    'js',
    'assets'
];

async function copyEntry(entry) {
    const source = path.join(root, entry);
    const target = path.join(outDir, entry);
    await fs.cp(source, target, {
        recursive: true,
        force: true,
        filter: (sourcePath) => !sourcePath.endsWith('.DS_Store')
    });
}

async function main() {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });
    for (const entry of entries) {
        await copyEntry(entry);
    }
    await fs.writeFile(path.join(outDir, '.nojekyll'), '');
    console.log('Built static app in www/');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

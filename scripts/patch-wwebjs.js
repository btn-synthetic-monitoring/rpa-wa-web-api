const fs = require('fs');
const path = require('path');

const targetFile = path.join(
    process.cwd(),
    'node_modules',
    'whatsapp-web.js',
    'src',
    'util',
    'Injected',
    'Store.js'
);

const patchedMarker = "const connAction = window.require('WAWebSetPushnameConnAction');";
const legacyBlock = [
    "window.Store.Settings = {",
    "        ...window.require('WAWebUserPrefsGeneral'),",
    "        ...window.require('WAWebUserPrefsNotifications'),",
    "        setPushname: window.require('WAWebSetPushnameConnAction').setPushname",
    '    };'
].join('\n');

const patchedBlock = [
    "const connAction = window.require('WAWebSetPushnameConnAction');",
    "    window.Store.Settings = {",
    "        ...window.require('WAWebUserPrefsGeneral'),",
    "        ...window.require('WAWebUserPrefsNotifications'),",
    "        ...(connAction ? { setPushname: connAction.setPushname } : {})",
    '    };'
].join('\n');

if (!fs.existsSync(targetFile)) {
    console.warn('[patch-wwebjs] Skip: target file not found.');
    process.exit(0);
}

const content = fs.readFileSync(targetFile, 'utf8');

if (content.includes(patchedMarker)) {
    console.log('[patch-wwebjs] Already patched.');
    process.exit(0);
}

if (!content.includes(legacyBlock)) {
    console.warn('[patch-wwebjs] Skip: expected legacy block not found.');
    process.exit(0);
}

const nextContent = content.replace(legacyBlock, patchedBlock);
fs.writeFileSync(targetFile, nextContent, 'utf8');
console.log('[patch-wwebjs] Patch applied.');

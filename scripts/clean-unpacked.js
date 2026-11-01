// electron-builder afterAllArtifactBuild hook: remove the unpacked .app folders from dist/
// once the DMG and ZIP exist, so Spotlight doesn't list a second Messenger-Bubble
// next to the one installed in /Applications.
const fs = require('fs');
const path = require('path');

exports.default = async function cleanUnpacked(buildResult) {
  const outDir = buildResult.outDir;
  for (const entry of fs.readdirSync(outDir)) {
    if (/^mac(-\w+)?$/.test(entry)) {
      fs.rmSync(path.join(outDir, entry), { recursive: true, force: true });
      console.log(`  • removed unpacked app  ${path.join(outDir, entry)}`);
    }
  }
  return [];
};

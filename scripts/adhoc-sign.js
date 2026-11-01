// electron-builder afterPack hook: ad-hoc sign the whole app bundle.
// Without an Apple Developer ID the build is unsigned, and Electron's leftover linker
// signature no longer matches the renamed bundle, which macOS reports as "damaged".
// A consistent ad-hoc signature lets users open it with right-click → Open instead.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
  console.log(`  • ad-hoc signed  ${appPath}`);
};

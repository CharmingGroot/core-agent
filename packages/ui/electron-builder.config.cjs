/**
 * electron-builder configuration for @cli-agent/ui
 *
 * Builds the Electron app for distribution.
 * Main process and preload are compiled via tsc (CommonJS).
 * Renderer is bundled via esbuild into dist/renderer/.
 */

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.cli-agent.ui',
  productName: 'CLI Agent',
  directories: {
    output: 'release',
    buildResources: 'build-resources',
  },
  files: [
    'dist/**/*',
    '!dist/**/*.map',
    '!dist/**/*.d.ts',
    '!dist/**/*.d.ts.map',
  ],
  extraMetadata: {
    main: 'dist/main/main.js',
  },
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    icon: 'build-resources/icon.ico',
    signAndEditExecutable: false,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
  },
  forceCodeSigning: false,
  // Disable asar for easier debugging; enable for production
  asar: true,
};

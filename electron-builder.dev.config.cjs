const path = require('node:path')

module.exports = {
  extends: './electron-builder.yml',
  appId: 'com.kangfenmao.CherryStudioDev',
  productName: 'Cherry Studio Dev',
  directories: {
    output: path.resolve(process.env.CHERRY_DEV_PORTABLE_OUTPUT_DIR || '.context/cherry-electron-dev/package-build')
  },
  win: {
    icon: 'D:/FireFox/cherry-studio.ico'
  },
  portable: {
    artifactName: 'cherry-studio-portable.${ext}'
  },
  extraMetadata: {
    cherryEdition: 'global',
    cherryAppId: 'com.kangfenmao.CherryStudioDev'
  }
}

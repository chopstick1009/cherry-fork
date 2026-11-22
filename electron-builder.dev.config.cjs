const path = require('node:path')

module.exports = {
  extends: './electron-builder.yml',
  appId: 'com.kangfenmao.CherryStudioDev',
  productName: 'Cherry Studio Dev',
  directories: {
    output: path.resolve(__dirname, '.context/cherry-electron-dev/package-build')
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

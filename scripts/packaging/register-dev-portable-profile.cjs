const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '../..')
const outputDirectory = path.join(projectRoot, '.context/cherry-electron-dev/package-build')
const userDataDirectory = path.join(projectRoot, '.context/cherry-electron-dev/package/data')
const databasePath = path.join(userDataDirectory, 'Data/cherrystudio.sqlite')
const bootConfigPath = path.join(os.homedir(), '.cherrystudio/boot-config.json')
const normalizedPortableExecutable = path.join(outputDirectory, 'cherry-studio-portable.exe')

if (!fs.existsSync(databasePath)) {
  throw new Error(`The existing development database was not found: ${databasePath}`)
}

const config = fs.existsSync(bootConfigPath) ? JSON.parse(fs.readFileSync(bootConfigPath, 'utf8')) : {}
const mappings = config['app.user_data_path'] ?? {}
const existing = mappings[normalizedPortableExecutable]
if (existing && path.resolve(existing) !== path.resolve(userDataDirectory)) {
  throw new Error(`A different userData directory is already configured for ${normalizedPortableExecutable}`)
}

config['app.user_data_path'] = { ...mappings, [normalizedPortableExecutable]: userDataDirectory }
fs.mkdirSync(path.dirname(bootConfigPath), { recursive: true })
const temporaryPath = `${bootConfigPath}.${process.pid}.tmp`
fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
fs.renameSync(temporaryPath, bootConfigPath)

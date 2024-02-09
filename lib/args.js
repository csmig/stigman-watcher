
import help_default from './help.js'
help_default()
import { Command, Option, InvalidOptionArgumentError } from 'commander'
import { readFileSync } from 'fs'
import * as logger from './logger.js'
import { config } from 'dotenv' 
import { resolve, sep, posix } from 'path'
import promptSync from 'prompt-sync'
import { createPrivateKey } from 'crypto'
import { fileURLToPath } from 'url';

const prompt = promptSync({ sigint:true })
const component = 'args'

function getVersion() {
  try {
    const packageJsonText = readFileSync('./package.json', 'utf8');
    return JSON.parse(packageJsonText).version;
  } 
  catch (error) {
    console.error('Error reading package.json:', error);
  }
}

let configValid = true

const version = getVersion();

// Use .env, if present, to setup the environment
config()

const pe = process.env //shorthand variable

// Create an Option for options that have choices
const logLevelOption = new Option('--log-level <level>', 'Log level for the console (`WATCHER_LOG_LEVEL`).')
.choices(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
.default(pe.WATCHER_LOG_LEVEL ?? 'info')

const logFileLevelOption = new Option('--log-file-level <level>', 'Log level for the log file (`WATCHER_LOG_FILE_LEVEL`).')
.choices(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
.default(pe.WATCHER_LOG_FILE_LEVEL ?? 'verbose')

const modeOption = new Option('--mode <mode>', 'Strategy for detecting files to be processed. (`WATCHER_MODE`).')
.choices(['scan', 'events'])
.default(pe.WATCHER_MODE ?? 'events')

// option parse functions
const getBoolean = (envvar, defaultState = true) => {
  if (pe[envvar] === undefined) {
    return defaultState
  }
  else {
    return pe[envvar] === '1' || pe[envvar] === 'true'
  }
}
const parseIntegerArg = (value) => {
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new InvalidOptionArgumentError('Not a number.');
  }
  return parsedValue;
}
const parseIntegerEnv = (value) => {
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    return undefined
  }
  return parsedValue;
}

// Build the Command
const program = new Command()
program
.usage('[options]\n\nA utility that watches a directory for test result files on behalf of a STIG Manager Collection. Many options can be set with an environment variable prefixed by `WATCHER_` and are documented in the descriptions. The environment can be set by providing an .env file in the current directory.')
.configureHelp({ sortOptions: true })
.version(version, '--version', 'Print the current version and exit.')
.option('-p, --path <path>', 'Base path to watch (`WATCHER_PATH`).', pe.WATCHER_PATH || '.')
.requiredOption('-c, --collection-id <id>', 'collectionId to manage (`WATCHER_COLLECTION`).', pe.WATCHER_COLLECTION)
.option('-s, --silent', 'Disable logging to the console.', false)
.option('--prompt', 'Prompt for missing client secret or private key passphrase.', false)
.addOption(logLevelOption)
.addOption(logFileLevelOption)
.addOption(modeOption)
.option('--history-file <path>', 'If `--mode scan`, the path to a scan history file (`WATCHER_HISTORY_FILE`). Will be created if needed, ignored if `--mode events`, disabled with `--no-history-file`. A line is written for each file discovered by the scanner and the scanner ignores any existing entries.', pe.WATCHER_HISTORY_FILE ?? false)
.option('--no-history-file', 'If `--mode scan`, disable the scan history file.')
.option('--log-file <path>', 'Path to the log file which will be created if needed (`WATCHER_LOG_FILE`). Disable file logging with `--no-log-file`.', pe.WATCHER_LOG_FILE ?? false)
.option('--no-log-file', 'Disable logging to a logfile.')
.requiredOption('--api <url>', 'Base URL of the STIG Manager API service (`WATCHER_API_BASE`).', pe.WATCHER_API_BASE)
.requiredOption('--authority <url>', 'Base URL of the OIDC authentication service that issues OAuth2 tokens for the API (`WATCHER_AUTHORITY`)', pe.WATCHER_AUTHORITY)
.requiredOption('--client-id <string>', 'OIDC clientId to authenticate (`WATCHER_CLIENT_ID`). You will be prompted for the client secret if `--client-key` is not present and `--prompt` is present, unless `WATCHER_CLIENT_SECRET` is set', pe.WATCHER_CLIENT_ID)
.option('--client-key <path>', 'Path to a PEM encoded private key (`WATCHER_CLIENT_KEY`). If the key is encrypted, you will be prompted for the passphrase if `--prompt` is present, unless `WATCHER_CLIENT_KEY_PASSPHRASE` is set.',  pe.WATCHER_CLIENT_KEY)
.option('--add-existing', 'For `--mode events`, existing files in the path will generate an `add` event (`WATCHER_ADD_EXISTING=1`). Ignored if `--mode scan`, negate with `--no-add-existing`.',  getBoolean('WATCHER_ADD_EXISTING', false))
.option('--no-add-existing', 'Ignore existing files in the watched path (`WATCHER_ADD_EXISTING=0`).')
.option('--cargo-delay <ms>', 'Milliseconds to delay processing the queue (`WATCHER_CARGO_DELAY`)',  parseIntegerArg,  parseIntegerEnv(pe.WATCHER_CARGO_DELAY) ?? 2000)
.option('--cargo-size <number>', 'Maximum queue size that triggers processing (`WATCHER_CARGO_SIZE`)', parseIntegerArg, parseIntegerEnv(pe.WATCHER_CARGO_SIZE) ?? 25)
.option('--create-objects', 'Create Assets or STIG Assignments as needed (`WATCHER_CREATE_OBJECTS=1`). Negate with `--no-create-objects`.', getBoolean('WATCHER_CREATE_OBJECTS', true))
.option('--no-create-objects', 'Do not create Assets or STIG Assignments (`WATCHER_CREATE_OBJECTS=0`).')
.option('--ignore-dir [name...]', 'DEPRECATED, use --ignore-glob. Sub-directory name to ignore. Can be invoked multiple times.(`WATCHER_IGNORE_DIRS=<csv>`)', pe.WATCHER_IGNORE_DIRS?.split(','))
.option('--ignore-glob [glob...]', 'File or diectory glob(s) to ignore. Can be invoked multiple times.(`WATCHER_IGNORE_GLOBS=<csv>`)', pe.WATCHER_IGNORE_GLOBS?.split(','))
.option('--event-polling', 'Use polling with `--mode events`, necessary for watching network files (`WATCHER_EVENT_POLLING=1`). Ignored if `--mode scan`, negate with `--no-event-polling`.', getBoolean('WATCHER_EVENT_POLLING', true))
.option('--no-event-polling', 'Don\'t use polling with `--mode events`, reduces CPU usage (`WATCHER_EVENT_POLLING=0`).')
.option('--stability-threshold <ms>', 'If `--mode events`, milliseconds to wait for file size to stabilize. May be helpful when watching network shares. (`WATCHER_STABILITY_THRESHOLD`). Igonred with `--mode scan`', parseIntegerArg, parseIntegerEnv(pe.WATCHER_STABILITY_THRESHOLD) ?? 0)
.option('--one-shot', 'Process existing files in the path and exit. Sets `--add-existing`.', false)
.option('--log-color', 'Colorize the console log output. Might confound downstream piped processes.', false)
.option('-d, --debug', 'Shortcut for `--log-level debug --log-file-level debug`', false)
.option('--scan-interval <ms>', 'If `--mode scan`, the interval between scans. Ignored if `--mode events`.', parseIntegerArg,  parseIntegerEnv(pe.WATCHER_SCAN_INTERVAL) ?? 300000)
.option('--ignore-dot', 'Ignore dotfiles in the path (`WATCHER_IGNORE_DOT=1`). Negate with `--no-ignore-dot`.', getBoolean('WATCHER_IGNORE_DOT', true))
.option('--no-ignore-dot', 'Do not ignore dotfiles in the path (`WATCHER_IGNORE_DOT=0`).')
.option('--strict-revision-check', 'For CKL, ignore checklist of uninstalled STIG revision (`WATCHER_STRICT_REVISION_CHECK=1`). Negate with `--no-strict-revision-check`.', getBoolean('WATCHER_STRICT_REVISION_CHECK', false))
.option('--no-strict-revision-check', 'For CKL, allow checklist of uninstalled STIG revision (`WATCHER_STRICT_REVISION_CHECK=0`). This is the default behavior.')

// Parse ARGV and get the parsed options object
program.parse(process.argv)
const options = program.opts()

// deprecate ignoreDir
if (options.ignoreDir) {
  const ignoreDirGlobs = options.ignoreDir.map( (dir) => `**/${dir}`)
  if (options.ignoreGlob) {
    options.ignoreGlob.push(...ignoreDirGlobs)
  }
  else {
    options.ignoreGlob = ignoreDirGlobs
  }
}

// add semver info
options.version = version

// Set path variations
options._originalPath = options.path
options._resolvedPath = resolve(options.path)
options.path = options.path.split(sep).join(posix.sep)

// Set dependent options
if (options.oneShot) {
  options.addExisting = true
}
if (options.debug) {
  options.logLevel = 'debug'
  options.logFileLevel = 'debug'
}

// Start logging
logger.addConsoleTransport( options.logLevel, options.logColor, options.silent )
if (options.logFile) {
  logger.addFileTransport( options.logFileLevel, options.logFile )
}

// Validate we can perform the requested client authentication
if (options.clientKey) {
  try {
    // Transform the path into a crypto private key object
    options.clientKey = getPrivateKey ( options.clientKey, process.env.WATCHER_CLIENT_KEY_PASSPHRASE, options.prompt)
  }
  catch (e) {
    // Could not make a private key
    logger.logger.log({
      level: 'error',
      component: component,
      message: 'private key error',
      file: options.clientKey,
      error: e
    })
    configValid = false
  }
}
else {
  // Test if we were provided, or can obtain, a client secret
  options.clientSecret = process.env.WATCHER_CLIENT_SECRET
  if (options.prompt && !options.clientSecret) {
    options.clientSecret = prompt(`Provide the client secret for ${options.clientId}: `, { echo: '*' })
  }
  if (!options.clientSecret) {
    // Don't know the client secret
    logger.logger.error({
      component: component,
      message: 'Missing client secret'
    })
    configValid = false
  }
}

logger.logger.log({
  level: 'debug',
  component: component,
  message: 'parsed options',
  options: options
})

function getPrivateKey( pemFile, passphrase, canPrompt) {
  let pemKey
  try {
    pemKey = readFileSync(pemFile)
  }
  finally {}
  try {
    return createPrivateKey({ key: pemKey, passphrase: passphrase })
  }
  catch (e) {
    let clientKeyPassphrase
    if (e.code === 'ERR_MISSING_PASSPHRASE' && canPrompt) {
      clientKeyPassphrase = prompt(`Provide passphrase for the client private key: `, { echo: "*" })
      try {
        return createPrivateKey({ key: pemKey, passphrase: clientKeyPassphrase })
      }
      finally {}
    }
    else {
      throw (e)
    }
  } 
}


export { options, configValid }


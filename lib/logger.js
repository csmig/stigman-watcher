import { createLogger, format, transports } from 'winston'

class JsonFieldOrder {
  constructor(enabled = true) {
      this.enabled = enabled
  }
  transform(obj) {
      if (this.enabled) {
          return {
            timestamp: obj.timestamp,
            level: obj.level,
            component: obj.component,
            message: obj.message,
            ...obj
          }
      }
      return obj
  }
}

// const colorFormat = format.colorize({ all: true, colors: {
//   info: 'white'
// } })
const colorFormat = format.colorize({ 
  all: true,
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'cyan',
    verbose: 'cyan',
    debug: 'cyan',
    silly: 'grey'
  }
})

const logger = createLogger({
  level: 'silly',
  format: format.combine(
    format.timestamp(),
    new JsonFieldOrder(),
    format.printf(info => JSON.stringify(info))
  ),
  transports: []
})

const addConsoleTransport = ( level, colorize, silent ) => {
  const options = {
    level: level,
    silent: silent
  }
  if (colorize) {
    options.format = colorFormat
  }
  logger.add(new transports.Console(options))
  logger.log({
    level: 'debug',
    component: 'logger',
    message: 'added console',
    logLevel: options.logLevel
  })  
}
const addFileTransport = ( level, filename ) => {
  logger.add(new transports.File({ level: level, filename: filename }))
  logger.log({
    level: 'debug',
    component: 'logger',
    message: 'added log file',
    logFile: filename,
    logLevel: level
  })

}

function getSymbol( obj, description ) {
  const symbols = Object.getOwnPropertySymbols(obj)
  for (const symbol of symbols) {
    if (symbol.description === description) {
      return obj[symbol]
    }
  }
  return null
}

export { logger, addConsoleTransport, addFileTransport, getSymbol }
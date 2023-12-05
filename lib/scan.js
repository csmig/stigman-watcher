import fastGlob from 'fast-glob'
import options from './args.js'
import { logger } from './logger.js'
import { existsSync, createWriteStream } from 'fs'
import { queue } from './parse.js'
import { serializeError } from 'serialize-error'
import lineByLine from 'n-readlines'

const component = 'scan'
const history = new Set()
if (options.historyFile && existsSync(options.historyFile)) {
  const liner = new lineByLine(options.historyFile)
  let lineCount = 0, line
  while (line = liner.next()) {
    history.add(line.toString('ascii'))
    lineCount++
  }
  logger.verbose({ 
    component: component, 
    message: `history initialized from file`,
    file: options.historyFile,
    entries: lineCount
  })
}

let historyStream
if (options.historyFile) {
  historyStream = createWriteStream(options.historyFile, { flags: 'a' });
}

async function startScanner () {
  try {
    const stream = fastGlob.stream([`${options.path}/**/*.ckl`, `${options.path}/**/*.xml`,`${options.path}/**/*.cklb` ], { 
      dot: !options.ignoreDot,
      suppressErrors: true,
      ignore: options.ignoreGlob ?? []
    })
    logger.info({component: component, message: `scan started`, path: options.path})

    for await (const entry of stream) {
      logger.verbose({component: component, message: `discovered file`, file: entry})
      if (history.has(entry)) {
        logger.verbose({component: component, message: `history match`, file: entry})
      }
      else {
        history.add(entry)
        logger.verbose({component: component, message: `history add`, file: entry})
        if (options.historyFile) _writeHistory(entry)
        queue.push(entry)
        logger.info({component: component, message: `queued for parsing`, file: entry})
      }
    }
    logger.info({component: component, message: `scan ended`, path: options.path})
  }
  catch(e) {
    logger.error({component: component, error: serializeError(e)})
  }
  finally {
    if (!options.oneShot) scheduleNextScan()
  }
}

async function _writeHistory (entry) {
  try {
    historyStream.write(`${entry}\n`)
  }
  catch (e) {
    logger.error({
      component: component,
      error: serializeError(e)
    })
  }
}

function scheduleNextScan ( delay = options.scanInterval ) {
  setTimeout(startScanner, delay)
  logger.info({ 
    component: component, 
    message: `scan scheduled`, 
    path: options.path,
    delay: options.scanInterval 
  })
}

export { startScanner, scheduleNextScan }

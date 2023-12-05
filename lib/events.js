import options from './args.js'
import { logger } from './logger.js'
import { queue } from './parse.js'
import { serializeError } from 'serialize-error'
import { watch } from 'chokidar'

const component = 'events'
export function startFsEventWatcher() {
  const awaitWriteFinishVal = options.stabilityThreshold ? { stabilityThreshold: options.stabilityThreshold } : false
  const ignored = options.ignoreGlob ?? []
  if (options.ignoreDot) ignored.push(/(^|[\/\\])\../)
  const watcher = watch(options.path, {
    ignored,
    ignoreInitial: !options.addExisting,
    persistent: true,
    usePolling: options.usePolling,
    awaitWriteFinish: awaitWriteFinishVal
  })
  logger.info({component: component, message: `watching`, path: options.path})
  
  watcher.on('ready', e => {
    if (options.oneShot) {
      watcher.close()
    }
  })
  
  watcher.on('error', e => {
    logger.error({
      component: component,
      error: serializeError(e)
    })
  })
  
  watcher.on('add', file  => {
    // chokidar glob argument doesn't work for UNC Windows, so we check file extension here
    const extension = file.substring(file.lastIndexOf(".") + 1)
    if (extension.toLowerCase() === 'ckl' || extension.toLowerCase() === 'xml') {
      logger.info({
        component: component,
        message: 'file system event',
        event:  'add',
        file: file
      })
      queue.push( file )
    }
  })
}





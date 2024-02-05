import { options } from './args.js'
import { logger, getSymbol } from './logger.js'
import Queue from 'better-queue'
import * as api from './api.js'
import { serializeError } from 'serialize-error'
//import { TaskObject } from 'stig-manager-client-modules'

let stigManagerClientModules;

async function loadSMCMModules() {
  if (typeof Deno !== 'undefined') {
    // Deno 
    stigManagerClientModules = await import('stig-manager-client-modules');
  } else {
    // Node.js 
    stigManagerClientModules = await import('stig-manager-client-modules');
  }
}



const component = 'cargo'
let batchId = 0

async function writer ( taskAsset ) {
  const component = 'writer'
  try {
    logger.debug({ 
      component: component,
      message: `${taskAsset.assetProps.name} started`
    })

    // Create new asset if necessary
    if ( !taskAsset.knownAsset ) {
      const r = await api.createOrGetAsset( taskAsset.assetProps )
      // GET projection=stigs is an object, we just need the benchmarkIds
      r.apiAsset.stigs = r.apiAsset.stigs.map ( stig => stig.benchmarkId )
      logger.info({ component: component, message: `asset ${r.created ? 'created' : 'found'}`, asset: r.apiAsset })
      // TODO: If created === false, then STIG assignments should be vetted again
      taskAsset.assetProps = r.apiAsset
    }

    // Assign new STIGs, if necessary
    if ( taskAsset.knownAsset && taskAsset.hasNewAssignment ) {
      const r = await api.patchAsset(taskAsset.assetProps.assetId, {
        // remove collectionId when https://github.com/NUWCDIVNPT/stig-manager/issues/259 is closed 
        collectionId: options.collectionId,
        stigs: taskAsset.assetProps.stigs
      })
      r.stigs = r.stigs.map( stig => stig.benchmarkId )
      logger.info({ component: component, message: `STIG assignments updated`, 
        asset: { assetId: r.assetId, name: r.name, stigs: r.stigs } })
    }

    // POST reviews
    let reviews = []
    for (const assetStigChecklists of taskAsset.checklists.values()) {
      // Since the parsed files were sorted by ascending date order, the last
      // item in each checklists array was parsed from the most recently dated checklist file and we will choose this item.
      const checklist = assetStigChecklists.slice(-1)[0]
      reviews = reviews.concat(checklist.reviews)
    }
    if (reviews.length > 0) {
      const r = await api.postReviews(options.collectionId, taskAsset.assetProps.assetId, reviews)
      logger.info({
        component: component, 
        message: `posted reviews`,
        asset: { name: taskAsset.assetProps.name, id: taskAsset.assetProps.assetId }, 
        rejected: r.rejected,
        affected: r.affected
      })
    }
    else {
      logger.warn({
        component: component, 
        message: `no reviews to post`,
        asset: { name: taskAsset.assetProps.name, id: taskAsset.assetProps.assetId }, 
      })

    }
  }  
  catch (error) {
    const errorObj = {
      component: error.component ?? component,
      message: error?.message,
    }
    if (error.request) {
      errorObj.request = {
        method: error.request.options?.method,
        url: error.request.requestUrl,
        body: getSymbol(error.request, 'body')
      }
    }
    if (error.response) {
      errorObj.response = {
        status: error.response.statusCode,
        body: error.response.body
      }
    }
    if (error.name !== 'RequestError' && error.name !== 'HTTPError') {
      errorObj.error = serializeError(error)
    }
    logger.error(errorObj)
  }
}

async function resultsHandler( parsedResults, cb ) {
  const component = 'batch'
  try {
    batchId++
    logger.info({component: component, message: `batch started`, batchId: batchId, size: parsedResults.length})
    const apiAssets = await api.getCollectionAssets(options.collectionId)
    const apiStigs = await api.getInstalledStigs()
    await loadSMCMModules();
    const TaskObject = stigManagerClientModules.TaskObject;
    const tasks = new TaskObject({ parsedResults, apiAssets, apiStigs, options: options });


    for ( const taskAsset of tasks.taskAssets.values() ) {
      await writer( taskAsset )
    }
    logger.info({component: component, message: 'batch ended', batchId: batchId})
    cb()
  }
  catch (e) {
    logger.error({component: component, message: e.message, error: serializeError(e)})
    cb( e, undefined)
  }
}

const cargoQueue = new Queue(resultsHandler, {
  id: 'file',
  batchSize: options.cargoSize,
  batchDelay: options.oneShot ? 0 : options.cargoDelay,
  // batchDelayTimeout: options.cargoDelay
})
cargoQueue
.on('batch_failed', (err) => {
  logger.error( {
    component: 'cargo',
    message: err?.message,
  })
})
.on('batch_finish', (a, b, c) => {
  // console.log(`waiting ${cargoQueue._store._queue.length}`)
})
.on('drain', () => {
  if (options.oneShot) {
    logger.info({component: 'cargo', message: 'finished one shot mode'})
    process.exit()
  }
})

export { cargoQueue }

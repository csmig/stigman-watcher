import { cache } from './api.js'
import { XMLParser } from 'fast-xml-parser'
import Queue from 'better-queue'
import { logger } from './logger.js'
import { cargoQueue } from './cargo.js'
import { promises as fs } from 'node:fs'
import he from 'he'
//import { reviewsFromCkl, reviewsFromScc, reviewsFromCklb } from 'stig-manager-client-modules'

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

const valueProcessor = function (tagName, tagValue, jPath, hasAttributes, isLeafNode) {
  he.decode(tagValue)
}

const defaultImportOptions = {
  autoStatus: 'saved',
  unreviewed: 'commented',
  unreviewedCommented: 'informational',
  emptyDetail: 'replace',
  emptyComment: 'ignore',
  allowCustom: true
}

function safeJSONParse (value) {
  try {
    return JSON.parse(value)
  }
  catch (e) {
    return undefined
  }
}

function canUserAccept () {
  if (!cache.user) return false

  const apiCollection = cache.collection
  const userGrant = cache.user.collectionGrants.find( i => i.collection.collectionId === apiCollection.collectionId )?.accessLevel
  return apiCollection.settings.status.canAccept && (userGrant >= apiCollection.settings.status.minAcceptGrant)
}

async function parseFileAndEnqueue (file, cb) {
  const component = 'parser'
  try {
   
    let parseFn
    await loadSMCMModules();
    const extension = file.substring(file.lastIndexOf(".") + 1)
    if (extension === 'ckl') {
      parseFn = stigManagerClientModules.reviewsFromCkl;
    } else if (extension === 'xml') {
      parseFn = stigManagerClientModules.reviewsFromScc;
    } else if (extension === 'cklb') {
      parseFn = stigManagerClientModules.reviewsFromCklb;
    } else {
      throw new Error('Ignored unknown extension');
    }
  

  // ReviewParser params
    const data = await fs.readFile(file)
    logger.verbose({component: component, message: `readFile succeeded`, file: file})

    const apiCollection = cache.collection
    const importOptions = safeJSONParse(apiCollection.metadata?.importOptions) ?? defaultImportOptions
    const fieldSettings = apiCollection.settings.fields
    const allowAccept = canUserAccept()
    const scapBenchmarkMap = cache.scapBenchmarkMap

    let parseResult = parseFn({
      data,
      importOptions,
      fieldSettings,
      allowAccept,
      valueProcessor,
      XMLParser,
      scapBenchmarkMap
    })
    parseResult.file = file
    logger.debug({component: component, message: `parse results`, results: parseResult})
    
    cargoQueue.push( parseResult )
    
    const checklistInfo = []
    for (const checklist of parseResult.checklists) {
      checklistInfo.push({ 
        benchmarkId: checklist.benchmarkId, 
        stats: checklist.stats
      })
    }
    logger.verbose({component: component, message: `results queued`, file: parseResult.file, 
      target: parseResult.target.name, checklists: checklistInfo })
    cb(null, parseResult)
  }
  catch (e) {
    logger.warn({component: component, message: e.message, file: file})
    cb(e, null)
  }
}

export const queue = new Queue (parseFileAndEnqueue, {
  concurrent: 8
})




  
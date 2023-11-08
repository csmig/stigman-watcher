const api = require ('./api')
const { XMLParser } = require('fast-xml-parser')
const ReviewParser = require('./ReviewParser')
const Queue = require('better-queue')
const { logger } = require('./logger')
const cargo = require('./cargo')
const fs = require('fs').promises
const he = require('he')
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
  if (!api.cache.user) return false

  const apiCollection = api.cache.collection
  const userGrant = api.cache.user.collectionGrants.find( i => i.collection.collectionId === apiCollection.collectionId )?.accessLevel
  
  return apiCollection.settings.status.canAccept && (userGrant >= apiCollection.settings.status.minAcceptGrant)
}

async function parseFileAndEnqueue (file, cb) {
  const component = 'parser'
  try {
    const extension = file.substring(file.lastIndexOf(".") + 1)
    let parseFn, type
    if (extension.toLowerCase() === 'ckl') {
      parseFn = ReviewParser.reviewsFromCkl
      type = 'CKL'
    }
    else if (extension.toLowerCase() === 'xml') {
      parseFn = ReviewParser.reviewsFromScc
      type = "XCCDF"
    }
    else if (extension.toLowerCase() === 'cklb') {
      parseFn = ReviewParser.reviewsFromCklb
      type = "CKLB"
    }
    else {
      throw (`Ignored unknown extension`)
    }
    // ReviewParser params
    const data = await fs.readFile(file)
    logger.verbose({component: component, message: `readFile succeeded`, file: file})

    const apiCollection = api.cache.collection
    const importOptions = safeJSONParse(apiCollection.metadata?.importOptions) ?? defaultImportOptions
    const fieldSettings = apiCollection.settings.fields
    const allowAccept = canUserAccept()
    const scapBenchmarkMap = api.cache.scapBenchmarkMap

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
    
    cargo.queue.push( parseResult )
    
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

module.exports.queue = new Queue (parseFileAndEnqueue, {
  concurrent: 8
})




  
#!/usr/bin/env node

import { logger, getSymbol } from './lib/logger.js'
import options from './lib/args.js'
import { getOpenIDConfiguration, getToken } from './lib/auth.js'
import { getDefinition, getCollection, getCollectionAssets, getInstalledStigs, getScapBenchmarkMap, getUser } from './lib/api.js'
import { serializeError } from 'serialize-error'
import { startFsEventWatcher } from './lib/events.js'
import { startScanner } from './lib/scan.js'
import semverGte from 'semver/functions/gte.js'

const minApiVersion = '1.2.7'
try {
  if (!options) {
    logger.end()
    process.exit(1)
  }
  logger.info({
    component: 'main',
    message: 'running',
    config: getObfuscatedConfig(options)
  })
  
  await preflightServices()
  if (options.mode === 'events') {
    startFsEventWatcher()
  }
  else if (options.mode === 'scan') {
    startScanner()
  }
}
catch (e) {
  logError(e)
  logger.end()
}

function logError(e) {
  const errorObj = {
    component: e.component || 'main',
    message: e.message,
  }
  if (e.request) {
    errorObj.request = {
      method: e.request.options?.method,
      url: e.request.requestUrl,
      body: getSymbol(e.request, 'body')
    }
  }
  if (e.response) {
    errorObj.response = {
      status: e.response.statusCode,
      body: e.response.body
    }
  }
  if (e.name !== 'RequestError' && e.name !== 'HTTPError') {
    errorObj.error = serializeError(e)
  }
  logger.error(errorObj)
}

async function hasMinApiVersion () {
  const [remoteApiVersion] = await getDefinition('$.info.version')
  logger.info({ component: 'main', message: `preflight API version`, minApiVersion, remoteApiVersion})
  if (semverGte(remoteApiVersion, minApiVersion)) {
    return true
  }
  else {
    throw( `Remote API version ${remoteApiVersion} is not compatible with this release.` )
  }
}

async function preflightServices () {
  await hasMinApiVersion()
  await getOpenIDConfiguration()
  await getToken()
  logger.info({ component: 'main', message: `preflight token request suceeded`})
  const promises = [
    getCollection(options.collectionId),
    getCollectionAssets(options.collectionId),
    getInstalledStigs(),
    getScapBenchmarkMap()
  ]
  await Promise.all(promises)
  setInterval(refreshCollection, 10 * 60000)
  
  // OAuth scope 'stig-manager:user:read' was not required for early versions of Watcher
  // For now, fail gracefully if we are blocked from calling /user
  try {
    await getUser()
    setInterval(refreshUser, 10 * 60000)
  }
  catch (e) {
    logger.warn({ component: 'main', message: `preflight user request failed; token may be missing scope 'stig-manager:user:read'? Watcher will not set {"status": "accepted"}`})
  }
  logger.info({ component: 'main', message: `prefilght api requests suceeded`})
}

function getObfuscatedConfig (config) {
  const securedConfig = {...config}
  if (securedConfig.clientSecret) {
    securedConfig.clientSecret = '[hidden]'
  }
  return securedConfig
}

async function refreshUser() {
  try {
    await getUser()
  }
  catch (e) {
    logError(e)
  }
}

async function refreshCollection() {
  try {
    await getCollection(options.collectionId)
  }
  catch (e) {
    logError(e)
  }
}

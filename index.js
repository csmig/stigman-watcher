#!/usr/bin/env node

const minApiVersion = '1.2.7'

const { logger, getSymbol } = require('./lib/logger')
const config = require('./lib/args')
if (!config) {
  logger.end()
  return
}
const auth = require('./lib/auth')
const api = require('./lib/api')
const {serializeError} = require('serialize-error')

run()

async function run() {
  try {
    logger.info({
      component: 'main',
      message: 'running',
      config: getObfuscatedConfig(config)
    })
    
    await preflightServices()
    if (config.mode === 'events') {
      const watcher = require('./lib/events')
      watcher.startFsEventWatcher()
    }
    else if (config.mode === 'scan') {
      const scanner = require('./lib/scan')
      scanner.startScanner()
    }
  }
  catch (e) {
    logError(e)
    await logger.end()
  }
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
  const semverGte = require('semver/functions/gte')
  const [remoteApiVersion] = await api.getDefinition('$.info.version')
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
  await auth.getOpenIDConfiguration()
  await auth.getToken()
  logger.info({ component: 'main', message: `preflight token request suceeded`})
  const promises = [
    api.getCollection(config.collectionId),
    api.getCollectionAssets(config.collectionId),
    api.getInstalledStigs(),
    api.getScapBenchmarkMap()
  ]
  await Promise.all(promises)
  setInterval(refreshCollection, 10 * 60000)
  
  // OAuth scope 'stig-manager:user:read' was not required for early versions of Watcher
  // For now, fail gracefully if we are blocked from calling /user
  try {
    await api.getUser()
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
    await api.getUser()
  }
  catch (e) {
    logError(e)
  }
}

async function refreshCollection() {
  try {
    await api.getCollection(config.collectionId)
  }
  catch (e) {
    logError(e)
  }
}

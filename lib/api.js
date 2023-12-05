
import got from 'got'
import options from './args.js'
import { getToken, tokens } from './auth.js'
import { logger, getSymbol } from './logger.js'

const cache = {
  collection: null,
  assets: null,
  user: null,
  definition: null,
  scapBenchmarkMap: null,
  stigs: null
}

const _cache = cache
export { _cache as cache }

async function apiGet(endpoint, authenticate = true) {
  try {
    const requestOptions = {
      responseType: 'json'
    }
    if (authenticate) {
      await getToken()
      requestOptions.headers = {
        Authorization: `Bearer ${tokens.access_token}`
      }
    }
    const response = await got.get(`${options.api}${endpoint}`, requestOptions)
    logResponse (response )
    return response.body
  }
  catch (e) {
    e.component = 'api'
    logError(e)
    throw (e)
  }
} 

export async function getScapBenchmarkMap () {
  const response = await apiGet('/stigs/scap-maps')
  cache.scapBenchmarkMap = new Map(response.map(apiScapMap => [apiScapMap.scapBenchmarkId, apiScapMap.benchmarkId]))
  return cache.scapBenchmarkMap
}

export async function getDefinition (jsonPath) {
  cache.definition = await apiGet(`/op/definition${jsonPath ? '?jsonpath=' + encodeURIComponent(jsonPath) : ''}`, false) 
  return cache.definition
}

export async function getCollection (collectionId) {
  cache.collection = await apiGet(`/collections/${collectionId}`)
  return cache.collection
}

export async function getCollectionAssets (collectionId) {
  cache.assets = await apiGet(`/assets?collectionId=${collectionId}&projection=stigs`)
  return cache.assets
}

export async function getInstalledStigs () {
  cache.stigs = await apiGet('/stigs')
  return cache.stigs
}

export async function createOrGetAsset (asset) {
  try {
    await getToken()
    const response = await got.post(`${options.api}/assets?projection=stigs`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      },
      json: asset,
      responseType: 'json'
    })
    logResponse(response)
    return { created: true, apiAsset: response.body }
  }
  catch (e) {
    if (e.response.statusCode === 400 && e.response.body.message === 'Duplicate name') {
      logResponse(e.response)
      return { created: false, apiAsset: e.response.body.data }
    }
    e.component = 'api'
    throw (e)
  }
}

export async function patchAsset (assetId, body) {
  try {
    await getToken()
    const response = await got.patch(`${options.api}/assets/${assetId}?projection=stigs`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      },
      json: body,
      responseType: 'json'
    })
    logResponse(response)
    return response.body
  }
  catch (e) {
    e.component = 'api'
    throw (e)
  }
}

export async function postReviews (collectionId, assetId, reviews) {
  try {
    await getToken()
    const response = await got.post(`${options.api}/collections/${collectionId}/reviews/${assetId}`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      },
      json: reviews,
      responseType: 'json'
    })
    logResponse(response)
    return response.body
  }
  catch (e) {
    e.component = 'api'
    throw (e)
  }
}

export async function getUser () {
  cache.user = await apiGet('/user')
  return cache.user
}

export function canUserAccept () {
  const curUser = cache.user
  const apiCollection = cache.collection
  const userGrant = curUser.collectionGrants.find( i => i.collection.collectionId === apiCollection.collectionId )?.accessLevel
  const allowAccept = apiCollection.settings.status.canAccept && (userGrant >= apiCollection.settings.status.minAcceptGrant)
  return allowAccept
}

function logResponse (response) {
  logger.http({
    component: 'api',
    message: 'query',
    request: {
      method: response.request.options?.method,
      url: response.request.requestUrl
    } ,
    response: {
      status: response.statusCode
    }
  })
  logger.debug({
    component: 'api',
    message: 'query bodies',
    request: {
      method: response.request.options?.method,
      url: response.request.requestUrl,
      body: getSymbol(response.request, 'body')
    },
    response: {
      status: response.statusCode,
      body: response.body
    }
  })
}

function logError (e) {
  logger.error({
    component: 'api',
    message: 'query error',
    request: {
      method: e.request?.options?.method,
      url: e.request?.requestUrl
    } ,
    response: {
      status: e.response?.statusCode,
      body: e.response?.body
    }
  })
}


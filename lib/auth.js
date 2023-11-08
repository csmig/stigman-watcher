const { logger } = require('./logger')
const got = require('got')
const atob = require('atob')
const config = require('./args')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { log } = require('console')

let self = this

self.url = null
self.threshold = 10
self.scope =
  'openid stig-manager:collection stig-manager:stig:read stig-manager:user:read'
self.key = config.clientKey
self.authenticateFn = config.clientKey ? authenticateSignedJwt : authenticateClientSecret
self.authentication = config.clientKey ? 'signed-jwt' : 'client-secret'

/**
 * Fetches OpenID configuration from the specified authority URL.
 * @async
 * @function getOpenIDConfiguration
 * @returns {Promise<Object>} - Promise object representing the OpenID configuration response.
 * @throws {Error} - If there's an error fetching the OpenID configuration.
 */
async function getOpenIDConfiguration () {
  try {
    const wellKnownUrl = `${config.authority}/.well-known/openid-configuration`
    logger.http({
      component: 'auth',
      message: `openId config request`,
      request: {
        method: 'GET',
        url: wellKnownUrl
      }
    })

    const response = await got.get(wellKnownUrl, { responseType: 'json' })
    logger.http({ 
      component: 'auth',
      message: 'openId configuration response',
      response: response.body
    })
    self.url = response.body.token_endpoint
    return response.body
  }
  catch (e) {
    if (e.response) {
      logResponse(e.response)
    } 
    else {
      logError(e)
    }
    throw e
  }
}

/**
 * Retrieves an access token for authentication.
 * @async
 * @function getToken
 * @returns {Promise<Object>} The decoded access token.
 * @throws {Error} If there was an error retrieving the token.
 */
async function getToken () {
  try {
    if (self.tokenDecoded) {
      let expiresIn =
        self.tokenDecoded.exp - Math.ceil(new Date().getTime() / 1000)
      expiresIn -= self.threshold
      if (expiresIn > self.threshold) {
        return self.tokenDecoded
      }
    }
    logger.http({
      component: 'auth',
      message: `token request`,
      request: {
        clientId: config.clientId,
        authentication: self.authentication,
        method: 'POST',
        url: self.url
      }
    })

    self.tokens = await self.authenticateFn()
    self.tokenDecoded = decodeToken(self.tokens.access_token)

    logger.http({
      component: 'auth',
      message: `token response`,
      payload: self.tokenDecoded
    })

    return self.tokenDecoded
  } 
  catch (e) {
    if (e.response) {
      logResponse(e.response)
    } 
    else {
      logError(e)
    }
    throw e
  }
}

/**
 * Authenticates client secret and returns the response body.
 * @async
 * @function authenticateClientSecret
 * @throws {Error} If there is an error authenticating client secret token.
 * @returns {Promise<Object>} The response body.
 */
async function authenticateClientSecret () {
  try {
    logger.http({
      component: 'auth',
      message: 'Sending client secret authentication request',
      request: {
        clientId: config.clientId,
        authentication: self.authentication,
        method: 'POST',
        url: self.url
      }
    })

    const response = await got.post(self.url, {
      form: {
        grant_type: 'client_credentials'
      },
      username: config.clientId,
      password: config.clientSecret,
      scope: self.scope,
      responseType: 'json'
    })
    logResponse(response)
    return response.body
  } catch (e) {
    if (e.response) {
      logResponse(e.response)
    } else {
      logError(e)
    }
    throw e
  }
}

/**
 * Authenticates a signed JWT using the RFC 7523 standard.
 * @async
 * @function authenticateSignedJwt
 * @returns {Promise<Object>} The response body from the authentication request.
 * @throws {Error} If there was an error authenticating the signed token.
 */
async function authenticateSignedJwt () {
  // IAW RFC 7523
  let response
  try {
    const jti = crypto.randomBytes(16).toString('hex')
    const payload = {
      aud: config.authority,
      iss: config.clientId,
      sub: config.clientId,
      jti: jti
    }

    let signedJwt = jwt.sign(payload, self.key, {
      algorithm: 'RS256',
      expiresIn: 60
    })

    logger.http({
      message: 'Sending signed JWT authentication request',
      jti: jti,
      request: {
        clientId: config.clientId,
        authentication: self.authentication,
        method: 'POST',
        url: self.url
      }
    })

    response = await got.post(self.url, {
      form: {
        grant_type: 'client_credentials',
        client_assertion_type:
          'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: signedJwt,
        scope: self.scope
      },
      responseType: 'json'
    })
    logResponse(response)
    return response.body
  } catch (e) {
    if (e.response) {
      logResponse(e.response)
    } else {
      logError(e)
    }
    throw e
  }
}

/**
 * Decodes a JWT token and returns the payload object.
 * @param {string} str - The JWT token string.
 * @returns {object} - The decoded payload object.
 * @throws {string} - Throws an error if the token is invalid.
 */
function decodeToken (str) {
  str = str.split('.')[1]
  str = str.replace(/-/g, '+')
  str = str.replace(/_/g, '/')
  switch (str.length % 4) {
    case 0:
      break
    case 2:
      str += '=='
      break
    case 3:
      str += '='
      break
    default:
      throw 'Invalid token'
  }
  str = decodeURIComponent(escape(atob(str)))
  str = JSON.parse(str)
  return str
}

/**
 * Logs the token response with http level.
 * @param {Object} response - The token response object.
 * @param {Object} response.request - The request object.
 * @param {string} response.request.method - The request method.
 * @param {string} response.request.requestUrl - The request URL.
 * @param {Object} response.request.options - The request options object.
 * @param {Object} response.request.options.form - The request form object.
 * @param {Object} response.response - The response object.
 * @param {number} response.response.status - The response status code.
 * @param {Object} response.response.body - The response body object.
 */
function logResponse (response) {
  logger.http({
    component: 'auth',
    message: 'token response',
    request: {
      method: response.request.options?.method,
      url: response.request.requestUrl,
      form: response.request.options?.form
    },
    response: {
      status: response.statusCode,
      body: response.body
    }
  })
}
function logError (e) {
  const errorObj = {
    component: e.component || 'auth',
    message: e.message
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

module.exports.getToken = getToken
module.exports.getOpenIDConfiguration = getOpenIDConfiguration


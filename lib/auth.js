import { logger } from './logger.js'
import got from 'got'
import atob from 'atob'
import {options} from './args.js'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'

const self = {}

self.url = null
self.threshold = 10
self.scope = 'openid stig-manager:collection stig-manager:stig:read stig-manager:user:read'
self.key = options.clientKey
self.authenticateFn = options.clientKey ? authenticateSignedJwt : authenticateClientSecret
self.authentication = options.clientKey ? 'signed-jwt' : 'client-secret'

let tokens, tokenDecoded
/**
 * Fetches OpenID configuration from the specified authority URL.
 * @async
 * @function getOpenIDConfiguration
 * @returns {Promise<Object>} - Promise object representing the OpenID configuration response.
 * @throws {Error} - If there's an error fetching the OpenID configuration.
 */
async function getOpenIDConfiguration () {
  try {
    const wellKnownUrl = `${options.authority}/.well-known/openid-configuration`
    logger.debug({
      component: 'auth',
      message: `sending openId configuration request`,
      request: {
        method: 'GET',
        url: wellKnownUrl
      }
    })
    const response = await got.get(wellKnownUrl, { responseType: 'json' })
    logResponse(response) 
    self.url = response.body.token_endpoint
    return response.body
  }
  catch (e) {
    if (e.response) {
      logResponse(e.response)
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
    if (tokenDecoded) {
      let expiresIn =
        tokenDecoded.exp - Math.ceil(new Date().getTime() / 1000)
      expiresIn -= self.threshold
      if (expiresIn > self.threshold) {
        return tokenDecoded
      }
    }
    // getting new token
    tokens = await self.authenticateFn()
    tokenDecoded = decodeToken(tokens.access_token)
    logger.debug({
      component: 'auth',
      message: `received token response`,
      tokens: tokens,
      tokenDecoded: tokenDecoded
    })
    return tokenDecoded
  }
  catch (e) {
    if (e.response) {
      logResponse(e.response)
    }
    throw e
  }
}

/**
 * Authenticates service acount using a client secret and returns new access token
 * @async
 * @function authenticateClientSecret
 * @throws {Error} If there is an error authenticating client secret token.
 * @returns {Promise<Object>} The response from auth provider.
 */
async function authenticateClientSecret () {
  const parameters = {
    form: {
      grant_type: 'client_credentials'
    },
    username: options.clientId,
    password: options.clientSecret,
    scope: self.scope,
    responseType: 'json'
  }

  logger.debug({
    component: 'auth',
    message: 'sending client secret authentication request',
    request: {
      method: 'POST',
      url: self.url,
      parameters
    }
  })

  const response = await got.post(self.url, parameters)
  logResponse(response)
  return response.body
}

/**
 * Authenticates using a signed JWT using the RFC 7523 standard and returns an access token.
 * @async
 * @function authenticateSignedJwt
 * @returns {Promise<Object>} The response body from the authentication request with token.
 * @throws {Error} If there was an error authenticating the signed token.
 */
async function authenticateSignedJwt () {
  // IAW RFC 7523
    const jti = randomBytes(16).toString('hex')
    const payload = {
      aud: options.authority,
      iss: options.clientId,
      sub: options.clientId,
      jti: jti
    }
    logger.debug({
      message: 'set jwt payload',
      payload
    })
    const signedJwt = jwt.sign(payload, self.key, {
      algorithm: 'RS256',
      expiresIn: 60
    })
    logger.debug({
      message: 'created signed jwt',
      signedJwt
    })

    const parameters = {
      form: {
        grant_type: 'client_credentials',
        client_assertion_type:
          'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: signedJwt,
        scope: self.scope
      },
      responseType: 'json'
    }
    logger.debug({
      message: 'sending signed JWT authentication request',
      jti: jti,
      request: {
        method: 'POST',
        url: self.url,
        parameters
      }
    })

    const response = await got.post(self.url, parameters)
    logResponse(response)
    return response.body
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
      throw new Error('Invalid token')
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
    message: 'http response',
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

export { getToken, getOpenIDConfiguration, tokens }

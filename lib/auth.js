const {logger}  = require('./logger')
const got = require('got')
const atob = require('atob')
const config = require('./args')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')

let self = this

self.threshold = 10
self.scope = 'openid stig-manager:collection stig-manager:stig:read stig-manager:user:read'
self.key = config.clientKey
self.authenticateFn = config.deviceAuthorization ? authenticateDeviceAuthorization : config.clientKey ? authenticateSignedJwt : authenticateClientSecret
self.authentication = config.deviceAuthorization ? 'device-authorization' : config.clientKey ? 'signed-jwt' : 'client-secret'

async function getOpenIdConfiguration () {
  try {
    const url = `${config.authority}/.well-known/openid-configuration`
    const response = await got.get( url, {
      responseType: 'json'
    })
    logResponse(response)
    self.openIdConfiguration = response.body
    return response.body  
  }
  catch (e) {
    logResponse(e.response)
    throw(e)
  }
}

async function getToken() {
  try {
    if (self.tokenDecoded) {
      let expiresIn = self.tokenDecoded.exp - Math.ceil(new Date().getTime() / 1000)
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
    e.component = 'auth'
    throw (e)
  }
}

async function authenticateClientSecret () {
  try {
    const response = await got.post( self.openIdConfiguration.token_endpoint, {
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
  }
  catch (e) {
    logResponse(e.response)
    throw(e)
  }
}

async function authenticateSignedJwt () {
  // IAW RFC 7523
  let response
  try {
    const jti = crypto.randomBytes(16).toString('hex')
    const payload = {
        "aud": config.authority,
        "iss": config.clientId,
        "sub": config.clientId,
        "jti": jti
    }
    let signedJwt = jwt.sign(payload, self.key, {
        algorithm: 'RS256',
        expiresIn: 60,
    })

    response = await got.post( self.openIdConfiguration.token_endpoint, {
      form: {
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: signedJwt,
        scope: self.scope
      },
      responseType: 'json'
    })
    logResponse(response)
    return response.body
  }
  catch (e) {
    logResponse(e.response)
    throw(e)
  }

}

async function authenticateDeviceAuthorization() {
  try {
    const response = await got.post(self.openIdConfiguration.device_authorization_endpoint, {
      form: {
        client_id: config.clientId,
        scope: self.scope
      },
      responseType: 'json'
    })
    logResponse(response)


    const verificationUrl = response.body.verification_uri_complete || response.body.verification_uri
    logger.info({
      component: 'auth',
      message: 'browser interaction required',
      verificationUrl,
      user_code: response.body.user_code
    })

    // const prompt = require('prompt-sync')({ sigint:true })
    // const open = require('open')

    // prompt(`Navigate to ${verificationUrl} and enter code ${response.body.user_code} within ${response.body.expires_in} seconds. Press any key to attempt to open your browser.`)
    // open(verificationUrl)

    const fetchToken = () => getTokenFromDeviceCode(response.body.device_code)
    const validate = result => !!result.access_token
    const tokens = await poll(fetchToken, validate, response.body.interval * 1000)
    return tokens
  }
  catch (e) {
    logResponse(e.response)
    throw(e)
  }
}

async function getTokenFromDeviceCode(device_code) {
  try {
    const response = await got.post(self.openIdConfiguration.token_endpoint, {
      form: {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: config.clientId,
        device_code
      }
    }).json()
    return response
  }
  catch (e) {
    return {}
  }
}

function wait (ms = 1000) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function poll (fn, fnCondition, ms) {
  let result = await fn()
  while (!fnCondition(result)) {
    await wait(ms)
    result = await fn()
  }
  return result
}

function decodeToken(str) {
  str = str.split('.')[1]
  str = str.replace(/-/g, '+')
  str = str.replace(/_/g, '/')
  switch (str.length % 4) {
      case 0:
          break;
      case 2:
          str += '=='
          break;
      case 3:
          str += '='
          break;
      default:
          throw 'Invalid token'
  }
  str = decodeURIComponent(escape(atob(str)))
  str = JSON.parse(str)
  return str
}

function logResponse (response) {
  logger.debug({
    component: 'auth',
    message: 'token response',
    request: {
      method: response.request.options?.method,
      url: response.request.requestUrl,
      form: response.request.options?.form
    } ,
    response: {
      status: response.statusCode,
      body: response.body
    }
  })    
}

module.exports.getToken = getToken
module.exports.getOpenIdConfiguration = getOpenIdConfiguration

export const ERR_APIOFFLINE = 1
export const ERR_AUTHOFFLINE = 2
export const ERR_NOTOKEN = 3
export const ERR_NOGRANT = 4
export const ERR_UNKNOWN = 5
export const ERR_FAILINIT = 6

export const MIN_API_VERSION = '1.2.7'

// Minimum and maximum values for Watcher configuration
export const configBounds = {
  scanInterval: {
    min: 6000, // 6 seconds - Should be greater than WATCHER_CARGO_DELAY
    max: 24 * 60 * 60000 // 24 hours
  },
  cargoDelay: {
    min: 2000, // 2 seconds
    max: 30000 // 30 seconds
  },
  cargoSize: {
    min: 1,
    max: 100
  },
  historyWriteInterval: {
    min: 10000, // 10 seconds
    max: 60000 // 60 seconds
  },
  responseTimeout: {
    min: 5000, // 5 seconds
    max: 60000 // 60 seconds
  },  
  stabilityThreshold: {
    min: 0,
    max: 10000 // 10 seconds
  } 
}

export const scanBoundsKeys = new Set(["scanInterval", "historyWriteInterval"])
export const eventBoundsKeys = new Set(["stabilityThreshold"])


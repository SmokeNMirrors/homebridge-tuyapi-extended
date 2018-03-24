'use strict';

// Import packages
const debug = require('debug')('[Homebridge TuyAPI-Extended]  ');
const dgram = require('dgram');
const forge = require('node-forge');
const retryConnect = require('net-retry-connect');
const stringOccurrence = require('string-occurrence');
const log = require('log');
// Import requests for devices
const requests = require('./requests.json');
/**
* Represents a Tuya device.
* @class
* @param {Object} options - options for constructing a TuyaDevice
* @param {String} [options.type='outlet'] - type of device
* @param {String} [options.ip] - IP of device
* @param {Number} [options.port=6668] - port of device
* @param {String} options.id - ID of device
* @param {String} [options.uid=''] - UID of device
* @param {String} options.key - encryption key of device
* @param {Number} [options.version=3.1] - protocol version
* @example
* const tuya = new TuyaDevice({id: 'xxxxxxxxxxxxxxxxxxxx', key: 'xxxxxxxxxxxxxxxx'})
* @example
* const tuya = new TuyaDevice([
* {id: 'xxxxxxxxxxxxxxxxxxxx', key: 'xxxxxxxxxxxxxxxx'},
* {id: 'xxxxxxxxxxxxxxxxxxxx', key: 'xxxxxxxxxxxxxxxx'}])
*/
function TuyaExtendedDevice(that, options) {
  this.devices = [];
  this.debugging = false;
  this.debugPrefix = '';
  this.log = log;

  if (options.constructor === Array) { // If argument is [{id: '', key: ''}]
    this.devices = options;
    this.log.prefix = 'TuyAPI-Extended - ' + options['name'];
    const debug = require('debug')(this.log.prefix);

  } else if (options.constructor === Object) { // If argument is {id: '', key: ''}
    this.devices = [options];
    this.log.prefix = 'TuyAPI-Extended - ' + options.name ;
    const debug = require('debug')(this.log.prefix);

  }

  // Standardize devices array
  for (let i = 0; i < this.devices.length; i++) {
    if (this.devices[i].id === undefined) {
      throw new Error('ID is missing from device.');
    }
    if (this.devices[i].key === undefined) {
      throw new Error('Encryption key is missing from device with ID ' + this.devices[i].id + '.');
    }
    if (this.devices[i].type === undefined) {
      this.devices[i].type = 'outlet';
    }
    if (this.devices[i].name === undefined) {
      this.devices[i].name = '';
    }
    if (this.devices[i].uid === undefined) {
      this.devices[i].uid = '';
    }
    if (this.devices[i].port === undefined) {
      this.devices[i].port = 6668;
    }
    if (this.devices[i].version === undefined) {
      this.devices[i].version = 3.1;
    }

    if (this.devices[i].apiMinTimeout === undefined) {
      this.devices[i].apiMinTimeout = 100;
    }

    if (this.devices[i].apiMaxTimeout === undefined) {
      this.devices[i].apiMaxTimeout = 1000;
    }

    if (this.devices[i].apiRetries === undefined) {
      this.devices[i].apiRetries = 3;
    }

    if (this.devices[i].apiDebug === undefined) {
      this.debugging = false;
    } else {
      this.debugging = this.devices[i].apiDebug;
    }

    if (this.devices[i].apiDebugPrefix === undefined) {
       this.debugPrefix = '';
    } else {
      this.debugPrefix = this.devices[i].apiDebugPrefix;
    }

    // Create cipher from key
    this.devices[i].cipher = forge.cipher.createCipher('AES-ECB', this.devices[i].key);
  }

  // this._debugger('Device(s): ');
  // this._debugger(this.devices);

}

/**
* Resolves IDs stored in class to IPs. If you didn't pass IPs to the constructor,
* you must call this before doing anything else.
* @returns {Promise<Boolean>} - true if IPs were found and devices are ready to be used
*/
TuyaExtendedDevice.prototype.resolveIds = function () {
  // Create new listener
  return true;
  // this.listener = dgram.createSocket('udp4');
  // this.listener.bind(6666);

  // // Find devices that need an IP
  // const needIP = [];
  // for (let i = 0; i < this.devices.length; i++) {
  //   if (this.devices[i].ip === undefined) {
  //     needIP.push(this.devices[i].id);
  //   }
  // }

  // // Todo: add timeout for when IP cannot be found, then reject(with error)
  // // add IPs to devices in array and return true
  // return new Promise(resolve => {
  //   this.listener.on('message', message => {
  //     //debug('Received UDP message.');

  //     const thisId = this.extractJSON(message).gwId;

  //     if (needIP.length > 0) {
  //       if (needIP.includes(thisId)) {
  //         const deviceIndex = this.devices.findIndex(device => {
  //           if (device.id === thisId) {
  //             return true;
  //           }
  //           return false;
  //         });

  //         this.devices[deviceIndex].ip = this.extractJSON(message).ip;

  //         needIP.splice(needIP.indexOf(thisId), 1);
  //       }
  //     } else { // All devices have been resolved
  //       this.listener.close();
  //       this.listener.removeAllListeners();
  //       resolve(true);
  //     }
  //   });
  // });
};


TuyaExtendedDevice.prototype.get = function (that, options) {
  let currentDevice;
  // If no ID is provided
  if (options === undefined || options.id === undefined) {
    currentDevice = this.devices[0]; // Use first device in array
  } else { // Otherwise
    // find the device by id in this.devices
    const index = this.devices.findIndex(device => {
      if (device.id === options.id) {
        return true;
      }
      return false;
    });
    currentDevice = this.devices[index];
  }

  // Add data to command
  if ('gwId' in requests[currentDevice.type].status.command) {
    requests[currentDevice.type].status.command.gwId = currentDevice.id;
  }
  if ('devId' in requests[currentDevice.type].status.command) {
    requests[currentDevice.type].status.command.devId = currentDevice.id;
  }

  that.tuyaDebug('Payload: ');
  that.tuyaDebug(requests[currentDevice.type].status.command);

  // Create byte buffer from hex data
  const thisData = Buffer.from(JSON.stringify(requests[currentDevice.type].status.command));
  const buffer = this._constructBuffer(currentDevice.type, thisData, 'status');


  var sendPromise = new Promise((resolve, reject) => {
    that.tuyaDebug('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Sending GET request: ' + currentDevice.name);

    this._sendCB(currentDevice.ip, buffer, currentDevice).then(data => {
      // Extract returned JSON
      // that.tuyaDebug('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Extracting Data: ' + currentDevice.name);
      // that.tuyaDebug(data);

      data = this._extractJSON(that, data);

      that.tuyaDebug('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Returning GET result: ' + currentDevice.name);

      if (options !== undefined && options.schema === true) {
        resolve(data);
      } else {
        resolve(data.dps['1']);
      }
    }).catch(error => {
      that.tuyaDebug('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Error GET result: ' + currentDevice.name);
      reject(error);
    });
  });

  return sendPromise;
};


/**
* Sets a property on a device using dps as an object instead of the previuos method.
* @param {Object} options - options for setting properties
* @param {String} [options.id] - ID of device
* @param {Boolean} options.set - `true` for on, `false` for off
* @param {Number} [options.dps] - dps index to change
* @example
* // set default property on default device
* tuya.set({set: true}).then(() => console.log('device was changed'))
* @example
* // set custom property on non-default device
* tuya.set({id: 'xxxxxxxxxxxxxxxxxxxx', 'dps': 2, set: true}).then(() => console.log('device was changed'))
* @returns {Promise<Boolean>} - returns `true` if the command succeeded
*/
TuyaExtendedDevice.prototype.set = function (that, options) {
  let currentDevice;

  // If no ID is provided
  if (options === undefined || options.id === undefined) {
    currentDevice = this.devices[0]; // Use first device in array
  } else { // Otherwise
    // find the device by id in this.devices
    const index = this.devices.findIndex(device => {
      if (device.id === options.id) {
        return true;
      }
      return false;
    });
    currentDevice = this.devices[index];
  }

  const thisRequest = requests[currentDevice.type].set.command;

  // Add data to command
  const now = new Date();
  if ('gwId' in thisRequest) {
    thisRequest.gwId = currentDevice.id;
  }
  if ('devId' in thisRequest) {
    thisRequest.devId = currentDevice.id;
  }
  if ('uid' in thisRequest) {
    thisRequest.uid = currentDevice.uid;
  }
  if ('t' in thisRequest) {
    thisRequest.t = (parseInt(now.getTime() / 1000, 10)).toString();
  }

  if (options.dps === undefined) {
    thisRequest.dps = {1: options.set};
  } else {
    thisRequest.dps = options.dps || {};
    //debug(thisRequest.dps);
    that.tuyaDebug('DPS Values: ' + JSON.stringify(thisRequest.dps));
  }

  // Encrypt data
  currentDevice.cipher.start({iv: ''});
  currentDevice.cipher.update(forge.util.createBuffer(JSON.stringify(thisRequest), 'utf8'));
  currentDevice.cipher.finish();

  // Encode binary data to Base64
  const data = forge.util.encode64(currentDevice.cipher.output.data);

  // Create MD5 signature
  const preMd5String = 'data=' + data + '||lpv=' + currentDevice.version + '||' + currentDevice.key;
  const md5hash = forge.md.md5.create().update(preMd5String).digest().toHex();
  const md5 = md5hash.toString().toLowerCase().substr(8, 16);

  // Create byte buffer from hex data
  const thisData = Buffer.from(currentDevice.version + md5 + data);
  const buffer = this._constructBuffer(currentDevice.type, thisData, 'set');


// Send request to change status
  var sendPromise = new Promise((resolve, reject) => {
    that.tuyaDebug('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Sending request: ' + currentDevice.name);
    this._sendCB(currentDevice.ip, buffer, currentDevice).then(() => {
      that.tuyaDebug('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Returning result: ' + currentDevice.name);
      resolve(true);
    }).catch(err => {
      that.tuyaDebug('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Error result: ' + currentDevice.name);
      reject(err);
    });
  });

  return sendPromise;
};

TuyaExtendedDevice.prototype._sendCB = function (ip, buffer, currentDevice) {
  // debug('Sending this data: ', buffer.toString('hex'));
  if(currentDevice.apiDebug) {
    // that.tuyaDebug('sendCB Host: ' + ip);
    // that.tuyaDebug('Port: 6668');
    // that.tuyaDebug('Debug Log: ' + currentDevice.apiDebug);
    // that.tuyaDebug('apiMinTimeout: ' + currentDevice.apiMinTimeout);
    // that.tuyaDebug('apiMaxTimeout: ' + currentDevice.apiMaxTimeout);
    // that.tuyaDebug('apiRetries: ' + currentDevice.apiRetries);
  }

  return new Promise((resolve, reject) => {
   // that.tuyaDebug('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Connecting: ' + currentDevice.name);
    retryConnect.to({port: 6668, host: ip, retryOptions: {forever: false, maxRetryTime: currentDevice.apiMaxTimeout, retries: currentDevice.apiRetries, minTimeout: currentDevice.apiMinTimeout, maxTimeout: currentDevice.apiMaxTimeout}}, (error, client) => {
      if (error) {
        return reject(error);
      }

      if(!buffer) {
          reject(new Error('No Buffer'));
      } else {
        client.write(buffer);
        client.on('data', data => {
          client.destroy();
          //that.tuyaDebug('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! RECEIVED SET DATA: ' + currentDevice.name);
          resolve(data);
        });
        client.on('error', error => {
          // that.tuyaDebug('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Error on SET request: ' + currentDevice.name);
          error.message = 'Error communicating with device. Make sure nothing else is trying to control it or connected to it.';
          reject(error);
        });
      }
    });
  });
};

/**
* Constructs a protocol-complient buffer given device type, data, and command.
* @private
* @param {String} type - type of device
* @param {String} data - data to put in buffer
* @param {String} command - command (status || set)
* @returns {Buffer} buffer - buffer of data
*/
TuyaExtendedDevice.prototype._constructBuffer = function (type, data, command) {
  // Construct prefix of packet according to protocol
  const prefixLength = (data.toString('hex').length + requests[type].suffix.length) / 2;
  const prefix = requests[type].prefix + requests[type][command].hexByte + '000000' + prefixLength.toString(16);

  // Create final buffer: prefix + data + suffix
  return Buffer.from(prefix + data.toString('hex') + requests[type].suffix, 'hex');
};

/**
* Extracts JSON from a raw buffer and returns it as an object.
* @private
* @param {Buffer} data - buffer of data
* @returns {Object} extracted object
*/
TuyaExtendedDevice.prototype._extractJSON = function (that, data) {
  //debug('Parsing this data to JSON: ', data.toString('hex'));

  data = data.toString();

  // Find the # of occurrences of '{' and make that # match with the # of occurrences of '}'
  const leftBrackets = stringOccurrence(data, '{');
  let occurrences = 0;
  let currentIndex = 0;

  while (occurrences < leftBrackets) {
    const index = data.indexOf('}', currentIndex + 1);
    if (index !== -1) {
      currentIndex = index;
      occurrences++;
    }
  }

  data = data.slice(data.indexOf('{'), currentIndex + 1);
  data = JSON.parse(data);
  return data;
};


TuyaExtendedDevice.prototype._debugger = function(args) {
  if(this.debugging === true) {
    debug(this.debugPrefix, args);
  }
};

module.exports = TuyaExtendedDevice;

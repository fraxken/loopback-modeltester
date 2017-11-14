'use strict';

// Require Node.JS package
const assert = require('assert');
const { createReadStream } = require('fs');
const { basename } = require('path');

// Require NPM Packages
const request = require('request-promise');
const { eachSeries } = require('async');
const { has, get } = require('lodash');
const is = require('@sindresorhus/is');
const mime = require('mime-types');
const chalk = require('chalk');

function loopbackModelTester(app, config) {
  if ('undefined' === typeof(app)) {
    throw new TypeError('App cannot be undefined!');
  }
  if ('undefined' === typeof(config)) {
    throw new TypeError('Config cannot be undefined');
  }
  if (config instanceof Array === false) {
    throw new TypeError('Config should be an array!');
  }

  app.on('started', async function() {
    const baseUrl = app.get('url').replace(/\/$/, '');
    let testIndex = 0;
    let context = {};
    eachSeries(config, function(route, done) {
      route.url.replace(/\${([a-zA-Z0-9.]+)}/g, function(match, matchValue, offset, str) {
        if (context.hasOwnProperty(matchValue) === false) {
          return;
        }
        route.url = route.url.replace(new RegExp('\\' + match, 'g'), context[matchValue]);
      });
      const reqOption = {
        method: route.method || 'GET',
        url: `${baseUrl}/api${typeof(route.model) === 'string' ? '/' + route.model : ''}/${route.url}`,
        formData: route.formData || void 0,
        body: route.body || void 0,
        headers: route.headers || void 0,
        qs: route.qs || void 0,
        resolveWithFullResponse: true,
        json: true
      };
      const { expect = {}, file, variables } = route;
      if ('undefined' === typeof(expect.statusCode)) {
        expect['statusCode'] = 200;
      }

      // Upload a file!
      uploadFile: if ('object' === typeof(file)) {
        if ('undefined' === typeof(file.path)) break uploadFile;
        let formName = file.form_name;
        if ('undefined' === typeof(formName)) {
          formName = 'file';
        }
        try {
          const name = basename(file.path);
          reqOption.formData = {
            name
          };
          reqOption.formData[formName] = {
            value: createReadStream(file.path),
            options: {
              filename: name,
              contentType: mime.lookup(name)
            }
          };
        } catch (E) {
          return done(E);
        }
      }

      console.time(route.title);
      console.log(`Run test [${chalk.yellow.bold(testIndex)}] - ${chalk.green.bold(route.title) || ''}`);
      testIndex++;
      request(reqOption).then((resp) => {
        const { body, statusCode, headers } = resp;

        if (route.debug === true) {
          console.log('--> Body :');
          console.log(chalk.gray.bold(body));
          console.log('\n--> Headers :');
          console.log(chalk.gray.bold(headers));
        }

        // Check response statusCode
        assert.equal(statusCode, expect.statusCode, `Invalid response statusCode. Should be ${chalk.green.bold(expect)} but returned code ${chalk.red.bold(statusCode)}`);

        // Check return Type
        if ('string' === typeof(expect.bodyType)) {
          const isType = is(body);
          assert.equal(isType, expect.bodyType, `Invalid type for the returned response body. Should be ${chalk.green.bold(expect.bodyType)} but detected as ${chalk.red.bold(isType)}`);

          // Check properties keys if the returned type is an Object!
          if (isType === 'Object' && 'object' === typeof(expect.properties)) {
            Object.keys(expect.properties).forEach((key) => {
              const propertyType = expect.properties[key].toLowerCase();
              if (!has(body, key)) {
                throw new Error(`Missing body response key ${key}`);
              }
              if (propertyType === 'any') return;
              const bodyType = typeof(get(body, key));
              if (bodyType !== propertyType) {
                throw new TypeError(`Property ${chalk.yellow.bold(key)} should be a ${chalk.green.bold(propertyType)} but the returned property was ${chalk.red.bold(bodyType)}`);
              }
            });
          }
        }
        
        // Check header value!
        if ('object' === typeof(expect.headers)) {
          Object.keys(expect.headers).forEach((headerKey) => {
            headerKey = headerKey.toLowerCase();
            if (headers.hasOwnProperty(headerKey) === false) {
              throw new Error(`Key ${chalk.yellow.bold(headerKey)} is not present in the response headers!`);
            }
            assert.equal(
              headers[headerKey].includes(expect.headers[headerKey]), 
              true, 
              `Invalid headers value for the key ${chalk.bold.yellow(headerKey)}. Should be (or contains) ${chalk.bold.green(expect.headers[headerKey])} but was ${chalk.bold.red(headers[headerKey])}}`
            );
          });
        }

        if ('object' === typeof(variables)) {
          Object.keys(variables).forEach((varName) => {
            const varOptions = variables[varName];
            if (has(body, varName)) {
              context[varOptions.name || varName] = get(body, varName);
            } else {
              if (varOptions.required === true) {
                throw new Error(`Variable ${chalk.bold.yellow(varName)} is missing from the response body. Cannot be applied to the test Context!`);
              }
            }
          });
        }

        console.timeEnd(route.title);
        done(null);
        return null;
      }).catch(done);
    }, (err) => {
      if (err) {
        console.error(`statusCode: ${chalk.bold.yellow(err.statusCode)}`);
        console.error(`message: ${chalk.bold.red(err.message)}`);
        process.exit(1);
      }
      process.exit(0);
    });
  });
  app.start();
}

// Export loopback3RoutesTester handler
module.exports = loopbackModelTester;

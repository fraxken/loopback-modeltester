"use strict";

// Require Node.JS package
const assert = require("assert");
const { createReadStream } = require("fs");
const { basename } = require("path");

// Require npm Packages
const request = require("request-promise");
const { has, get, cloneDeep } = require("lodash");
const is = require("@sindresorhus/is");
const mime = require("mime-types");
const chalk = require("chalk");

// Assign Chalk color shortHand!
const {
	yellow: warn,
	green: ok,
	blue: info,
	red: error
} = chalk.bold;

// Variable REGEXP
const variableRegexp = /\${([a-zA-Z0-9._-]+)}/g;

/**
 * @class loopbackTest
 * @classdesc Run unit tests
 *
 * @property {any} app
 * @property {Object} headers
 * @property {any[]} tests
 * @property {String} basePath
 * @property {Object} context
 */
class loopbackTest {

	/**
	 * @constructor
	 * @param {*} app Loopback server application
	 * @param {String} basePath API BasePath
	 *
	 * @throws {TypeError}
	 */
	constructor(app, basePath = "api") {
		if (is.nullOrUndefined(app)) {
			throw new TypeError("App argument cannot be undefined!");
		}
		this.app = app;
		this.headers = {};
		this.context = {};
		this.tests = [];
		this.basePath = basePath;

		this.app.on('started', this.run.bind(this));
		this.app.start();
	}

	/**
	 * @private
	 * @method _getContextVariable
	 * @desc Get variable in Regexp (shorthand private method)
	 * @param {*} match match
	 * @param {*} matchValue matchedValue
	 * @returns {void|String} Context variable!
	 */
	_getContextVariable(match, matchValue) {
		if (!Reflect.has(this.context, matchValue)) {
			return;
		}
		return Reflect.get(this.context, matchValue);
	}

	/**
	 * @public
	 * @async
	 * @method run
	 * @memberof loopbackTest#
	 * @returns {void}
	 */
	async run() {
		const baseUrl = this.app.get("url").replace(/\/$/, "");
		const context = {};
		let testIndex = 0;

		for(const test of this.tests) {
			console.time(test.title);
			console.log("------------------------------------------------");
			console.log(`\nRun test [${warn(testIndex)}] - ${warn(test.title) || ""}`);
			testIndex++;
			if (test.skip) {
				console.log(info("Test skipped..."));
				continue;
			}

			const { expect = {}, file, debug = false, variables } = test;
			if (is.nullOrUndefined(expect.statusCode)) {
				Reflect.set(expect, "statusCode", 200);
			}
			test.url = test.url.replace(variableRegexp, this._getContextVariable.bind(this));

			// Hydrate context for headers keys!
			if (is(test.headers) === 'Object') {
				Object.keys(test.headers).forEach(key => {
					if (is(test.headers[key]) !== "string") {
						return;
					}
					test.headers[key].replace(variableRegexp, function match(match, matchValue) {
						if (!Reflect.has(context, matchValue)) {
							return;
						}
						test.headers[key] = test.headers[key].replace(new RegExp(`\\${match}`, "g"), Reflect.get(context, matchValue));
					});
				});
			}

			const reqOptions = {
				method: test.method || "GET",
				url: `${baseUrl}/${this.basePath}${is(test.model) === "string" ? `/${test.model}` : ""}/${test.url}`,
				formData: test.formData,
				body: test.body,
				headers: test.headers,
				qs: test.qs,
				resolveWithFullResponse: true,
				json: true
			};

			// Upload a file!
			uploadFile: if (is(file) === "Object") {
				if (is.nullOrUndefined(file.path)) {
					break uploadFile;
				}
				const formName = is.nullOrUndefined(file.form_name) ? "file" : file.form_name;
				const name = basename(file.path);
				reqOptions.formData = { name };
				reqOptions.formData[formName] = {
					value: createReadStream(file.path),
					options: {
						filename: name,
						contentType: mime.lookup(name)
					}
				};
			}

			// Debug the request options !
			if (debug) {
				console.log(chalk.magenta.bold("[DEBUG ON]"));
				console.log("--> Request options :");
				console.log(
					chalk.gray.bold(JSON.stringify(reqOptions, null, 2))
				);
			}

			// Make the request !
			const resp = await request(reqOptions)
			const { body, statusCode, headers } = resp;

			// Debug body and headers from response!
			if (debug) {
				console.log("--> Body :");
				console.log(
					chalk.gray.bold(JSON.stringify(body, null, 2))
				);
				console.log("\n--> Headers :");
				console.log(
					chalk.gray.bold(JSON.stringify(headers, null, 2))
				);
			}

			// Check expected response statusCode
			assert.equal(statusCode, expect.statusCode,
				`Invalid response statusCode. Should be ${ok(expect)} but returned code ${error(statusCode)}`
			);
			console.log(`    statusCode = ${ok(expect.statusCode)}`);

			/**
			 * Check expected bodyType returned by the Request !
			 */
			if (is(expect.bodyType) === "string") {
				const isType 	= is(body).toLowerCase();
				expect.bodyType = expect.bodyType.toLowerCase();

				assert.equal(isType, expect.bodyType,
					`Invalid type for the returned response body. Should be ${ok(expect.bodyType)} but detected as ${error(isType)}`
				);
				console.log(`    bodyType = ${ok(expect.bodyType)}`);

				// Check properties keys if the returned type is an Object!
				if (isType === "object" && is(expect.properties) === "Object") {
					console.log(
						chalk.bold.cyan("    -> Body properties =")
					);
					Object.keys(expect.properties).forEach((key) => {
						const propertyType = Reflect.get(expect.properties, key).toLowerCase();
						if (!has(body, key)) {
							throw new Error(`Missing body response key ${key}`);
						}
						if (propertyType === "any") {
							return;
						}
						const bodyType = is(get(body, key)).toLowerCase();
						if (bodyType !== propertyType) {
							throw new TypeError(
								`Property ${info(key)} should be ${ok(propertyType)} but the returned property was ${warn(bodyType)}`
							);
						}
						console.log(`        Key: ${warn(key)} = ${ok(propertyType)}`);
					});
				}
			}

			/**
			 * Check expected headers!
			 */
			if (is(expect.headers) === "Object") {
				console.log(
					chalk.cyan.bold("    -> Header properties :")
				);
				Object.keys(expect.headers).forEach(headerKey => {
					headerKey = headerKey.toLowerCase();
					if (
						headers.hasOwnProperty(headerKey) === false
					) {
						throw new Error(
							`Key ${ok(headerKey)} is not present in the response headers!`
						);
					}
					assert.equal(
						headers[headerKey].includes(
							expect.headers[headerKey]
						),
						true,
						`Invalid headers value for the key ${chalk.bold.blue(
							headerKey
						)}. Should be (or contains) ${chalk.bold.green(
							expect.headers[headerKey]
						)} but was ${chalk.bold.red(
							headers[headerKey]
						)}}`
					);
					console.log(
						`        Key: ${warn(
							headerKey
						)} = ${chalk.bold.green(
							expect.headers[headerKey]
						)}`
					);
				});
			}

			/**
			 * Check expected variables !
			 */
			if (is(variables) === "Object") {
				Object.keys(variables).forEach(varName => {
					const varOptions = variables[varName];
					if (has(body, varName)) {
						const registerVar = is(varOptions.register) === "boolean" ? varOptions.register : true;
						const varValue = get(body, varName);
						if (registerVar) {
							const finalVarName = varOptions.name || varName;
							context[finalVarName] = varValue;
							console.log(
								`Assign new variable ${info(finalVarName)} with value ${warn(varValue)} into the context!`
							);
						}
						if (!is.nullOrUndefined(varOptions.value)) {
							if (varValue !== varOptions.value) {
								throw new Error(`Variable ${ok(varName)} value should be ${info(varOptions.value)} but was detected as ${chalk.red.bold(varValue)}`);
							}
						}
					}
					else if(varOptions.required === true) {
						throw new Error(`Variable ${ok(varName)} is missing from the response body. Cannot be applied to the test Context!`);
					}
				});
			}

			console.timeEnd(test.title);
		}
		console.log(`\n\n${ok("All tests successfully passed!")}`);

	}

	/**
	 * @public
	 * @method defaultHeaders
	 * @desc Add default header for each tests!
	 * @memberof loopbackTest#
	 * @param {!Object} headers headers Object!
	 * @returns {void}
	 *
	 * @throws {TypeError}
	 */
	defaultHeaders(headers) {
		if (is(headers) !== 'Object') {
			throw new TypeError("headers argument have to be typeof Object");
		}
		Object.assign(this.headers, cloneDeep(headers));
	}

	/**
	 * @public
	 * @method run
	 * @memberof loopbackTest#
	 * @param {!Object} test Test payload to load on the application!
	 * @returns {this} Return self
	 */
	load(test) {
		if (is.nullOrUndefined(test)) {
			throw new TypeError("test argument cant be undefined");
		}
		Object.assign(test, cloneDeep(this.headers));
		this.tests.push(test);
		return this;
	}

}

// Export loopbackModelTester handler
module.exports = loopbackTest;

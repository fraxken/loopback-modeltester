"use strict";

// Require Node.JS package
const assert = require("assert");
const { createReadStream } = require("fs");
const { basename } = require("path");
const events = require('events');

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

const IDefaultRequest = {
	method: "GET",
	resolveWithFullResponse: true,
	json: true
};

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
class loopbackTest extends events {

	/**
	 * @constructor
	 * @param {*} app Loopback server application
	 * @param {String} basePath API BasePath
	 *
	 * @throws {TypeError}
	 */
	constructor(app, basePath = "api") {
		super();
		if (is.nullOrUndefined(app)) {
			throw new TypeError("App argument cannot be undefined!");
		}
		this.app = app;
		this.headers = {};
		this.context = {};
		this.tests = [];
		this.basePath = basePath;

		this.app.on('started', async() => {
			try {
				await this.run();
			}
			catch(E) {
				this.emit('error', E.message);
				process.exit(0);
			}
		});
		process.nextTick(() => {
			this.app.start();
		});
	}

	/**
	 * @private
	 * @method _checkBodyExpectation
	 * @desc Check returned body (it should match our expectation)
	 * @memberof loopbackTest#
	 * @param {!Object} body Request body object!
	 * @param {!Object} expected Expected Object
	 * @returns {void}
	 *
	 * @throws {Error}
	 * @throws {TypeError}
	 */
	_checkBodyExpectation(body, { bodyType, properties }) {
		const isType = is(body).toLowerCase();
		bodyType = bodyType.toLowerCase();
		assert.equal(isType, bodyType,
			`Invalid type for the returned response body. Should be ${ok(bodyType)} but detected as ${error(isType)}`
		);
		console.log(`    bodyType = ${ok(bodyType)}`);

		// Check properties keys if the returned type is an Object!
		if (isType !== "Object" || is(properties) !== "Object") {
			return;
		}

		console.log(
			chalk.bold.cyan("    -> Body properties =")
		);
		for(const key of Object.keys(properties)) {
			const propertyType = Reflect.get(properties, key).toLowerCase();
			if (!has(body, key)) {
				throw new Error(`Missing body response key ${key}`);
			}
			if (propertyType === "any") {
				continue;
			}
			const bodyType = is(get(body, key)).toLowerCase();
			if (bodyType !== propertyType) {
				throw new TypeError(`Property ${info(key)} should be ${ok(propertyType)} but the returned property was ${warn(bodyType)}`);
			}
			console.log(`        Key: ${warn(key)} = ${ok(propertyType)}`);
		}
	}

	/**
	 * @private
	 * @method _checkBodyExpectation
	 * @desc Check returned body (it should match our expectation)
	 * @memberof loopbackTest#
	 * @param {!Object} headers Request headers Object
	 * @param {!Object} expected Expected Object
	 * @returns {void}
	 *
	 * @throws {Error}
	 */
	_checkHeadersExpectation(headers, expected) {
		console.log(
			chalk.cyan.bold("    -> Header properties :")
		);

		for(let headerKey of Object.keys(expected.headers)) {
			headerKey = headerKey.toLowerCase();
			if (!Reflect.has(headers, headerKey)) {
				throw new Error(`Key ${ok(headerKey)} is not present in the response headers!`);
			}
			assert.equal(
				headers[headerKey].includes(expected.headers[headerKey]),
				true,
				`Invalid headers value for the key ${info(headerKey)}. Should be (or contains) ${ok(expected.headers[headerKey])} but was ${error(headers[headerKey])}}`
			);
			console.log(`        Key: ${warn(headerKey)} = ${chalk.bold.green(expected.headers[headerKey])}`);
		}
	}

	/**
	 * @private
	 * @method _checkAndAssignVariables
	 * @desc Check and Assign body (keys/values) into the Context!
	 * @memberof loopbackTest#
	 * @param {!Object} body Request body object!
	 * @param {!Object} variables Request variables Object
	 * @returns {void}
	 *
	 * @throws {Error}
	 */
	_checkAndAssignVariables(body, variables) {
		for(const varName of Object.keys(variables)) {
			const varOptions = Reflect.get(variables, varName);
			if(varOptions.required === true) {
				throw new Error(`Variable ${ok(varName)} is missing from the response body. Cannot be applied to the test Context!`);
			}
			if (!has(body, varName)) {
				continue;
			}
			const registerVar = is(varOptions.register) === "boolean" ? varOptions.register : true;
			const varValue = get(body, varName);

			if (registerVar) {
				const finalVarName = varOptions.name || varName;
				Reflect.set(this.context, finalVarName, varValue);
				console.log(
					`Assign new variable ${info(finalVarName)} with value ${warn(varValue)} into the context!`
				);
			}
			if (!is.nullOrUndefined(varOptions.value) && varValue !== varOptions.value) {
				throw new Error(`Variable ${ok(varName)} value should be ${info(varOptions.value)} but was detected as ${chalk.red.bold(varValue)}`);
			}
		}
	}

	/**
	 * @private
	 * @method _dump
	 * @desc Dump object!
	 * @memberof loopbackTest#
	 * @param {!String} strTitle Dump title
	 * @param {!Object} payload Dump payload
	 * @returns {void}
	 */
	_dump(strTitle, payload) {
		console.log(`--> ${strTitle} :`);
		console.log(
			chalk.gray.bold(JSON.stringify(payload, null, 2))
		);
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
			test.url = test.url.replace(variableRegexp, (match, matchValue) => {
				console.log(arguments);
				if (!Reflect.has(this.context, matchValue)) {
					return;
				}
				test.url = test.url.replace(new RegExp(`\\${match}`, "g"), Reflect.get(this.context, matchValue));
			});

			// Hydrate context for headers keys!
			if (is(test.headers) === 'Object') {
				Object.keys(test.headers).forEach(key => {
					if (is(test.headers[key]) !== "string") {
						return;
					}
					test.headers[key].replace(variableRegexp, (match, matchValue) => {
						if (!Reflect.has(this.context, matchValue)) {
							return;
						}
						test.headers[key] = test.headers[key].replace(new RegExp(`\\${match}`, "g"), Reflect.get(this.context, matchValue));
					});
				});
			}

			// Define the HTTP Request!
			let reqOptions = {
				method: test.method,
				url: `${baseUrl}/${this.basePath}${is(test.model) === "string" ? `/${test.model}` : ""}/${test.url}`,
				formData: test.formData,
				body: test.body,
				headers: test.headers,
				qs: test.qs
			};
			reqOptions = Object.assign(cloneDeep(IDefaultRequest), reqOptions);

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
				this._dump("Request options", reqOptions);
				this._dump("Context", this.context);
			}

			// Make the request !
			const { body, statusCode, headers } = await request(reqOptions);

			// Debug body and headers from response!
			if (debug) {
				this._dump("Body", body);
				this._dump("Headers", headers);
			}

			// Check expected response statusCode
			assert.equal(statusCode, expect.statusCode,
				`Invalid response statusCode. Should be ${ok(expect)} but returned code ${error(statusCode)}`
			);
			console.log(`    statusCode = ${ok(expect.statusCode)}`);

			// Check expected bodyType returned by the Request !
			if (is(expect.bodyType) === "string") {
				this._checkBodyExpectation(body, expect);
			}

			// Check expected headers!
			if (is(expect.headers) === "Object") {
				this._checkHeadersExpectation(headers, expect);
			}

			// Check body(keys/values) and assign variables!
			if (is(variables) === "Object") {
				this._checkAndAssignVariables(body, variables);
			}

			console.timeEnd(test.title);
		}

		console.log(`\n\n${ok("All tests successfully passed!")}`);
		process.exit(0);
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
	 * @param {!Array<Object>} testArr Test payload to load on the application!
	 * @returns {loopbackTest} Return self
	 */
	load(testArr) {
		if (is.nullOrUndefined(testArr)) {
			throw new TypeError("test argument cant be undefined");
		}
		const _tHead = cloneDeep(this.headers);
		testArr.forEach((test) => {
			if(Reflect.has(test, 'headers')) {
				Object.assign(test.headers, _tHead);
			}
			else {
				Reflect.set(test, 'headers', _tHead)
			}
			this.tests.push(test);
		});
		return this;
	}

}

// Export loopbackModelTester handler
module.exports = loopbackTest;

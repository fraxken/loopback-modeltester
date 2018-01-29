"use strict";

// Require Node.JS package
const { createReadStream } = require("fs");
const { basename } = require("path");
const { performance } = require('perf_hooks');
const assert = require("assert");
const events = require('events');

// Require npm Packages
const { has, get, cloneDeep, merge, defaults } = require("lodash");
const request = require("request-promise");
const is = require("@sindresorhus/is");
const mime = require("mime-types");
const chalk = require("chalk");

// Assign Chalk color shortHand!
const {
	yellow: warn,
	greenBright: fOk,
	green: ok,
	blueBright: info,
	red: error,
	gray,
	white
} = chalk.bold;

// Variable REGEXP
const variableRegexp = /\${([a-zA-Z0-9._-]+)}/g;

const IDefaultRequest = {
	method: "GET",
	resolveWithFullResponse: true,
	json: true
};

/**
 * @function getSourceDB
 * @memberof helpers
 * @param {CollectionManager} model Loopback model
 * @returns {MongoDB.DB} Return MongoDB Connector
 */
function getSourceDB(model) {
	return new Promise((resolve, reject) => {
		model.getDataSource().connector.connect(function connectDB(err, db) {
			if (err) {
				return reject(err);
			}
			resolve(db);
		});
	});
}

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
	 * @param {String=} baseModelName
	 *
	 * @throws {TypeError}
	 */
	constructor(app, basePath = "api", baseModelName) {
		super();
		if (is.nullOrUndefined(app)) {
			throw new TypeError("App argument cannot be undefined!");
		}

		this.app 		= app;
		this.payload    = {};
		this.context 	= {};
		this.tests 		= [];
		this.basePath 	= basePath;

		this.app.on('started', async() => {
			let DB;
			if(is(baseModelName) === "string") {
				DB = await getSourceDB(this.app.models[baseModelName]);
				if(!is.nullOrUndefined(this._before)) {
					try {
						await this._before(DB);
					}
					catch(E) {
						this.emit('error', E.message);
					}
				}
			}
			try {
				await this.run();
			}
			catch(E) {
				if(Reflect.has(E, 'response')) {
					delete E.response;
				}
				this.emit('error', E);
			}
			if(!is.nullOrUndefined(this._after)) {
				try {
					await this._after(DB);
				}
				catch(E) {
					this.emit('error', E.message);
				}
			}
			process.exit(0);
		});
		process.nextTick(() => {
			this.app.start();
		});
	}

	/**
	 * @public
	 * @method setVar
	 * @desc Add a new variable into the context
	 * @memberof loopbackTest#
	 * @param {!String} varName Variable name
	 * @param {!any} varValue Variable value
	 * @returns {this}
	 *
	 * @throws {TypeError}
	 */
	setVar(varName, varValue) {
		if(is(varName) !== 'string') {
			throw new TypeError('varName argument should be a string!')
		}
		if(is.nullOrUndefined(varValue)) {
			throw new TypeError('varValue argument cannot be undefined');
		}
		Reflect.set(this.context, varName, varValue);
		return this;
	}

	/**
	 * @memberof loopbackTest
	 * @public
	 * @param {Function} before function
	 */
	set before(fn) {
		if(!is.asyncFunction(fn)) {
			throw new TypeError("before property should be an AsyncFunction");
		}
		this._before = fn;
	}

	/**
	 * @memberof loopbackTest
	 * @public
	 * @param {Function} after function
	 */
	set after(fn) {
		if(!is.asyncFunction(fn)) {
			throw new TypeError("after property should be an AsyncFunction");
		}
		this._after = fn;
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
		console.log(`├── ${white("bodyType")}: ${ok(bodyType)}`);
		console.log("│");

		// Check properties keys if the returned type is an Object!
		if (isType !== "Object" || is(properties) !== "Object") {
			return;
		}

		console.log(`├── [ ${warn("Body properties")} ]`);
		for(const key of Object.keys(properties)) {
			if (!has(body, key)) {
				throw new Error(`Missing body response key ${key}`);
			}
			const propertyType= Reflect.get(properties, key);
			const propertyIs = is(propertyValue);
			const bodyValue = get(body, key);
			const bodyType = is(bodyValue).toLowerCase();

			if(propertyIs === "string") {
				propertyType = propertyType.toLowerCase();
				if (propertyType === "any") {
					continue;
				}
				if (bodyType !== propertyValue) {
					throw new TypeError(`Property ${info(key)} should be ${ok(propertyType)} but the returned property was ${warn(bodyType)}`);
				}
				console.log(`│     ├── ${white(key)}: ${ok(propertyType)}`);
			}
			else if(propertyIs === "Object") {
				let { type, value } = propertyType;
				type = type.toLowerCase();
				if (type === "any") {
					continue;
				}
				if (bodyType !== type) {
					throw new TypeError(`Property ${info(key)} should be ${ok(type)} but the returned property was ${warn(bodyType)}`);
				}
				if(!is.nullOrUndefined(value) && bodyValue !== value) {
					if(is(value) === "string") {
						value = this._getContextVariable(value);
					}
					throw new Error(
						`Variable ${info(key)} value should be ${ok(value)} but was detected as ${error(bodyValue)}`
					);
				}
				console.log(`│     ├── ${white(key)}: ${ok(propertyType)}`);
 			}
		}
		console.log("│");
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
		console.log(`├── [ ${warn("Headers properties")} ]`);
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
			console.log(`│     ├── ${white(headerKey)}: ${ok(expected.headers[headerKey])}`);
		}
		console.log("│");
	}

	/**
	 * @private
	 * @method _checkAndAssignVariables
	 * @desc Check and Assign body (keys/values) into the Context!
	 * @memberof loopbackTest#
	 * @param {!Object} body Request body object!
	 * @param {String[]} variables Request variables Object
	 * @returns {void}
	 *
	 * @throws {Error}
	 */
	_checkAndAssignVariables(body, variables) {
		for(const completeVarStr of variables) {
			const [varName, varFix] = completeVarStr.split(':');
			if(!has(body, varName)) {
				throw new Error(`Variable ${ok(varName)} is missing from the response body. Cannot be applied to the test Context!`);
			}
			const varValue = get(body, varName);
			const finalVarName = varFix || varName;
			this.context[finalVarName] = varValue;
			console.log(
				`├── Assign new variable ${ok(finalVarName)} with value ${chalk.bold.cyan(varValue)} into the context!`
			);
		}
		console.log("│");
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
		console.log(`├── ${white(strTitle)}:`);
		console.log(`\n${gray(JSON.stringify(payload, null, 2))}\n`);
	}

	/**
	 * @private
	 * @method _getContextVariable
	 * @desc Get variable in Regexp (shorthand private method)
	 * @param {!String} varStr variable to handle!
	 * @returns {void|String} Context variable!
	 * 
	 * @throws {TypeError}
	 */
	_getContextVariable(varStr) {
		if(is.nullOrUndefined(varStr)) {
			throw new TypeError("varStr argument cannot be undefined or null!");
		}
		varStr.replace(variableRegexp, (match, matchValue) => {
			if (!Reflect.has(this.context, matchValue)) {
				return;
			}
			varStr = varStr.replace(
				new RegExp(`\\${match}`, "g"),
				Reflect.get(this.context, matchValue)
			);
		});
		return varStr;
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
			testIndex++;
			performance.mark(`start_${testIndex}`);
			console.log(`\n\n${white("Running test: id")} ${ok(testIndex)} - ${fOk(test.title) || "[NO TITLE]"}`);
			console.log(gray("─────────────────────────────────────────────────────"));
			

			if (test.skip) {
				console.log(`├── ${warn("Test skipped...")}`);
				continue;
			}

			const { expect = {}, file, debug = false, variables } = test;
			if (is.nullOrUndefined(expect.statusCode)) {
				Reflect.set(expect, "statusCode", 200);
			}
			test.url = this._getContextVariable(test.url);

			// Hydrate context for headers keys!
			if (is(test.headers) === 'Object') {
				for(const key of Object.keys(test.headers)) {
					const value = Reflect.get(test.headers, key);
					if (is(value) !== "string") {
						continue;
					}
					Reflect.set(test.headers, key, this._getContextVariable(value));
				}
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
				reqOptions.formData = { 
					name,
					[formName]: {
						value: createReadStream(file.path),
						options: {
							filename: name,
							contentType: mime.lookup(name)
						}
					}
				};
			}

			// Debug the request options !
			if (debug) {
				console.log(`├── [ ${chalk.magenta.bold("DEBUG ON")} ]`)
				this._dump("Request options", reqOptions);
				this._dump("Context", this.context);
			}
			else {
				console.log(`├── ${white("url")}: [${warn(reqOptions.method)}] ${ok(reqOptions.url)}`);
			}

			// Make the request !
			let body, statusCode, headers;
			try {
				const response = await request(reqOptions);
				body = response.body;
				statusCode = response.statusCode;
				headers = response.headers;
				if (debug) {
					this._dump("Body", body);
					this._dump("Headers", headers);
				}
			}
			catch(E) {
				this._dump("Request options", reqOptions);
				this._dump("Context", this.context);
				this._dump("Body", body);
				this._dump("Headers", headers);
				throw E;
			}

			// Check expected response statusCode
			assert.equal(statusCode, expect.statusCode,
				`Invalid response statusCode. Should be ${ok(expect)} but returned code ${error(statusCode)}`
			);
			console.log(`├── ${white("statusCode")}: ${ok(expect.statusCode)}`);

			// Check expected bodyType returned by the Request !
			if (is(expect.bodyType) === "string") {
				this._checkBodyExpectation(body, expect);
			}

			// Check expected headers!
			if (is(expect.headers) === "Object") {
				this._checkHeadersExpectation(headers, expect);
			}

			// Check body(keys/values) and assign variables!
			if (is(variables) === "Array") {
				this._checkAndAssignVariables(body, variables);
			}

			performance.mark(`end_${testIndex}`);
			performance.measure(`execDuration_${testIndex}`, `start_${testIndex}`, `end_${testIndex}`);
			const [measure] = performance.getEntriesByName(`execDuration_${testIndex}`);
			console.log(`├── ${white("Execution time (ms)")}: ${warn(`${measure.duration}ms`)}`);
		}

		console.log(`\n\n${ok("All tests successfully passed!")}`);
	}

	/**
	 * @public
	 * @method defaultPayload
	 * @desc Add default payload for each tests!
	 * @memberof loopbackTest#
	 * @param {!Object} payload payload
	 * @returns {this}
	 *
	 * @throws {TypeError}
	 */
	defaultPayload(payload) {
		if (is(payload) !== 'Object') {
			throw new TypeError("payload argument have to be typeof Object");
		}

		Object.assign(this.payload, cloneDeep(payload));
		return this;
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
		testArr.forEach((test) => {
			this.tests.push(merge(cloneDeep(this.payload), test));
		});
		return this;
	}

}

// Export loopbackModelTester handler
module.exports = loopbackTest;

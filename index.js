require('make-promises-safe'); // installs an 'unhandledRejection' handler;

// Require Node.JS package
const { createReadStream } = require("fs");
const { basename } = require("path");
const { performance } = require('perf_hooks');
const assert = require("assert");
const events = require('events');
const readline = require('readline');


// Require npm Packages
const { has, get, cloneDeep, merge, isEqual } = require("lodash");
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

// create readline Interface
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

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
	 * @param {String=} baseModelName baseModelName (used to get dataSource in after/before)
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
		this.extension  = new Map();

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
				Reflect.deleteProperty(E, 'response');
				Reflect.deleteProperty(E, 'options');
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
	 * @returns {this} return this
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
	 * @param {Function} fn function
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
	 * @param {Function} fn function
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
		if (isType !== "object" || is(properties) !== "Object") {
			return;
		}

		console.log(`├── [ ${warn("Body properties")} ]`);
		for(const key of Object.keys(properties)) {
			if (!has(body, key)) {
				throw new Error(`Missing property key ${key} in the response body`);
			}
			let propertyType 	= Reflect.get(properties, key);
			const propertyIs 	= is(propertyType);
			const bodyValue 	= get(body, key);
			const bodyType 		= is(bodyValue).toLowerCase();

			if(propertyIs === "string") {
				propertyType = propertyType.toLowerCase();
				if (propertyType === "any") {
					continue;
				}
				if (bodyType !== propertyType) {
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
					throw new TypeError(`Property ${info(key)} should be typeof ${ok(type)} but the returned property was typeof ${warn(bodyType)}`);
				}
				if(is(value) === "string") {
					value = this._getContextVariable(value);
				}
				const valueIsNotDefined = is.nullOrUndefined(value);
				if(valueIsNotDefined === false && !isEqual(bodyValue, value)) {
					throw new Error(`Variable ${info(key)} value should be ${ok(value)} but was detected as ${error(bodyValue)}`);
				}
				console.log(`│     ├── ${white(key)}: ${ok(type)} -> ${info(!valueIsNotDefined ? value : 'N/D')}`);
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
	 * @private
	 * @method _hydrateObject
	 * @desc Hydrate an object
	 * @param {any!} focusObject Object to hydrate
	 * @returns {void} Return void
	 */
	_hydrateObject(focusObject) {
		for(const key of Object.keys(focusObject)) {
			const value = Reflect.get(focusObject, key);
			if (is(value) !== "string") {
				continue;
			}
			Reflect.set(focusObject, key, this._getContextVariable(value));
		}
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

		runTests: for(const test of this.tests) {
			testIndex++;
			performance.mark(`start_${testIndex}`);
			console.log(`\n\n${white("Running test: id")} ${ok(testIndex)} - ${fOk(test.title) || "[NO TITLE]"}`);
			console.log(gray("─────────────────────────────────────────────────────"));

			// Skip test!
			if (test.skip) {
				console.log(`├── ${warn("Test skipped...")}`);
				continue;
			}

			const { expect = {}, file, debug = false, variables } = test;
			if (is.nullOrUndefined(expect.statusCode)) {
				Reflect.set(expect, "statusCode", 200);
			}
			test.url = this._getContextVariable(test.url);

			// Define the HTTP Request!
			let reqOptions = {
				method: test.method,
				url: `${baseUrl}/${this.basePath}${is(test.model) === "string" ? `/${test.model}` : ""}/${test.url}`,
				body: test.body,
				qs: test.qs
			};
			// Hydrate context for headers keys!
			if (is(test.headers) === 'Object') {
				this._hydrateObject(test.headers);
				Reflect.set(reqOptions, 'headers', test.headers);
			}
			if(is(test.form) === 'Object') {
				this._hydrateObject(test.form);
				Reflect.set(reqOptions, 'form', test.form);
			}
			if(is(test.formData) === 'Object') {
				this._hydrateObject(test.formData);
				Reflect.set(reqOptions, 'formData', test.formData);
			}
			reqOptions = Object.assign(cloneDeep(IDefaultRequest), reqOptions);

			// Upload a file!
			uploadFile: if (is(file) === "Object") {
				if (is.nullOrUndefined(file.path)) {
					break uploadFile;
				}
				const formName = is.nullOrUndefined(file.form_name) ? "file" : file.form_name;
				const name = basename(file.path);
				reqOptions.formData = Object.assign(reqOptions.formData || {}, {
					name,
					[formName]: {
						value: createReadStream(file.path),
						options: {
							filename: name,
							contentType: mime.lookup(name)
						}
					}
				});
			}

			// Debug the request options !
			if (debug) {
				console.log(`├── [ ${chalk.magenta.bold("DEBUG ON")} ]`)
				this._dump("Request options", reqOptions);
				this._dump("Context", this.context);
			}
			else {
				console.log(`├── ${white("url")}: [${warn(reqOptions.method || 'GET')}] ${ok(reqOptions.url)}`);
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
				statusCode = E.statusCode;
				body = E.response.body;
				headers = E.response.headers;
				if(statusCode === 200) {
					this._dump("Request options", reqOptions);
					this._dump("Context", this.context);
					this._dump("Body", body);
					this._dump("Headers", headers);
					throw E;
				}
				else if(debug) {
					this._dump("Body", body);
					this._dump("Headers", headers);
				}
			}

			// Check expected response statusCode
			assert.equal(statusCode, expect.statusCode,
				`Invalid response statusCode. Should be ${ok(expect.statusCode)} but returned code ${error(statusCode)}`
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
			if(Reflect.has(expect, 'duration')) {
				if(measure.duration > expect.duration) {
					throw new Error(
						`${white("Expect baseline execution duration")}: ${ok(`${expect.duration}ms`)} but was ${error(measure.duration)}`
					);
				}
			}
			console.log(`├── ${white("Execution time (ms)")}: ${warn(`${measure.duration}ms`)}`);

			// Break
			if(test.break) {
				const breakRet = await new Promise((resolve) => {
					rl.question(`\n${error('Do you want to continue the test ? (Y/N) ')}`, (answer) => {
						answer = answer.toLowerCase();
						rl.close();
						resolve(answer);
					});
				});
				if(breakRet !== "y") {
					console.log(warn('Test breaked!'));
					break runTests;
				}
			}
		}

		console.log(`\n\n${ok("All tests passed!")}`);
	}

	/**
	 * @public
	 * @method defaultPayload
	 * @desc Add default payload for each tests!
	 * @memberof loopbackTest#
	 * @param {!Object} payload payload
	 * @returns {this} return this
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
	 * @method extend
	 * @desc Add a new code extension
	 * @memberof loopbackTest#
	 * @param {!String} name extension name
	 * @param {!Object} payload payload
	 * @returns {this} return this
	 *
	 * @throws {TypeError}
	 */
	extend(name, payload) {
		if (is(name) !== 'string') {
			throw new TypeError('name argument should be a string');
		}
		if (is(payload) !== 'Object') {
			throw new TypeError("payload argument have to be typeof Object");
		}
		this.extension.set(name, cloneDeep(payload));
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
			if(Reflect.has(test, 'extends')) {
				const extendArray = Reflect.get(test, 'extends');
				if(is(extendArray) === 'Array') {
					for(const ext of extendArray) {
						if(this.extension.has(ext)) {
							test = merge(cloneDeep(this.extension.get(ext)), test);
						}
					}
				}
				Reflect.deleteProperty(test, 'extends');
			}
			this.tests.push(merge(cloneDeep(this.payload), test));
		});
		return this;
	}

}

// Export loopbackModelTester handler
module.exports = loopbackTest;

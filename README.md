# loopback-modeltester
Loopback 3.x JSON - Models Unit testing!

# Installation

```
npm install loopback-modeltester [--save]
```

# Usage example

Configure a JSON file with all use cases and routes to test : 

```json
[
	{
		"title": "CollectionManager - create collection",
		"method": "POST",
		"model": "CollectionManagers",
		"url": "createCollection/testcol",
		"debug": true,
		"headers": {
			"payload": "{ \"login\": \"!String\", \"age\": \"!Number\" }"
		},
		"expect": {
			"statusCode": 200,
			"bodyType": "Object",
			"properties": {
				"error": "null"
			},
			"headers": {
				"content-type": "application/json"
			}
		}
	},
	{
		"title": "Collection - get stats",
		"method": "GET",
		"model": "Collections",
		"url": "stats/testcol",
		"expect": {
			"statusCode": 200,
			"bodyType": "Object",
			"properties": {
				"error": "null",
				"ok": {
					"type": "Number",
					"value": 1
				}
			},
			"headers": {
				"content-type": "application/json"
			}
		}
	},
	{
		"title": "Collection - get options",
		"method": "GET",
		"model": "Collections",
		"url": "options/testcol",
		"expect": {
			"statusCode": 200,
			"bodyType": "Object",
			"properties": {
				"validator.$and[0].login": "Object",
				"validator.$and[1].age": "Object"
			},
			"headers": {
				"content-type": "application/json"
			}
		}
	},
	{
		"title": "Collection - insert data",
		"method": "POST",
		"model": "Collections",
		"url": "set/testcol",
		"headers": {
			"payload": "{ \"login\": \"testuser\", \"age\" : 23 }"
		},
		"expect": {
			"statusCode": 200,
			"bodyType": "Object",
			"properties": {
				"error": "null",
				"insertedCount": {
					"type": "Number",
					"value": 1
				},
				"insertedId": "String"
			},
			"headers": {
				"content-type": "application/json"
			}
		},
		"variables": ["insertedId"]
	}
]
```

Create a test/test.js file at the root of your project with this content 

```js
'use strict';

// Setup env to development
process.env.NODE_ENV = 'development';

// Require Package(s)
const loopbackTest = require('loopback-modeltester');
const app = require('../server/server');
const modelTest = require('../server/model-tests.json');

const test = new loopbackTest(app, 'api');
test.on('error', console.error);
test.defaultHeaders({
	defaultHeader: 'hello world!'
});
test.load(modelTest);

```

## Documentation

For each tests, all followings keys are allowed. All fields based upon JavaScript types are checked with the lib @sindresorhus/is (So check this package to be sure you entered the right type).

| Key | Type | Default Value | Description |
| --- | --- | --- | --- |
| title | String | N.A | Test title |
| skip | Boolean | false | Skip or not the test |
| debug | Boolean | false | Debug the rest by logging headers and body properties |
| method | String | GET | The default HTTP Verbose method |
| model | String | N.A | The model name in the plural form |
| url | String | N.A | The request url |
| file | Object | N.A | FormData to upload a file |
| expect | Object | N.A | The expected response from the request |
| variables | Array | N.A | Variables to assign to the context based upon the Body response | 

#### Expect properties

| Key | Type | Default Value | Description |
| --- | --- | --- | --- |
| statusCode | Number | 200 | The expected HTTP status code |
| bodyType | String | N.A | The expected body type (JavaScript) |
| headers | Object | N.A | All headers key expected, with the value not matched explicitely |
| properties | Object | N.A | All body properties expected |

Properties values can be JavaScript types or an Object. Take the following example : 

```json
{
  "error": "null",
  "insertedCount": {
    "type": "Number",
    "value": 1
  },
  "insertedId": "String"
}
```

#### Variables

Variables assigned to the context can be used on different fields : 

- URL
- Headers values
- Expected properties values
# Loopback-modeltester
Loopback model unit testing that work with JSON files

## Getting Started

This package is available in the Node Package Repository and can be easily installed with [npm](https://docs.npmjs.com/getting-started/what-is-npm) or [yarn](https://yarnpkg.com).

```bash
$ npm i loopback-modeltester
# or
$ yarn add loopback-modeltester
``` 

The first step is to create a test/test.js file at the root of your project with the following content:

```js
// Setup env to development (maybe required by your loopback configuration)
process.env.NODE_ENV = 'development';

// Require The package
const loopbackTest = require('loopback-modeltester');

// Require Loopback server (app)
const app = require('../server/server');

// Require one or multiple JSON that describe your tests!
const modelTest = require('./model-tests.json');

// Declare a new test ! ('api' is the REST base path of Loopback)
const test = new loopbackTest(app, 'api');

// Catch error
test.on('error', console.error);

// Optionaly set a default payload for every tests!
test.defaultPayload({
    headers: {
        foo: 'bar'
    }
});

// Load your JSON test!
test.load(modelTest);
```

Find a complete JSON example in the root example repository.

## Documentation

For each tests, all followings keys are allowed. All fields based upon JavaScript types are checked with the lib @sindresorhus/is (So check this package to be sure you entered the right type).

| Key | Type | Default Value | Description |
| --- | --- | --- | --- |
| title | String | N.A | Test title |
| skip | Boolean | false | Skip or not the test |
| break | Boolean | false | Break or pause your test |
| debug | Boolean | false | Debug the rest by logging headers and body properties |
| method | String | GET | The default HTTP Verbose method |
| model | String | N.A | The model name in the plural form |
| url | String | N.A | The request url |
| file | Object | N.A | FormData to upload a file |
| expect | Object | N.A | The expected response from the request |
| variables | Array | N.A | Variables to assign to the context based upon the Body response | 

### Expect properties

| Key | Type | Default Value | Description |
| --- | --- | --- | --- |
| statusCode | Number | 200 | The expected HTTP status code |
| duration | Number | N.A | The expected baseline duration of the HTTP Request |
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

### Variables

Variables assigned to the context can be used on different fields : 

- URL
- Headers values
- Expected properties values

## VSCode configuration

If you want JSON completion, you can configure intellisence with JSON Schema. Edit your configuration and put this:

```
"json.schemas": [
    {
        "fileMatch": [
            "*.lb_tests.json"
        ],
        "url": "./node_modules/loopback-modeltester/schema.json"
    },
]
```

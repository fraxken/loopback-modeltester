# loopback-modeltester
Loopback 3.x JSON - Model/Routes Unit testing

# Installation

```
npm install loopback-modeltester --save
```

# Usage example

Configure a JSON file with all use cases and routes to test : 

```json
[
  {
    "title": "FileStorage - upload Method",
    "method": "POST",
    "model": "filestorages",
    "url": "upload",
    "expect": {
      "statusCode": 200,
      "bodyType": "Object",
      "properties": {
        "id": "String"
      },
      "headers": {
        "content-type": "application/json"
      }
    },
    "file": {
      "path": "./test/SUService.log",
      "form_name": "fichier"
    },
    "variables": {
      "id": {
        "name": "uploadedImageId",
        "required": true
      }
    }
  },
  {
    "title": "FileStorage - getInfos Method",
    "model": "filestorages",
    "url": "getInfos/${uploadedImageId}",
    "expect": {
      "statusCode": 200,
      "bodyType": "Object"
    }
  },
  {
    "title": "FileStorage - listObjects Method",
    "model": "filestorages",
    "url": "listObjects",
    "expect": {
      "statusCode": 200,
      "bodyType": "Array"
    }
  },
  {
    "title": "FileStorage - download Method",
    "model": "filestorages",
    "url": "download/${uploadedImageId}",
    "debug": true,
    "expect": {
      "statusCode": 200,
      "headers": {
        "content-type": "text/plain"
      }
    }
  },
  {
    "title": "FileStorage - deleteByName Method",
    "method": "DELETE",
    "model": "filestorages",
    "url": "deleteByName/${uploadedImageId}",
    "expect": {
      "statusCode": 200,
      "bodyType": "Object",
      "properties": {
        "count": "Number"
      },
      "headers": {
        "content-type": "application/json"
      }
    }
  }
]
```

Create a test/test.js file at the root of your project with this content 

```js
'use strict';

// Setup manually dev env (setup the env here, or not if not required).
process.env.NODE_ENV = 'development';

// Require Packages
const loopbackModelTester = require('loopback-modeltester');
const app = require('../server/server');
const fileStorageTest = require('../server/model-test.json'); // Require your JSON here!

try {
  loopbackModelTester(app, fileStorageTest);
} catch (E) {
  console.error(E);
}
```

## Documentation

For each tests, all followings keys are allowed

| Key | Type | Default Value | Description |
| --- | --- | --- | --- |
| title | String | N.A | Test title |
| skip | Boolean | false | Skip or not the test |
| debug | Boolean | false | Debug the rest by logging headers and body properties |
| method | String | GET | The default HTTP Verbose method |
| model | String | N.A | The model name in the plural form |
| url | String | N.A | The request url |
| expect | Object | N.A | The expected response from the request |
| variables | Object | N.A | Variables to assign to the context based upon the Body response | 

#### Expect properties
#### Variables properties

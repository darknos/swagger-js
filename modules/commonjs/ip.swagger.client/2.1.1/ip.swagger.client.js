(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g=(g.ip||(g.ip = {}));g=(g.swagger||(g.swagger = {}));g.client = f()}})(function(){var define,module,exports;return (function e(t,n,r){function o(i,u){if(!n[i]){if(!t[i]){var a=typeof require=="function"&&require;if(!u&&a)return a.length===2?a(i,!0):a(i);if(s&&s.length===2)return s(i,!0);if(s)return s(i);var f=new Error("Cannot find module '"+i+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[i]={exports:{}};t[i][0].call(l.exports,function(e){var n=t[i][1][e];return o(n?n:e)},l,l.exports,e,t,n,r)}return n[i].exports}var i=Array.prototype.slice;Function.prototype.bind||Object.defineProperty(Function.prototype,"bind",{enumerable:!1,configurable:!0,writable:!0,value:function(e){function r(){return t.apply(this instanceof r&&e?this:e,n.concat(i.call(arguments)))}if(typeof this!="function")throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");var t=this,n=i.call(arguments,1);return r.prototype=Object.create(t.prototype),r.prototype.contructor=r,r}});var s=typeof require=="function"&&require;for(var u=0;u<r.length;u++)o(r[u]);return o})({1:[function(require,module,exports){
'use strict';

var auth = require('./lib/auth');
var helpers = require('./lib/helpers');
var SwaggerClient = require('./lib/client');
var deprecationWrapper = function (url, options) {
  helpers.log('This is deprecated, use "new SwaggerClient" instead.');

  return new SwaggerClient(url, options);
};

/* Here for IE8 Support */
if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function(obj, start) {
    for (var i = (start || 0), j = this.length; i < j; i++) {
      if (this[i] === obj) { return i; }
    }
    return -1;
  };
}

/* Here for IE8 Support */
if (!String.prototype.trim) {
  String.prototype.trim = function () {
    return this.replace(/^\s+|\s+$/g, '');
  };
}

/* Here for node 10.x support */
if (!String.prototype.endsWith) {
  String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
  };
}

module.exports = SwaggerClient;

SwaggerClient.ApiKeyAuthorization = auth.ApiKeyAuthorization;
SwaggerClient.PasswordAuthorization = auth.PasswordAuthorization;
SwaggerClient.CookieAuthorization = auth.CookieAuthorization;
SwaggerClient.SwaggerApi = deprecationWrapper;
SwaggerClient.SwaggerClient = deprecationWrapper;

},{"./lib/auth":2,"./lib/client":3,"./lib/helpers":4}],2:[function(require,module,exports){
'use strict';

var _ = {
  each: require('lodash-compat/collection/each'),
  includes: require('lodash-compat/collection/includes'),
  isObject: require('lodash-compat/lang/isObject'),
  isArray: require('lodash-compat/lang/isArray')
};

/**
 * SwaggerAuthorizations applys the correct authorization to an operation being executed
 */
var SwaggerAuthorizations = module.exports.SwaggerAuthorizations = function (authz) {
  this.authz = authz || {};
};

/**
 * Add auths to the hash
 * Will overwrite any existing
 *
 */
SwaggerAuthorizations.prototype.add = function (name, auth) {
  if(name && typeof name === 'object') {
    for (var key in name) {
      this.authz[key] = name[key];
    }
  } else if(typeof name === 'string' ){
    this.authz[name] = auth;
  }

  return auth;
};

SwaggerAuthorizations.prototype.remove = function (name) {
  return delete this.authz[name];
};

SwaggerAuthorizations.prototype.apply = function (obj, securities) {
  var status = null;
  var applyAll = !securities;
  var flattenedSecurities = [];

  // Securities could be [ {} ]
  _.each(securities, function (obj, key) {

    // Make sure we account for securities being [ str ]
    if(typeof key === 'string') {
      flattenedSecurities.push(key);
    }

    // Flatten keys in to our array
    _.each(obj, function (val, key) {
      flattenedSecurities.push(key);
    });
  });

  _.each(this.authz, function (auth, authName) {
    if(applyAll || _.includes(flattenedSecurities, authName)) {
      status = status || !!auth.apply(obj); // logical ORs regarding status
    }
  });

  return status;
};

/**
 * ApiKeyAuthorization allows a query param or header to be injected
 */
var ApiKeyAuthorization = module.exports.ApiKeyAuthorization = function (name, value, type) {
  this.name = name;
  this.value = value;
  this.type = type;
};

ApiKeyAuthorization.prototype.apply = function (obj) {
  if (this.type === 'query') {
    if (obj.url.indexOf('?') > 0) {
      obj.url = obj.url + '&' + this.name + '=' + this.value;
    } else {
      obj.url = obj.url + '?' + this.name + '=' + this.value;
    }

    return true;
  } else if (this.type === 'header') {
    obj.headers[this.name] = this.value;

    return true;
  }
};

},{"lodash-compat/collection/each":14,"lodash-compat/collection/includes":17,"lodash-compat/lang/isArray":104,"lodash-compat/lang/isObject":108}],3:[function(require,module,exports){
(function (setTimeout){
'use strict';

var _ = {
  bind: require('lodash-compat/function/bind'),
  cloneDeep: require('lodash-compat/lang/cloneDeep'),
  find: require('lodash-compat/collection/find'),
  forEach: require('lodash-compat/collection/forEach'),
  indexOf: require('lodash-compat/array/indexOf'),
  isArray: require('lodash-compat/lang/isArray'),
  isFunction: require('lodash-compat/lang/isFunction'),
  isPlainObject: require('lodash-compat/lang/isPlainObject'),
  isUndefined: require('lodash-compat/lang/isUndefined')
};
var auth = require('./auth');
var helpers = require('./helpers');
var Model = require('./types/model');
var Operation = require('./types/operation');
var OperationGroup = require('./types/operationGroup');
var Resolver = require('./resolver');
var SwaggerHttp = require('./http');
var SwaggerSpecConverter = require('./spec-converter');

// We have to keep track of the function/property names to avoid collisions for tag names which are used to allow the
// following usage: 'client.{tagName}'
var reservedClientTags = [
  'apis',
  'authorizationScheme',
  'authorizations',
  'basePath',
  'build',
  'buildFrom1_1Spec',
  'buildFrom1_2Spec',
  'buildFromSpec',
  'clientAuthorizations',
  'convertInfo',
  'debug',
  'defaultErrorCallback',
  'defaultSuccessCallback',
  'fail',
  'failure',
  'finish',
  'help',
  'idFromOp',
  'info',
  'initialize',
  'isBuilt',
  'isValid',
  'modelPropertyMacro',
  'models',
  'modelsArray',
  'options',
  'parameterMacro',
  'parseUri',
  'progress',
  'resourceCount',
  'sampleModels',
  'selfReflect',
  'setConsolidatedModels',
  'spec',
  'supportedSubmitMethods',
  'swaggerRequestHeaders',
  'tagFromLabel',
  'url',
  'useJQuery'
];
// We have to keep track of the function/property names to avoid collisions for tag names which are used to allow the
// following usage: 'client.apis.{tagName}'
var reservedApiTags = [
  'apis',
  'asCurl',
  'description',
  'externalDocs',
  'help',
  'label',
  'name',
  'operation',
  'operations',
  'operationsArray',
  'path',
  'tag'
];
var supportedOperationMethods = ['delete', 'get', 'head', 'options', 'patch', 'post', 'put'];
var SwaggerClient = module.exports = function (url, options) {
  this.authorizations = null;
  this.authorizationScheme = null;
  this.basePath = null;
  this.debug = false;
  this.info = null;
  this.isBuilt = false;
  this.isValid = false;
  this.modelsArray = [];
  this.resourceCount = 0;
  this.url = null;
  this.useJQuery = false;

  this.clientAuthorizations = new auth.SwaggerAuthorizations();

  if (typeof url !== 'undefined') {
    return this.initialize(url, options);
  } else {
    return this;
  }
};

SwaggerClient.prototype.initialize = function (url, options) {
  this.models = {};
  this.sampleModels = {};

  if (typeof url === 'string') {
    this.url = url;
  } else if (typeof url === 'object') {
    options = url;
    this.url = options.url;
  }

  options = options || {};
  this.clientAuthorizations.add(options.authorizations);
  this.swaggerRequestHeaders = options.swaggerRequestHeaders || 'application/json;charset=utf-8,*/*';
  this.defaultSuccessCallback = options.defaultSuccessCallback || null;
  this.defaultErrorCallback = options.defaultErrorCallback || null;
  this.modelPropertyMacro = options.modelPropertyMacro || null;
  this.parameterMacro = options.modelPropertyMacro || null;

  if (typeof options.success === 'function') {
    this.success = options.success;
  }

  if (options.useJQuery) {
    this.useJQuery = options.useJQuery;
  }

  this.options = options || {};

  this.supportedSubmitMethods = options.supportedSubmitMethods || [];
  this.failure = options.failure || function () {};
  this.progress = options.progress || function () {};
  this.spec = _.cloneDeep(options.spec); // Clone so we do not alter the provided document

  if (typeof options.success === 'function') {
    this.ready = true;
    this.build();
  }
};

SwaggerClient.prototype.build = function (mock) {
  if (this.isBuilt) {
    return this;
  }

  var self = this;

  this.progress('fetching resource list: ' + this.url);

  var obj = {
    useJQuery: this.useJQuery,
    url: this.url,
    method: 'get',
    headers: {
      accept: this.swaggerRequestHeaders
    },
    on: {
      error: function (response) {
        if (self.url.substring(0, 4) !== 'http') {
          return self.fail('Please specify the protocol for ' + self.url);
        } else if (response.status === 0) {
          return self.fail('Can\'t read from server.  It may not have the appropriate access-control-origin settings.');
        } else if (response.status === 404) {
          return self.fail('Can\'t read swagger JSON from ' + self.url);
        } else {
          return self.fail(response.status + ' : ' + response.statusText + ' ' + self.url);
        }
      },
      response: function (resp) {

        var responseObj = resp.obj;
        if(!responseObj) {
          return self.fail('failed to parse JSON/YAML response');
        }

        self.swaggerVersion = responseObj.swaggerVersion;

        if (responseObj.swagger && parseInt(responseObj.swagger) === 2) {
          self.swaggerVersion = responseObj.swagger;

          new Resolver().resolve(responseObj, self.url, self.buildFromSpec, self);

          self.isValid = true;
        } else {
          var converter = new SwaggerSpecConverter();
          converter.setDocumentationLocation(self.url);
          converter.convert(responseObj, self.clientAuthorizations, function(spec) {
            new Resolver().resolve(spec, self.url, self.buildFromSpec, self);
            self.isValid = true;
          });
        }
      }
    }
  };

  if (this.spec) {
    setTimeout(function () {
        if (self.spec.swaggerVersion == "1.2") {
            var converter = new SwaggerSpecConverter();
            converter.setDocumentationLocation(self.url);
            converter.convert(self.spec, self.clientAuthorizations, function(spec) {     
                new Resolver().resolve(spec, self.buildFromSpec, self);
                self.isValid = true;
            });
        } else {
            new Resolver().resolve(self.spec, self.buildFromSpec, self);
        }
   }, 10);
  } else {
    this.clientAuthorizations.apply(obj);

    if (mock) {
      return obj;
    }

    new SwaggerHttp().execute(obj, this.options);
  }

  return this;
};

SwaggerClient.prototype.buildFromSpec = function (response) {
  if (this.isBuilt) {
    return this;
  }

  this.apis = {};
  this.apisArray = [];
  this.basePath = response.basePath || '';
  this.consumes = response.consumes;
  this.host = response.host || '';
  this.info = response.info || {};
  this.produces = response.produces;
  this.schemes = response.schemes || [];
  this.securityDefinitions = response.securityDefinitions;
  this.title = response.title || '';

  if (response.externalDocs) {
    this.externalDocs = response.externalDocs;
  }

  // legacy support
  this.authSchemes = response.securityDefinitions;

  var definedTags = {};
  var k;

  if (Array.isArray(response.tags)) {
    definedTags = {};

    for (k = 0; k < response.tags.length; k++) {
      var t = response.tags[k];
      definedTags[t.name] = t;
    }
  }

  var location;

  if (typeof this.url === 'string') {
    location = this.parseUri(this.url);
    if (typeof this.schemes === 'undefined' || this.schemes.length === 0) {
      this.scheme = location.scheme || 'http';
    } else {
      this.scheme = this.schemes[0];
    }

    if (typeof this.host === 'undefined' || this.host === '') {
      this.host = location.host;

      if (location.port) {
        this.host = this.host + ':' + location.port;
      }
    }
  }
  else {
    if (typeof this.schemes === 'undefined' || this.schemes.length === 0) {
      this.scheme = 'http';
    }
    else {
      this.scheme = this.schemes[0];
    }
  }

  this.definitions = response.definitions;

  var key;

  for (key in this.definitions) {
    var model = new Model(key, this.definitions[key], this.models, this.modelPropertyMacro);

    if (model) {
      this.models[key] = model;
    }
  }

  // get paths, create functions for each operationId
  var self = this;

  // Bind help to 'client.apis'
  self.apis.help = _.bind(self.help, self);

  _.forEach(response.paths, function (pathObj, path) {
    // Only process a path if it's an object
    if (!_.isPlainObject(pathObj)) {
      return;
    }

    _.forEach(supportedOperationMethods, function (method) {
      var operation = pathObj[method];

      if (_.isUndefined(operation)) {
        // Operation does not exist
        return;
      } else if (!_.isPlainObject(operation)) {
        // Operation exists but it is not an Operation Object.  Since this is invalid, log it.
        helpers.log('The \'' + method + '\' operation for \'' + path + '\' path is not an Operation Object');

        return;
      }

      var tags = operation.tags;

      if (_.isUndefined(tags) || !_.isArray(tags) || tags.length === 0) {
        tags = operation.tags = [ 'default' ];
      }

      var operationId = self.idFromOp(path, method, operation);
      var operationObject = new Operation(self,
        operation.scheme,
        operationId,
        method,
        path,
        operation,
        self.definitions,
        self.models,
        self.clientAuthorizations);

      // bind self operation's execute command to the api
      _.forEach(tags, function (tag) {
        var clientProperty = _.indexOf(reservedClientTags, tag) > -1 ? '_' + tag : tag;
        var apiProperty = _.indexOf(reservedApiTags, tag) > -1 ? '_' + tag : tag;
        var operationGroup = self[clientProperty];

        if (clientProperty !== tag) {
          helpers.log('The \'' + tag + '\' tag conflicts with a SwaggerClient function/property name.  Use \'client.' +
                      clientProperty + '\' or \'client.apis.' + tag + '\' instead of \'client.' + tag + '\'.');
        }

        if (apiProperty !== tag) {
          helpers.log('The \'' + tag + '\' tag conflicts with a SwaggerClient operation function/property name.  Use ' +
                      '\'client.apis.' + apiProperty + '\' instead of \'client.apis.' + tag + '\'.');
        }

        if (_.indexOf(reservedApiTags, operationId) > -1) {
          helpers.log('The \'' + operationId + '\' operationId conflicts with a SwaggerClient operation ' +
                      'function/property name.  Use \'client.apis.' + apiProperty + '._' + operationId +
                      '\' instead of \'client.apis.' + apiProperty + '.' + operationId + '\'.');

          operationId = '_' + operationId;
          operationObject.nickname = operationId; // So 'client.apis.[tag].operationId.help() works properly
        }

        if (_.isUndefined(operationGroup)) {
          operationGroup = self[clientProperty] = self.apis[apiProperty] = {};

          operationGroup.operations = {};
          operationGroup.label = apiProperty;
          operationGroup.apis = {};

          var tagDef = definedTags[tag];

          if (!_.isUndefined(tagDef)) {
            operationGroup.description = tagDef.description;
            operationGroup.externalDocs = tagDef.externalDocs;
          }

          self[clientProperty].help = _.bind(self.help, operationGroup);
          self.apisArray.push(new OperationGroup(tag, operationGroup.description, operationGroup.externalDocs, operationObject));
        }

        // Bind tag help
        if (!_.isFunction(operationGroup.help)) {
          operationGroup.help = _.bind(self.help, operationGroup);
        }

        // bind to the apis object
        self.apis[apiProperty][operationId] = operationGroup[operationId] = _.bind(operationObject.execute,
                                                                                  operationObject);
        self.apis[apiProperty][operationId].help = operationGroup[operationId].help = _.bind(operationObject.help,
                                                                                             operationObject);
        self.apis[apiProperty][operationId].asCurl = operationGroup[operationId].asCurl = _.bind(operationObject.asCurl,
                                                                                                 operationObject);

        operationGroup.apis[operationId] = operationGroup.operations[operationId] = operationObject;

        // legacy UI feature
        var api = _.find(self.apisArray, function (api) {
          return api.tag === tag;
        });

        if (api) {
          api.operationsArray.push(operationObject);
        }
      });
    });
  });

  this.isBuilt = true;

  if (this.success) {
    this.isValid = true;
    this.isBuilt = true;
    this.success();
  }

  return this;
};

SwaggerClient.prototype.parseUri = function (uri) {
  var urlParseRE = /^(((([^:\/#\?]+:)?(?:(\/\/)((?:(([^:@\/#\?]+)(?:\:([^:@\/#\?]+))?)@)?(([^:\/#\?\]\[]+|\[[^\/\]@#?]+\])(?:\:([0-9]+))?))?)?)?((\/?(?:[^\/\?#]+\/+)*)([^\?#]*)))?(\?[^#]+)?)(#.*)?/;
  var parts = urlParseRE.exec(uri);

  return {
    scheme: parts[4].replace(':',''),
    host: parts[11],
    port: parts[12],
    path: parts[15]
  };
};

SwaggerClient.prototype.help = function (dontPrint) {
  var output = '';

  if (this instanceof SwaggerClient) {
    _.forEach(this.apis, function (api, name) {
      if (_.isPlainObject(api)) {
        output += 'operations for the \'' + name + '\' tag\n';

        _.forEach(api.operations, function (operation, name) {
          output += '  * ' + name + ': ' + operation.summary + '\n';
        });
      }
    });
  } else if (this instanceof OperationGroup || _.isPlainObject(this)) {
    output += 'operations for the \'' + this.label + '\' tag\n';

    _.forEach(this.apis, function (operation, name) {
      output += '  * ' + name + ': ' + operation.summary + '\n';
    });
  }

  if (dontPrint) {
    return output;
  } else {
    helpers.log(output);

    return output;
  }
};

SwaggerClient.prototype.tagFromLabel = function (label) {
  return label;
};

SwaggerClient.prototype.idFromOp = function (path, httpMethod, op) {
  if(!op || !op.operationId) {
    op = op || {};
    op.operationId = httpMethod + '_' + path;
  }
  var opId = op.operationId.replace(/[\s!@#$%^&*()_+=\[{\]};:<>|.\/?,\\'""-]/g, '_') || (path.substring(1) + '_' + httpMethod);

  opId = opId.replace(/((_){2,})/g, '_');
  opId = opId.replace(/^(_)*/g, '');
  opId = opId.replace(/([_])*$/g, '');
  return opId;
};

SwaggerClient.prototype.fail = function (message) {
  this.failure(message);

  throw message;
};

}).call(this,require("--timers--").setTimeout)
},{"--timers--":125,"./auth":2,"./helpers":4,"./http":5,"./resolver":6,"./spec-converter":7,"./types/model":8,"./types/operation":9,"./types/operationGroup":10,"lodash-compat/array/indexOf":11,"lodash-compat/collection/find":15,"lodash-compat/collection/forEach":16,"lodash-compat/function/bind":20,"lodash-compat/lang/cloneDeep":102,"lodash-compat/lang/isArray":104,"lodash-compat/lang/isFunction":106,"lodash-compat/lang/isPlainObject":109,"lodash-compat/lang/isUndefined":112}],4:[function(require,module,exports){
(function (process,console){
'use strict';

var _ = {
  isPlainObject: require('lodash-compat/lang/isPlainObject')
};

module.exports.__bind = function (fn, me) {
  return function(){
    return fn.apply(me, arguments);
  };
};

var log = module.exports.log = function() {
  // Only log if available and we're not testing
  if (console && process.env.NODE_ENV !== 'test') {
    console.log(Array.prototype.slice.call(arguments)[0]);
  }
};

module.exports.fail = function (message) {
  log(message);
};

module.exports.optionHtml = function (label, value) {
  return '<tr><td class="optionName">' + label + ':</td><td>' + value + '</td></tr>';
};

var resolveSchema = module.exports.resolveSchema = function (schema) {
  if (_.isPlainObject(schema.schema)) {
    schema = resolveSchema(schema.schema);
  }

  return schema;
};

module.exports.typeFromJsonSchema = function (type, format) {
  var str;

  if (type === 'integer' && format === 'int32') {
    str = 'integer';
  } else if (type === 'integer' && format === 'int64') {
    str = 'long';
  } else if (type === 'integer' && typeof format === 'undefined') {
    str = 'long';
  } else if (type === 'string' && format === 'date-time') {
    str = 'date-time';
  } else if (type === 'string' && format === 'date') {
    str = 'date';
  } else if (type === 'number' && format === 'float') {
    str = 'float';
  } else if (type === 'number' && format === 'double') {
    str = 'double';
  } else if (type === 'number' && typeof format === 'undefined') {
    str = 'double';
  } else if (type === 'boolean') {
    str = 'boolean';
  } else if (type === 'string') {
    str = 'string';
  }

  return str;
};

var simpleRef = module.exports.simpleRef = function (name) {
  if (typeof name === 'undefined') {
    return null;
  }

  if (name.indexOf('#/definitions/') === 0) {
    return name.substring('#/definitions/'.length);
  } else {
    return name;
  }
};

var getStringSignature = module.exports.getStringSignature = function (obj, baseComponent) {
  var str = '';

  if (typeof obj.$ref !== 'undefined') {
    str += simpleRef(obj.$ref);
  } else if (typeof obj.type === 'undefined') {
    str += 'object';
  } else if (obj.type === 'array') {
    if (baseComponent) {
      str += getStringSignature((obj.items || obj.$ref || {}));
    } else {
      str += 'Array[';
      str += getStringSignature((obj.items || obj.$ref || {}));
      str += ']';
    }
  } else if (obj.type === 'integer' && obj.format === 'int32') {
    str += 'integer';
  } else if (obj.type === 'integer' && obj.format === 'int64') {
    str += 'long';
  } else if (obj.type === 'integer' && typeof obj.format === 'undefined') {
    str += 'long';
  } else if (obj.type === 'string' && obj.format === 'date-time') {
    str += 'date-time';
  } else if (obj.type === 'string' && obj.format === 'date') {
    str += 'date';
  } else if (obj.type === 'string' && typeof obj.format === 'undefined') {
    str += 'string';
  } else if (obj.type === 'number' && obj.format === 'float') {
    str += 'float';
  } else if (obj.type === 'number' && obj.format === 'double') {
    str += 'double';
  } else if (obj.type === 'number' && typeof obj.format === 'undefined') {
    str += 'double';
  } else if (obj.type === 'boolean') {
    str += 'boolean';
  } else if (obj.$ref) {
    str += simpleRef(obj.$ref);
  } else {
    str += obj.type;
  }

  return str;
};

}).call(this,require("--process--"),require("--console--"))
},{"--console--":131,"--process--":124,"lodash-compat/lang/isPlainObject":109}],5:[function(require,module,exports){
'use strict';

var helpers = require('./helpers');
var jQuery = {};

/**
 * SwaggerHttp is a wrapper for executing requests
 */
var SwaggerHttp = module.exports = function () {};

SwaggerHttp.prototype.execute = function (obj, opts) {
  var client;

  if(opts && opts.client) {
    client = opts.client;
  }
  else {
    client = {};//new TitaniumHttpClient(opts);
  }

  var success = obj.on.response;

  var responseInterceptor = function(data) {
    if(opts && opts.responseInterceptor) {
      data = opts.responseInterceptor.apply(data);
    }
    success(data);
  };

  obj.on.response = function(data) {
    responseInterceptor(data);
  };


  if (obj && typeof obj.body === 'object') {
    // special processing for file uploads via jquery
    if (obj.body.type && obj.body.type === 'formData'){
      obj.contentType = false;
      obj.processData = false;

      delete obj.headers['Content-Type'];
    } else {
      obj.body = JSON.stringify(obj.body);
    }
  }

  console.log(obj);
  delete obj.useJQuery;
  client.execute(obj);
};

SwaggerHttp.prototype.executej = function (obj) {
  var cb = obj.on;
  var request = obj;

  obj.type = obj.method;
  obj.cache = false;
  delete obj.useJQuery;

  /*
  obj.beforeSend = function (xhr) {
    var key, results;
    if (obj.headers) {
      results = [];
      for (key in obj.headers) {
        if (key.toLowerCase() === 'content-type') {
          results.push(obj.contentType = obj.headers[key]);
        } else if (key.toLowerCase() === 'accept') {
          results.push(obj.accepts = obj.headers[key]);
        } else {
          results.push(xhr.setRequestHeader(key, obj.headers[key]));
        }
      }
      return results;
    }
  };*/

  obj.data = obj.body;

  delete obj.body;

  obj.complete = function (response) {
    var headers = {};
    var headerArray = response.getAllResponseHeaders().split('\n');

    for (var i = 0; i < headerArray.length; i++) {
      var toSplit = headerArray[i].trim();

      if (toSplit.length === 0) {
        continue;
      }

      var separator = toSplit.indexOf(':');

      if (separator === -1) {
        // Name but no value in the header
        headers[toSplit] = null;

        continue;
      }

      var name = toSplit.substring(0, separator).trim();
      var value = toSplit.substring(separator + 1).trim();

      headers[name] = value;
    }

    var out = {
      url: request.url,
      method: request.method,
      status: response.status,
      statusText: response.statusText,
      data: response.responseText,
      headers: headers
    };

    try {
      var possibleObj =  JSON.parse(response.responseText);
      out.obj = (typeof possibleObj === 'string') ? {} : possibleObj;
    } catch (ex) {
      // do not set out.obj
      helpers.log('unable to parse JSON content');
    }

    // I can throw, or parse null?
    out.obj = out.obj || null;

    if (response.status >= 200 && response.status < 300) {
      cb.response(out);
    } else if (response.status === 0 || (response.status >= 400 && response.status < 599)) {
      cb.error(out);
    } else {
      return cb.response(out);
    }
  };

  jQuery.support.cors = true;

  return jQuery.ajax(obj);
};

SwaggerHttp.prototype.executeS = function (obj) {
  var method = obj.method.toLowerCase();

  if (method === 'delete') {
    method = 'del';
  }
  var headers = obj.headers || {};
  var r = request[method](obj.url);
  var name;
  for (name in headers) {
    r.set(name, headers[name]);
  }

  if (obj.body) {
    r.send(obj.body);
  }

  if(typeof r.buffer === 'function') {
    r.buffer(); // force superagent to populate res.text with the raw response data
  }

  r.end(function (err, res) {
    res = res || {
      status: 0,
      headers: {error: 'no response from server'}
    };
    var response = {
      url: obj.url,
      method: obj.method,
      headers: res.headers
    };
    var cb;

    if (!err && res.error) {
      err = res.error;
    }

    if (err && obj.on && obj.on.error) {
      response.obj = err;
      response.status = res ? res.status : 500;
      response.statusText = res ? res.text : err.message;
      cb = obj.on.error;
    } else if (res && obj.on && obj.on.response) {
      var possibleObj;

      // Already parsed by by superagent?
      if(res.body && Object.keys(res.body).length > 0) {
        possibleObj = res.body;
      } else {
          try {
            possibleObj = jsyaml.safeLoad(res.text);
            // can parse into a string... which we don't need running around in the system
            possibleObj = (typeof possibleObj === 'string') ? null : possibleObj;
          } catch(e) {
            helpers.log('cannot parse JSON/YAML content');
          }
      }

      // null means we can't parse into object
      response.obj = possibleObj || null;

      response.status = res.status;
      response.statusText = res.text;
      cb = obj.on.response;
    }
    response.data = response.statusText;

    if (cb) {
      cb(response);
    }
  });
};

},{"./helpers":4}],6:[function(require,module,exports){
'use strict';

var SwaggerHttp = require('./http');

/** 
 * Resolves a spec's remote references
 */
var Resolver = module.exports = function () {};

Resolver.prototype.resolve = function (spec, arg1, arg2, arg3) {
  var root = arg1, callback = arg2, scope = arg3, location, i;
  if(typeof arg1 === 'function') {
    root = null;
    callback = arg1;
    scope = arg2;
  }
  var _root = root;
  this.scope = (scope || this);
  this.iteration = this.iteration || 0;

  var name, path, property, propertyName;
  var processedCalls = 0, resolvedRefs = {}, unresolvedRefs = {};
  var resolutionTable = []; // store objects for dereferencing

  // definitions
  for (name in spec.definitions) {
    var definition = spec.definitions[name];
    for (propertyName in definition.properties) {
      property = definition.properties[propertyName];
      this.resolveTo(root, property, resolutionTable, '/definitions');
    }

    if(definition.allOf) {
      var allOf = definition.allOf;
      // the refs go first
      allOf.sort(function(a, b) {
        if(a.$ref && b.$ref) { return 0; }
        else if(a.$ref) { return -1; }
        else { return 1; }
      });
      for (i = 0; i < allOf.length; i++) {
        property = allOf[i];
        location = '/definitions/' + name + '/allOf';
        this.resolveInline(null, spec, property, resolutionTable, unresolvedRefs, location);
      }
    }
  }

  // operations
  for (name in spec.paths) {
    var method, operation, responseCode;
    path = spec.paths[name];

    for (method in path) {
      // operation reference
      if(method === '$ref') {
        // location = path[method];
        location = '/paths' + name;
        this.resolveInline(root, spec, path, resolutionTable, unresolvedRefs, location);
      }
      else {
        operation = path[method];

        var parameters = operation.parameters;
        for (i in parameters) {
          var parameter = parameters[i];
          location = '/paths' + name + '/' + method + '/parameters';

          if (parameter.in === 'body' && parameter.schema) {
            this.resolveTo(root, parameter.schema, resolutionTable, location);
          }

          if (parameter.$ref) {
            // parameter reference
            this.resolveInline(root, spec, parameter, resolutionTable, unresolvedRefs, parameter.$ref);
          }
        }

        for (responseCode in operation.responses) {
          var response = operation.responses[responseCode];
          location = '/paths' + name + '/' + method + '/responses/' + responseCode;

          if(typeof response === 'object') {
            if(response.$ref) {
              // response reference
              this.resolveInline(root, spec, response, resolutionTable, unresolvedRefs, location);
            }
            if (response.schema) {
              this.resolveTo(root, response.schema, resolutionTable, location);
            }
          }
        }
      }
    }
  }

  var expectedCalls = 0, toResolve = [];
  // if the root is same as obj[i].root we can resolve locally
  var all = resolutionTable;

  for(i = 0; i < all.length; i++) {
    var a = all[i];
    if(root === a.root) {
      if(a.resolveAs === 'ref') {
        // resolve any path walking
        var joined = ((a.root || '') + '/' + a.key).split('/');
        var normalized = [];
        var url = '';
        var k;

        if(a.key.indexOf('../') >= 0) {
          for(var j = 0; j < joined.length; j++) {
            if(joined[j] === '..') {
              normalized = normalized.slice(0, normalized.length-1);
            }
            else {
              normalized.push(joined[j]);
            }
          }
          for(k = 0; k < normalized.length; k ++) {
            if(k > 0) {
              url += '/';
            }
            url += normalized[k];
          }
          // we now have to remote resolve this because the path has changed
          a.root = url;
          toResolve.push(a);
        }
        else {
          var parts = a.key.split('#');
          if(parts.length === 2) {
            if(parts[0].indexOf('http://') === 0 || parts[0].indexOf('https://') === 0) {
              a.root = parts[0];
            }
            location = parts[1].split('/');
            var r;
            var s = spec;
            for(k = 0; k < location.length; k++) {
              var part = location[k];
              if(part !== '') {
                s = s[part];
                if(typeof s !== 'undefined') {
                  r = s;
                }
                else {
                  r = null;
                  break;
                }
              }
            }
            if(r === null) {
              // must resolve this too
              toResolve.push(a);
            }
          }
        }
      }
      else {
        if (a.resolveAs === 'inline') {
          toResolve.push(a);
        }
      }
    }
    else {
      toResolve.push(a);
    }
  }
  expectedCalls = toResolve.length;

  // resolve anything that is local
  for(var ii = 0; ii < toResolve.length; ii++) {
    (function(item, self) {
      if(item.root === null) {
        // local resolve
        self.resolveItem(spec, _root, resolutionTable, resolvedRefs, unresolvedRefs, item);
        processedCalls += 1;

        if(processedCalls === expectedCalls) {
          self.finish(spec, root, resolutionTable, resolvedRefs, unresolvedRefs, callback);
        }
      }
      else {
        var obj = {
          useJQuery: false,  // TODO
          url: item.root,
          method: 'get',
          headers: {
            accept: self.scope.swaggerRequestHeaders || 'application/json'
          },
          on: {
            error: function () {
              processedCalls += 1;
              unresolvedRefs[item.key] = null;

              if (processedCalls === expectedCalls) {
                self.finish(spec, _root, resolutionTable, resolvedRefs, unresolvedRefs, callback);
              }
            },  // jshint ignore:line
            response: function (response) {
              var swagger = response.obj;
              self.resolveItem(swagger, _root, resolutionTable, resolvedRefs, unresolvedRefs, item);
              processedCalls += 1;

              if (processedCalls === expectedCalls) {
                self.finish(spec, _root, resolutionTable, resolvedRefs, unresolvedRefs, callback);
              }
            }
          } // jshint ignore:line
        };

        if (scope && scope.clientAuthorizations) {
          scope.clientAuthorizations.apply(obj);
        }
        new SwaggerHttp().execute(obj);
      }
    }(toResolve[ii], this));
  }

  if (Object.keys(toResolve).length === 0) {
    this.finish(spec, _root, resolutionTable, resolvedRefs, unresolvedRefs, callback);
  }
};

Resolver.prototype.resolveItem = function(spec, root, resolutionTable, resolvedRefs, unresolvedRefs, item) {
  var path = item.location;
  var location = spec, parts = path.split('/');
  for (var j = 0; j < parts.length; j++) {
    var segment = parts[j];
    if(segment.indexOf('~1') !== -1) {
      segment = parts[j].replace(/~0/g, '~').replace(/~1/g, '/');
      if(segment.charAt(0) !== '/') {
        segment = '/' + segment;
      }
    }
    if (typeof location === 'undefined' || location === null) {
      break;
    }
    if(segment === '' && j === (parts.length - 1)  && parts.length > 1) {
      location = null;
      break;
    }
    if (segment.length > 0) {
      location = location[segment];
    }
  }
  var resolved = item.key;
  parts = item.key.split('/');
  var resolvedName = parts[parts.length-1];

  if(resolvedName.indexOf('#') >= 0) {
    resolvedName = resolvedName.split('#')[1];
  }

  if (location !== null && typeof location !== 'undefined') {
    resolvedRefs[resolved] = {
      name: resolvedName,
      obj: location,
      key: item.key,
      root: item.root
    };
  } else {
    unresolvedRefs[resolved] = {
      root: item.root,
      location: item.location
    };
  }
};

Resolver.prototype.finish = function (spec, root, resolutionTable, resolvedRefs, unresolvedRefs, callback) {
  // walk resolution table and replace with resolved refs
  var ref;
  for (ref in resolutionTable) {
    var item = resolutionTable[ref];

    var key = item.key;
    var resolvedTo = resolvedRefs[key];
    if (resolvedTo) {
      spec.definitions = spec.definitions || {};
      if (item.resolveAs === 'ref') {
        spec.definitions[resolvedTo.name] = resolvedTo.obj;
        item.obj.$ref = '#/definitions/' + resolvedTo.name;
      } else if (item.resolveAs === 'inline') {
        var targetObj = item.obj;
        targetObj['x-resolved-from'] = [ item.key ];
        delete targetObj.$ref;

        for (key in resolvedTo.obj) {
          var abs = this.retainRoot(resolvedTo.obj[key], item.root);
          targetObj[key] = abs;
        }
      }
    }
  }
  var existingUnresolved = this.countUnresolvedRefs(spec);

  if(existingUnresolved.length === 0 || this.iteration > 5) {
    this.resolveAllOf(spec.definitions);
    callback.call(this.scope, spec, unresolvedRefs);
  }
  else {
    this.iteration += 1;
    this.resolve(spec, root, callback, this.scope);
  }
};

Resolver.prototype.countUnresolvedRefs = function(spec) {
  var i;
  var refs = this.getRefs(spec);
  var keys = [];
  var unresolvedKeys = [];
  for(i in refs) {
    if(i.indexOf('#') === 0) {
      keys.push(i.substring(1));
    }
    else {
      unresolvedKeys.push(i);
    }
  }

  // verify possible keys
  for(i in keys) {
    var part = keys[i];
    var parts = part.split('/');
    var obj = spec;

    for(var k in parts) {
      var key = parts[k];
      if(key !== '') {
        obj = obj[key];
        if(typeof obj === 'undefined') {
          unresolvedKeys.push(part);
          break;
        }
      }
    }
  }
  return unresolvedKeys.length;
};

Resolver.prototype.getRefs = function(spec, obj) {
  obj = obj || spec;
  var output = {};
  for(var key in obj) {
    var item = obj[key];
    if(key === '$ref' && typeof item === 'string') {
      output[item] = null;
    }
    else if(typeof item === 'object') {
      var o = this.getRefs(item);
      for(var k in o) {
        output[k] = null;
      }
    }
  }
  return output;
};

Resolver.prototype.retainRoot = function(obj, root) {
  // walk object and look for relative $refs
  for(var key in obj) {
    var item = obj[key];
    if(key === '$ref' && typeof item === 'string') {
      // stop and inspect
      if(item.indexOf('http://') !== 0 && item.indexOf('https://') !== 0) {
        if(item.indexOf('#') !== 0) {
          item = '#' + item;
        }
        item = (root || '') + item;
        obj[key] = item;
      }
    }
    else if(typeof item === 'object') {
      this.retainRoot(item, root);
    }
  }
  return obj;
};

/**
 * immediately in-lines local refs, queues remote refs
 * for inline resolution
 */
Resolver.prototype.resolveInline = function (root, spec, property, resolutionTable, unresolvedRefs, location) {
  var key = property.$ref, ref = property.$ref, i, p, p2, rs;
  var rootTrimmed = false;
  if (ref) {
    if(ref.indexOf('../') === 0) {
      // reset root
      p = ref.split('../');
      p2 = root.split('/');
      ref = '';
      for(i = 0; i < p.length; i++) {
        if(p[i] === '') {
          p2 = p2.slice(0, p2.length-1);
        }
        else {
          ref += p[i];
        }
      }
      root = '';
      for(i = 0; i < p2.length - 1; i++) {
        if(i > 0) { root += '/'; }
        root += p2[i];
      }
      rootTrimmed = true;
    }
    if(ref.indexOf('#') >= 0) {
      if(ref.indexOf('/') === 0) {
        rs = ref.split('#');
        p  = root.split('//');
        p2 = p[1].split('/');
        root = p[0] + '//' + p2[0] + rs[0];
        location = rs[1];
      }
      else {
        rs = ref.split('#');
        if(rs[0] !== '') {
          p2 = root.split('/');
          p2 = p2.slice(0, p2.length - 1);
          if(!rootTrimmed) {
            root = '';
            for (var k = 0; k < p2.length; k++) {
              if(k > 0) { root += '/'; }
              root += p2[k];
            }
          }
          root += '/' + ref.split('#')[0];
        }
        location = rs[1];
      }
    }
    if (ref.indexOf('http') === 0) {
      if(ref.indexOf('#') >= 0) {
        root = ref.split('#')[0];
        location = ref.split('#')[1];
      }
      else {
        root = ref;
        location = '';
      }
      resolutionTable.push({obj: property, resolveAs: 'inline', root: root, key: key, location: location});
    } else if (ref.indexOf('#') === 0) {
      location = ref.split('#')[1];
      resolutionTable.push({obj: property, resolveAs: 'inline', root: root, key: key, location: location});
    }
    else {
      resolutionTable.push({obj: property, resolveAs: 'inline', root: root, key: key, location: location});
    }
  } else if (property.type === 'array') {
    this.resolveTo(root, property.items, resolutionTable, location);
  }
};

Resolver.prototype.resolveTo = function (root, property, resolutionTable, location) {
  var ref = property.$ref;

  if (ref) {
    if(ref.indexOf('#') >= 0) {
      location = ref.split('#')[1];
    }
    resolutionTable.push({
      obj: property, resolveAs: 'ref', root: root, key: ref, location: location
    });
  } else if (property.type === 'array') {
    var items = property.items;
    this.resolveTo(root, items, resolutionTable, location);
  }
};

Resolver.prototype.resolveAllOf = function(spec, obj, depth) {
  depth = depth || 0;
  obj = obj || spec;
  var name;
  for(var key in obj) {
    var item = obj[key];
    if(item && typeof item.allOf !== 'undefined') {
      var allOf = item.allOf;
      if(Array.isArray(allOf)) {
        var output = {};
        output['x-composed'] = true;
        for(var i = 0; i < allOf.length; i++) {
          var component = allOf[i];
          var source = 'self';
          if(typeof component['x-resolved-from'] !== 'undefined') {
            source = component['x-resolved-from'][0];
          }

          for(var part in component) {
            if(!output.hasOwnProperty(part)) {
              output[part] = component[part];
              if(part === 'properties') {
                for(name in output[part]) {
                  output[part][name]['x-resolved-from'] = source;
                }
              }
            }
            else {
              if(part === 'properties') {
                var properties = component[part];
                for(name in properties) {
                  output.properties[name] = properties[name];
                  output.properties[name]['x-resolved-from'] = source;
                }
              }
              else if(part === 'required') {
                // merge & dedup the required array
                var a = output.required.concat(component[part]);
                for(var k = 0; k < a.length; ++k) {
                  for(var j = k + 1; j < a.length; ++j) {
                    if(a[k] === a[j]) { a.splice(j--, 1); }
                  }
                }
                output.required = a;
              }
              else if(part === 'x-resolved-from') {
                output['x-resolved-from'].push(source);
              }
              else {
                // TODO: need to merge this property
                // console.log('what to do with ' + part)
              }
            }
          }
        }
        obj[key] = output;
      }
    }
    if(typeof item === 'object') {
      this.resolveAllOf(spec, item, depth + 1);
    }
  }
};

},{"./http":5}],7:[function(require,module,exports){
(function (console){
'use strict';

var SwaggerHttp = require('./http');

var SwaggerSpecConverter = module.exports = function () {
  this.errors = [];
  this.warnings = [];
  this.modelMap = {};
};

SwaggerSpecConverter.prototype.setDocumentationLocation = function (location) {
  this.docLocation = location;
};

/**
 * converts a resource listing OR api declaration
 **/
SwaggerSpecConverter.prototype.convert = function (obj, clientAuthorizations, callback) {
  // not a valid spec
  if(!obj || !Array.isArray(obj.apis)) {
    return this.finish(callback, null);
  }
  this.clientAuthorizations = clientAuthorizations;

  // create a new swagger object to return
  var swagger = { swagger: '2.0' };

  swagger.originalVersion = obj.swaggerVersion;

  // add the info
  this.apiInfo(obj, swagger);

  // add security definitions
  this.securityDefinitions(obj, swagger);

  // take basePath into account
  if (obj.basePath) {
    this.setDocumentationLocation(obj.basePath);
  }

  // take basePath into account
  if (obj.basePath) {
    this.setDocumentationLocation(obj.basePath);
  }

  // see if this is a single-file swagger definition
  var isSingleFileSwagger = false;
  var isCompiledSingleFileSwagger = false;
  var i;
  for(i = 0; i < obj.apis.length; i++) {
    var api = obj.apis[i];
    if(Array.isArray(api.operations)) {
      isSingleFileSwagger = true;
    }
    if (api.apiDeclaration) {
      isCompiledSingleFileSwagger = true;
    }
  }
  if(isSingleFileSwagger) {
    this.declaration(obj, swagger);
    this.finish(callback, swagger);
  } else if (isCompiledSingleFileSwagger) {
    this.resourceListingCompiled(obj, swagger, callback);
  } else {
    this.resourceListing(obj, swagger, callback);
  }
};

SwaggerSpecConverter.prototype.declaration = function(obj, swagger) {
  var name, i, p, pos;
  if(!obj.apis) {
    return;
  }

  if (obj.basePath.indexOf('http://') === 0) {
    p = obj.basePath.substring('http://'.length);
    pos = p.indexOf('/');
    if (pos > 0) {
      swagger.host = p.substring(0, pos);
      swagger.basePath = p.substring(pos);
    }
    else {
      swagger.host = p;
      swagger.basePath = '/';
    }
  } else if (obj.basePath.indexOf('https://') === 0) {
    p = obj.basePath.substring('https://'.length);
    pos = p.indexOf('/');
    if (pos > 0) {
      swagger.host = p.substring(0, pos);
      swagger.basePath = p.substring(pos);
    }
    else {
      swagger.host = p;
      swagger.basePath = '/';
    }
  } else {
    swagger.basePath = obj.basePath;
  }

  var resourceLevelAuth;
  if(obj.authorizations) {
    resourceLevelAuth = obj.authorizations;
  }
  if(obj.consumes) {
    swagger.consumes = obj.consumes;
  }
  if(obj.produces) {
    swagger.produces = obj.produces;
  }

  // build a mapping of id to name for 1.0 model resolutions
  if(typeof obj === 'object') {
    for(name in obj.models) {
      var existingModel = obj.models[name];
      var key = (existingModel.id || name);
      this.modelMap[key] = name;
    }
  }

  for(i = 0; i < obj.apis.length; i++) {
    var api = obj.apis[i];
    var path = api.path;
    var operations = api.operations;
    this.operations(path, obj.resourcePath, operations, resourceLevelAuth, swagger);
  }

  var models = obj.models || {};
  this.models(models, swagger);
};

SwaggerSpecConverter.prototype.models = function(obj, swagger) {
  if(typeof obj !== 'object') {
    return;
  }
  var name;

  swagger.definitions = swagger.definitions || {};
  for(name in obj) {
    var existingModel = obj[name];
    var _enum = [];
    var schema = { properties: {}};
    var propertyName;
    for(propertyName in existingModel.properties) {
      var existingProperty = existingModel.properties[propertyName];
      var property = {};
      this.dataType(existingProperty, property);
      if(existingProperty.description) {
        property.description = existingProperty.description;
      }
      if(existingProperty['enum']) {
        property['enum'] = existingProperty['enum'];
      }
      if(typeof existingProperty.required === 'boolean' && existingProperty.required === true) {
        _enum.push(propertyName);
      }
      if(typeof existingProperty.required === 'string' && existingProperty.required === 'true') {
        _enum.push(propertyName);
      }
      schema.properties[propertyName] = property;
    }
    if(_enum.length > 0) {
      schema['enum'] = _enum;
    }

    schema.required = existingModel.required;
    swagger.definitions[name] = schema;
  }
};

SwaggerSpecConverter.prototype.extractTag = function(resourcePath) {
  var pathString = resourcePath || 'default';
  if(pathString.indexOf('http:') === 0 || pathString.indexOf('https:') === 0) {
    pathString = pathString.split(['/']);
    pathString = pathString[pathString.length -1].substring();
  }
  if(pathString.endsWith('.json')) {
    pathString = pathString.substring(0, pathString.length - '.json'.length);
  }
  return pathString.replace('/','');
};

SwaggerSpecConverter.prototype.operations = function(path, resourcePath, obj, resourceLevelAuth, swagger) {
  if(!Array.isArray(obj)) {
    return;
  }
  var i;

  if(!swagger.paths) {
    swagger.paths = {};
  }

  var pathObj = swagger.paths[path] || {};
  var tag = this.extractTag(resourcePath);
  swagger.tags = swagger.tags || [];
  var matched = false;
  for(i = 0; i < swagger.tags.length; i++) {
    var tagObject = swagger.tags[i];
    if(tagObject.name === tag) {
      matched = true;
    }
  }
  if(!matched) {
    swagger.tags.push({name: tag});
  }

  for(i = 0; i < obj.length; i++) {
    var existingOperation = obj[i];
    var method = (existingOperation.method || existingOperation.httpMethod).toLowerCase();
    var operation = {tags: [tag]};
    var existingAuthorizations = existingOperation.authorizations;

    if(existingAuthorizations && Object.keys(existingAuthorizations).length === 0) {
      existingAuthorizations = resourceLevelAuth;
    }

    if(typeof existingAuthorizations !== 'undefined') {
      var scopesObject;
      for(var key in existingAuthorizations) {
        operation.security = operation.security || [];
        var scopes = existingAuthorizations[key];
        if(scopes) {
          var securityScopes = [];
          for(var j in scopes) {
            securityScopes.push(scopes[j].scope);
          }
          scopesObject = {};
          scopesObject[key] = securityScopes;
          operation.security.push(scopesObject);
        }
        else {
          scopesObject = {};
          scopesObject[key] = [];
          operation.security.push(scopesObject);
        }
      }
    }

    if(existingOperation.consumes) {
      operation.consumes = existingOperation.consumes;
    }
    else if(swagger.consumes) {
      operation.consumes = swagger.consumes;
    }
    if(existingOperation.produces) {
      operation.produces = existingOperation.produces;
    }
    else if(swagger.produces) {
      operation.produces = swagger.produces;
    }
    if(existingOperation.summary) {
      operation.summary = existingOperation.summary;
    }
    if(existingOperation.notes) {
      operation.description = existingOperation.notes;
    }
    if(existingOperation.nickname) {
      operation.operationId = existingOperation.nickname;
    }
    if(existingOperation.deprecated) {
      operation.deprecated = existingOperation.deprecated;
    }

    this.authorizations(existingAuthorizations, swagger);
    this.parameters(operation, existingOperation.parameters, swagger);
    this.responseMessages(operation, existingOperation, swagger);

    pathObj[method] = operation;
  }

  swagger.paths[path] = pathObj;
};

SwaggerSpecConverter.prototype.responseMessages = function(operation, existingOperation) {
  if(typeof existingOperation !== 'object') {
    return;
  }
  // build default response from the operation (1.x)
  var defaultResponse = {};
  this.dataType(existingOperation, defaultResponse);
  // TODO: look into the real problem of rendering responses in swagger-ui
  // ....should reponseType have an implicit schema?
  if(!defaultResponse.schema && defaultResponse.type) {
    defaultResponse = {schema: defaultResponse};
  }

  operation.responses = operation.responses || {};

  // grab from responseMessages (1.2)
  var has200 = false;
  if(Array.isArray(existingOperation.responseMessages)) {
    var i;
    var existingResponses = existingOperation.responseMessages;
    for(i = 0; i < existingResponses.length; i++) {
      var existingResponse = existingResponses[i];
      var response = { description: existingResponse.message };
      if(existingResponse.code === 200) {
        has200 = true;
      }
      // Convert responseModel -> schema{$ref: responseModel}
      if(existingResponse.responseModel) {
        response.schema = {'$ref': existingResponse.responseModel};
      }
      operation.responses['' + existingResponse.code] = response;
    }
  }

  if(has200) {
    operation.responses['default'] = defaultResponse;
  }
  else {
    operation.responses['200'] = defaultResponse;
  }
};

SwaggerSpecConverter.prototype.authorizations = function(obj) {
  // TODO
  if(typeof obj !== 'object') {
    return;
  }
};

SwaggerSpecConverter.prototype.parameters = function(operation, obj) {
  if(!Array.isArray(obj)) {
    return;
  }
  var i;
  for(i = 0; i < obj.length; i++) {
    var existingParameter = obj[i];
    var parameter = {};
    parameter.name = existingParameter.name;
    parameter.description = existingParameter.description;
    parameter.required = existingParameter.required;
    parameter.in = existingParameter.paramType;

    // per #168
    if(parameter.in === 'body') {
      parameter.name = 'body';
    }
    if(parameter.in === 'form') {
      parameter.in = 'formData';
    }

    if(existingParameter.enum) {
      parameter.enum = existingParameter.enum;
    }

    if(existingParameter.allowMultiple === true || existingParameter.allowMultiple === 'true') {
      var innerType = {};
      this.dataType(existingParameter, innerType);
      parameter.type = 'array';
      parameter.items = innerType;

      if(existingParameter.allowableValues) {
        var av = existingParameter.allowableValues;
        if(av.valueType === 'LIST') {
          parameter['enum'] = av.values;
        }
      }
    }
    else {
      this.dataType(existingParameter, parameter);
    }

    operation.parameters = operation.parameters || [];
    operation.parameters.push(parameter);
  }
};

SwaggerSpecConverter.prototype.dataType = function(source, target) {
  if(typeof source !== 'object') {
    return;
  }

  if(source.minimum) {
    target.minimum = source.minimum;
  }
  if(source.maximum) {
    target.maximum = source.maximum;
  }

  // default can be 'false'
  if(typeof source.defaultValue !== 'undefined') {
    target.default = source.defaultValue;
  }

  var jsonSchemaType = this.toJsonSchema(source);
  if(jsonSchemaType) {
    target = target || {};
    if(jsonSchemaType.type) {
      target.type = jsonSchemaType.type;
    }
    if(jsonSchemaType.format) {
      target.format = jsonSchemaType.format;
    }
    if(jsonSchemaType.$ref) {
      target.schema = {$ref: jsonSchemaType.$ref};
    }
    if(jsonSchemaType.items) {
      target.items = jsonSchemaType.items;
    }
  }
};

SwaggerSpecConverter.prototype.toJsonSchema = function(source) {
  if(!source) {
    return 'object';
  }
  var detectedType = (source.type || source.dataType || source.responseClass || '');
  var lcType = detectedType.toLowerCase();
  var format = (source.format || '').toLowerCase();

  if(lcType.indexOf('list[') === 0) {
    var innerType = detectedType.substring(5, detectedType.length - 1);
    var jsonType = this.toJsonSchema({type: innerType});
    return {type: 'array', items: jsonType};
  }
  else if(lcType === 'int' || (lcType === 'integer' && format === 'int32'))
    {return {type: 'integer', format: 'int32'};}
  else if(lcType === 'long' || (lcType === 'integer' && format === 'int64'))
    {return {type: 'integer', format: 'int64'};}
  else if(lcType === 'integer')
    {return {type: 'integer', format: 'int64'};}
  else if(lcType === 'float' || (lcType === 'number' && format === 'float'))
    {return {type: 'number', format: 'float'};}
  else if(lcType === 'double' || (lcType === 'number' && format === 'double'))
    {return {type: 'number', format: 'double'};}
  else if((lcType === 'string' && format === 'date-time') || (lcType === 'date'))
    {return {type: 'string', format: 'date-time'};}
  else if(lcType === 'string')
    {return {type: 'string'};}
  else if(lcType === 'file')
    {return {type: 'file'};}
  else if(lcType === 'boolean')
    {return {type: 'boolean'};}
  else if(lcType === 'array' || lcType === 'list') {
    if(source.items) {
      var it = this.toJsonSchema(source.items);
      return {type: 'array', items: it};
    }
    else {
      return {type: 'array', items: {type: 'object'}};
    }
  }
  else if(source.$ref) {
    return {$ref: '#/definitions/' + this.modelMap[source.$ref] || source.$ref};
  }
  else if(lcType === 'void' || lcType === '')
    {return {};}
  else {
    return {$ref: '#/definitions/' + this.modelMap[source.type] || source.type};
  }
};

SwaggerSpecConverter.prototype.resourceListing = function(obj, swagger, callback) {
  var i;
  var processedCount = 0;   // jshint ignore:line
  var self = this;          // jshint ignore:line
  var expectedCount = obj.apis.length;
  var _swagger = swagger;   // jshint ignore:line

  if(expectedCount === 0) {
    this.finish(callback, swagger);
  }

  for(i = 0; i < expectedCount; i++) {
    var api = obj.apis[i];
    var path = api.path;
    var absolutePath = this.getAbsolutePath(obj.swaggerVersion, this.docLocation, path);

    if(api.description) {
      swagger.tags = swagger.tags || [];
      swagger.tags.push({
        name : this.extractTag(api.path),
        description : api.description || ''
      });
    }
    var http = {
      url: absolutePath,
      headers: {accept: 'application/json'},
      on: {},
      method: 'get'
    };
    /* jshint ignore:start */
    http.on.response = function(data) {
      processedCount += 1;
      var obj = data.obj;
      if(obj) {
        self.declaration(obj, _swagger);
      }
      if(processedCount === expectedCount) {
        self.finish(callback, _swagger);
      }
    };
    http.on.error = function(data) {
      console.error(data);
      processedCount += 1;
      if(processedCount === expectedCount) {
        self.finish(callback, _swagger);
      }
    };
    /* jshint ignore:end */

    if(this.clientAuthorizations && typeof this.clientAuthorizations.apply === 'function') {
      this.clientAuthorizations.apply(http);
    }

    new SwaggerHttp().execute(http);
  }
};

SwaggerSpecConverter.prototype.resourceListingCompiled = function(obj, swagger, callback) {
  var i;
  var processedCount = 0;   // jshint ignore:line
  var self = this;          // jshint ignore:line
  var expectedCount = obj.apis.length;
  var _swagger = swagger;   // jshint ignore:line

  if(expectedCount === 0) {
    this.finish(callback, swagger);
  }

  for(i = 0; i < expectedCount; i++) {
    var api = obj.apis[i];
    var path = api.path;

    if(api.description) {
      swagger.tags = swagger.tags || [];
      swagger.tags.push({
        name : this.extractTag(api.path),
        description : api.description || ''
      });
    }
      
    processedCount += 1;
    self.declaration(api.apiDeclaration, _swagger);
  }
  self.finish(callback, _swagger);
};

SwaggerSpecConverter.prototype.getAbsolutePath = function(version, docLocation, path)  {
  if(version === '1.0') {
    if(docLocation.endsWith('.json')) {
      // get root path
      var pos = docLocation.lastIndexOf('/');
      if(pos > 0) {
        docLocation = docLocation.substring(0, pos);
      }
    }
  }

  var location = docLocation;
  if(path.indexOf('http://') === 0 || path.indexOf('https://') === 0) {
    location = path;
  }
  else {
    if(docLocation.endsWith('/')) {
      location = docLocation.substring(0, docLocation.length - 1);
    }
    location += path;
  }
  location = location.replace('{format}', 'json');
  return location;
};

SwaggerSpecConverter.prototype.securityDefinitions = function(obj, swagger) {
  if(obj.authorizations) {
    var name;
    for(name in obj.authorizations) {
      var isValid = false;
      var securityDefinition = {};
      var definition = obj.authorizations[name];
      if(definition.type === 'apiKey') {
        securityDefinition.type = 'apiKey';
        securityDefinition.in = definition.passAs;
        securityDefinition.name = definition.keyname || name;
        isValid = true;
      }
      else if(definition.type === 'oauth2') {
        var existingScopes = definition.scopes || [];
        var scopes = {};
        var i;
        for(i in existingScopes) {
          var scope = existingScopes[i];
          scopes[scope.scope] = scope.description;
        }
        securityDefinition.type = 'oauth2';
        if(i > 0) {
          securityDefinition.scopes = scopes;
        }
        if(definition.grantTypes) {
          if(definition.grantTypes.implicit) {
            var implicit = definition.grantTypes.implicit;
            securityDefinition.flow = 'implicit';
            securityDefinition.authorizationUrl = implicit.loginEndpoint;
            isValid = true;
          }
          /* jshint ignore:start */
          if(definition.grantTypes['authorization_code']) {
            if(!securityDefinition.flow) {
              // cannot set if flow is already defined
              var authCode = definition.grantTypes['authorization_code'];
              securityDefinition.flow = 'accessCode';
              securityDefinition.authorizationUrl = authCode.tokenRequestEndpoint.url;
              securityDefinition.tokenUrl = authCode.tokenEndpoint.url;
              isValid = true;
            }
          }
          /* jshint ignore:end */
        }
      }
      if(isValid) {
        swagger.securityDefinitions = swagger.securityDefinitions || {};
        swagger.securityDefinitions[name] = securityDefinition;
      }
    }
  }
};

SwaggerSpecConverter.prototype.apiInfo = function(obj, swagger) {
  // info section
  if(obj.info) {
    var info = obj.info;
    swagger.info = {};

    if(info.contact) {
      swagger.info.contact = {};
      swagger.info.contact.email = info.contact;
    }
    if(info.description) {
      swagger.info.description = info.description;
    }
    if(info.title) {
      swagger.info.title = info.title;
    }
    if(info.termsOfServiceUrl) {
      swagger.info.termsOfService = info.termsOfServiceUrl;
    }
    if(info.license || info.licenseUrl) {
      swagger.license = {};
      if(info.license) {
        swagger.license.name = info.license;
      }
      if(info.licenseUrl) {
        swagger.license.url = info.licenseUrl;
      }
    }
  }
  else {
    this.warnings.push('missing info section');
  }
};

SwaggerSpecConverter.prototype.finish = function (callback, obj) {
  callback(obj);
};

}).call(this,require("--console--"))
},{"--console--":131,"./http":5}],8:[function(require,module,exports){
'use strict';

var _ = {
  cloneDeep: require('lodash-compat/lang/cloneDeep'),
  forEach: require('lodash-compat/collection/forEach'),
  indexOf: require('lodash-compat/array/indexOf'),
  isArray: require('lodash-compat/lang/isArray'),
  isPlainObject: require('lodash-compat/lang/isPlainObject'),
  isString: require('lodash-compat/lang/isString'),
  isUndefined: require('lodash-compat/lang/isUndefined'),
  keys: require('lodash-compat/object/keys'),
  map: require('lodash-compat/collection/map')
};
var helpers = require('../helpers');

var Model = module.exports = function (name, definition, models, modelPropertyMacro) {
  this.definition = definition || {};
  this.isArray = definition.type === 'array';
  this.models = models || {};
  this.name = definition.title || name || 'Inline Model';
  this.modelPropertyMacro = modelPropertyMacro || function (property) {
    return property.default;
  };

  return this;
};

var schemaToHTML = function (name, schema, models, modelPropertyMacro) {
  var strongOpen = '<span class="strong">';
  var strongClose = '</span>';
  var references = {};
  var seenModels = [];
  var inlineModels = 0;
  var addReference = function (schema, name, skipRef) {
    var modelName = name;
    var model;

    if (schema.$ref) {
      modelName = schema.title || helpers.simpleRef(schema.$ref);
      model = models[modelName];
    } else if (_.isUndefined(name)) {
      modelName = schema.title || 'Inline Model ' + (++inlineModels);
      model = new Model(modelName, schema, models, modelPropertyMacro);
    }

    if (skipRef !== true) {
      references[modelName] = _.isUndefined(model) ? {} : model.definition;
    }

    return modelName;
  };

  var primitiveToHTML = function (schema) {
    var html = '<span class="propType">';
    var type = schema.type || 'object';

    if (schema.$ref) {
      html += addReference(schema, helpers.simpleRef(schema.$ref));
    } else if (type === 'object') {
      if (!_.isUndefined(schema.properties)) {
        html += addReference(schema);
      } else {
        html += 'object';
      }
    } else if (type === 'array') {
      html += 'Array[';

      if (_.isArray(schema.items)) {
        html += _.map(schema.items, addReference).join(',');
      } else if (_.isPlainObject(schema.items)) {
        if (_.isUndefined(schema.items.$ref)) {
          if (!_.isUndefined(schema.items.type) && _.indexOf(['array', 'object'], schema.items.type) === -1) {
            html += schema.items.type;
          } else {
            html += addReference(schema.items);
          }
        } else {
          html += addReference(schema.items, helpers.simpleRef(schema.items.$ref));
        }
      } else {
        helpers.log('Array type\'s \'items\' schema is not an array or an object, cannot process');
        html += 'object';
      }

      html += ']';
    } else {
      html += schema.type;
    }

    html += '</span>';

    return html;
  };
  var primitiveToOptionsHTML = function (schema, html) {
    var options = '';
    var type = schema.type || 'object';
    var isArray = type === 'array';

    if (isArray) {
      if (_.isPlainObject(schema.items) && !_.isUndefined(schema.items.type)) {
        type = schema.items.type;
      } else {
        type = 'object';
      }
    }

    if (!_.isUndefined(schema.default)) {
      options += helpers.optionHtml('Default', schema.default);
    }

    switch (type) {
    case 'string':
      if (schema.minLength) {
        options += helpers.optionHtml('Min. Length', schema.minLength);
      }

      if (schema.maxLength) {
        options += helpers.optionHtml('Max. Length', schema.maxLength);
      }

      if (schema.pattern) {
        options += helpers.optionHtml('Reg. Exp.', schema.pattern);
      }
      break;
    case 'integer':
    case 'number':
      if (schema.minimum) {
        options += helpers.optionHtml('Min. Value', schema.minimum);
      }

      if (schema.exclusiveMinimum) {
        options += helpers.optionHtml('Exclusive Min.', 'true');
      }

      if (schema.maximum) {
        options += helpers.optionHtml('Max. Value', schema.maximum);
      }

      if (schema.exclusiveMaximum) {
        options += helpers.optionHtml('Exclusive Max.', 'true');
      }

      if (schema.multipleOf) {
        options += helpers.optionHtml('Multiple Of', schema.multipleOf);
      }

      break;
    }

    if (isArray) {
      if (schema.minItems) {
        options += helpers.optionHtml('Min. Items', schema.minItems);
      }

      if (schema.maxItems) {
        options += helpers.optionHtml('Max. Items', schema.maxItems);
      }

      if (schema.uniqueItems) {
        options += helpers.optionHtml('Unique Items', 'true');
      }

      if (schema.collectionFormat) {
        options += helpers.optionHtml('Coll. Format', schema.collectionFormat);
      }
    }

    if (_.isUndefined(schema.items)) {
      if (_.isArray(schema.enum)) {
        var enumString;

        if (type === 'number' || type === 'integer') {
          enumString = schema.enum.join(', ');
        } else {
          enumString = '"' + schema.enum.join('", "') + '"';
        }

        options += helpers.optionHtml('Enum', enumString);
      }
    }

    if (options.length > 0) {
      html = '<span class="propWrap">' + html + '<table class="optionsWrapper"><tr><th colspan="2">' + type + '</th></tr>' + options + '</table></span>';
    }

    return html;
  };
  var processModel = function (schema, name) {
    var type = schema.type || 'object';
    var isArray = schema.type === 'array';
    var html = strongOpen + name + ' ' + (isArray ? '[' : '{') + strongClose;

    if (name) {
      seenModels.push(name);
    }

    if (isArray) {
      if (_.isArray(schema.items)) {
        html += '<div>' + _.map(schema.items, function (item) {
          var type = item.type || 'object';

          if (_.isUndefined(item.$ref)) {
            if (_.indexOf(['array', 'object'], type) > -1) {
              if (type === 'object' && _.isUndefined(item.properties)) {
                return 'object';
              } else {
                return addReference(item);
              }
            } else {
              return primitiveToOptionsHTML(item, type);
            }
          } else {
            return addReference(item, helpers.simpleRef(item.$ref));
          }
        }).join(',</div><div>');
      } else if (_.isPlainObject(schema.items)) {
        if (_.isUndefined(schema.items.$ref)) {
          if (_.indexOf(['array', 'object'], schema.items.type || 'object') > -1) {
            if ((_.isUndefined(schema.items.type) || schema.items.type === 'object') && _.isUndefined(schema.items.properties)) {
              html += '<div>object</div>';
            } else {
              html += '<div>' + addReference(schema.items) + '</div>';
            }
          } else {
            html += '<div>' + primitiveToOptionsHTML(schema.items, schema.items.type) + '</div>';
          }
        } else {
          html += '<div>' + addReference(schema.items, helpers.simpleRef(schema.items.$ref)) + '</div>';
        }
      } else {
        helpers.log('Array type\'s \'items\' property is not an array or an object, cannot process');
        html += '<div>object</div>';
      }
    } else {
      if (schema.$ref) {
        html += '<div>' + addReference(schema, name) + '</div>';
      } else if (type === 'object') {
        html += '<div>';

        if (_.isPlainObject(schema.properties)) {
          html += _.map(schema.properties, function (property, name) {
            var propertyIsRequired = (_.indexOf(schema.required, name) >= 0);
            var cProperty = _.cloneDeep(property);

            var requiredClass = propertyIsRequired ? 'required' : '';
            var html = '<span class="propName ' + requiredClass + '">' + name + '</span> (';
            var model;

            // Allow macro to set the default value
            cProperty.default = modelPropertyMacro(cProperty);

            // Resolve the schema (Handle nested schemas)
            cProperty = helpers.resolveSchema(cProperty);

            // We need to handle property references to primitives (Issue 339)
            if (!_.isUndefined(cProperty.$ref)) {
              model = models[helpers.simpleRef(cProperty.$ref)];

              if (!_.isUndefined(model) && _.indexOf([undefined, 'array', 'object'], model.definition.type) === -1) {
                // Use referenced schema
                cProperty = helpers.resolveSchema(model.definition);
              }
            }

            html += primitiveToHTML(cProperty);

            if(!propertyIsRequired) {
              html += ', <span class="propOptKey">optional</span>';
            }

            html += ')';

            if (!_.isUndefined(cProperty.description)) {
              html += ': ' + '<span class="propDesc">' + cProperty.description + '</span>';
            }

            if (cProperty.enum) {
              html += ' = <span class="propVals">[\'' + cProperty.enum.join('\', \'') + '\']</span>';
            }

            return primitiveToOptionsHTML(cProperty, html);
          }).join(',</div><div>');
        }

        html += '</div>';
      } else {
        html += '<div>' + primitiveToOptionsHTML(schema, type) + '</div>';
      }
    }

    return html + strongOpen + (isArray ? ']' : '}') + strongClose;
  };

  // Resolve the schema (Handle nested schemas)
  schema = helpers.resolveSchema(schema);

  // Generate current HTML
  var html = processModel(schema, name);

  // Generate references HTML
  while (_.keys(references).length > 0) {
    /* jshint ignore:start */
    _.forEach(references, function (schema, name) {
      var seenModel = _.indexOf(seenModels, name) > -1;

      delete references[name];

      if (!seenModel) {
        seenModels.push(name);

        html += '<br />' + processModel(schema, name);
      }
    });
    /* jshint ignore:end */
  }

  return html;
};

var schemaToJSON = function (schema, models, modelsToIgnore, modelPropertyMacro) {
  // Resolve the schema (Handle nested schemas)
  schema = helpers.resolveSchema(schema);

  var type = schema.type || 'object';
  var format = schema.format;
  var model;
  var output;

  if (schema.example) {
    output = schema.example;
  } else if (_.isUndefined(schema.items) && _.isArray(schema.enum)) {
    output = schema.enum[0];
  }

  if (_.isUndefined(output)) {
    if (schema.$ref) {
      model = models[helpers.simpleRef(schema.$ref)];

      if (!_.isUndefined(model)) {
        if (_.isUndefined(modelsToIgnore[model.name])) {
          modelsToIgnore[model.name] = model;
          output = schemaToJSON(model.definition, models, modelsToIgnore, modelPropertyMacro);
          delete modelsToIgnore[model.name];
        } else {
          if (model.type === 'array') {
            output = [];
          } else {
            output = {};
          }
        }
      }
    } else if (!_.isUndefined(schema.default)) {
      output = schema.default;
    } else if (type === 'string') {
      if (format === 'date-time') {
        output = new Date().toISOString();
      } else if (format === 'date') {
        output = new Date().toISOString().split('T')[0];
      } else {
        output = 'string';
      }
    } else if (type === 'integer') {
      output = 0;
    } else if (type === 'number') {
      output = 0.0;
    } else if (type === 'boolean') {
      output = true;
    } else if (type === 'object') {
      output = {};

      _.forEach(schema.properties, function (property, name) {
        var cProperty = _.cloneDeep(property);

        // Allow macro to set the default value
        cProperty.default = modelPropertyMacro(property);

        output[name] = schemaToJSON(cProperty, models, modelsToIgnore, modelPropertyMacro);
      });
    } else if (type === 'array') {
      output = [];

      if (_.isArray(schema.items)) {
        _.forEach(schema.items, function (item) {
          output.push(schemaToJSON(item, models, modelsToIgnore, modelPropertyMacro));
        });
      } else if (_.isPlainObject(schema.items)) {
        output.push(schemaToJSON(schema.items, models, modelsToIgnore, modelPropertyMacro));
      } else if (_.isUndefined(schema.items)) {
        output.push({});
      } else {
        helpers.log('Array type\'s \'items\' property is not an array or an object, cannot process');
      }
    }
  }

  return output;
};

Model.prototype.createJSONSample = Model.prototype.getSampleValue = function (modelsToIgnore) {
  modelsToIgnore = modelsToIgnore || {};

  modelsToIgnore[this.name] = this;

  // Response support
  if (this.examples && _.isPlainObject(this.examples) && this.examples['application/json']) {
    this.definition.example = this.examples['application/json'];

  } else if (!this.definition.example) {
    this.definition.example = this.examples;
  }

  return schemaToJSON(this.definition, this.models, modelsToIgnore, this.modelPropertyMacro);
};

Model.prototype.getMockSignature = function () {
  return schemaToHTML(this.name, this.definition, this.models, this.modelPropertyMacro);
};

},{"../helpers":4,"lodash-compat/array/indexOf":11,"lodash-compat/collection/forEach":16,"lodash-compat/collection/map":18,"lodash-compat/lang/cloneDeep":102,"lodash-compat/lang/isArray":104,"lodash-compat/lang/isPlainObject":109,"lodash-compat/lang/isString":110,"lodash-compat/lang/isUndefined":112,"lodash-compat/object/keys":113}],9:[function(require,module,exports){
'use strict';

var _ = {
  cloneDeep: require('lodash-compat/lang/cloneDeep'),
  isUndefined: require('lodash-compat/lang/isUndefined'),
  isEmpty: require('lodash-compat/lang/isEmpty')
};
var helpers = require('../helpers');
var Model = require('./model');
var SwaggerHttp = require('../http');

var Operation = module.exports = function (parent, scheme, operationId, httpMethod, path, args, definitions, models, clientAuthorizations) {
  var errors = [];

  parent = parent || {};
  args = args || {};

  if(parent && parent.options) {
    this.client = parent.options.client || null;
    this.responseInterceptor = parent.options.responseInterceptor || null;
  }
  this.authorizations = args.security;
  this.basePath = parent.basePath || '/';
  this.clientAuthorizations = clientAuthorizations;
  this.consumes = args.consumes || parent.consumes || ['application/json'];
  this.produces = args.produces || parent.produces || ['application/json'];
  this.deprecated = args.deprecated;
  this.description = args.description;
  this.host = parent.host || 'localhost';
  this.method = (httpMethod || errors.push('Operation ' + operationId + ' is missing method.'));
  this.models = models || {};
  this.nickname = (operationId || errors.push('Operations must have a nickname.'));
  this.operation = args;
  this.operations = {};
  this.parameters = args !== null ? (args.parameters || []) : {};
  this.parent = parent;
  this.path = (path || errors.push('Operation ' + this.nickname + ' is missing path.'));
  this.responses = (args.responses || {});
  this.scheme = scheme || parent.scheme || 'http';
  this.schemes = parent.schemes;
  this.security = args.security;
  this.summary = args.summary || '';
  this.type = null;
  this.useJQuery = parent.useJQuery;
  this.parameterMacro = parent.parameterMacro || function (parameter) {
    return parameter.default;
  };

  this.inlineModels = [];

  if (typeof this.deprecated === 'string') {
    switch(this.deprecated.toLowerCase()) {
      case 'true': case 'yes': case '1': {
        this.deprecated = true;
        break;
      }

      case 'false': case 'no': case '0': case null: {
        this.deprecated = false;
        break;
      }

      default: this.deprecated = Boolean(this.deprecated);
    }
  }

  var i, model;

  if (definitions) {
    // add to global models
    var key;

    for (key in definitions) {
      model = new Model(key, definitions[key], this.models, parent.modelPropertyMacro);

      if (model) {
        this.models[key] = model;
      }
    }
  }

  for (i = 0; i < this.parameters.length; i++) {
    var param = this.parameters[i];

    // Allow macro to set the default value
    param.default = this.parameterMacro(param);

    if (param.type === 'array') {
      param.isList = true;
      param.allowMultiple = true;
      // the enum can be defined at the items level
      if (param.items && param.items.enum) {
        param['enum'] = param.items.enum;
      }
    }

    var innerType = this.getType(param);

    if (innerType && innerType.toString().toLowerCase() === 'boolean') {
      param.allowableValues = {};
      param.isList = true;
      param['enum'] = [true, false]; // use actual primitives
    }

    if (typeof param['enum'] !== 'undefined') {
      var id;

      param.allowableValues = {};
      param.allowableValues.values = [];
      param.allowableValues.descriptiveValues = [];

      for (id = 0; id < param['enum'].length; id++) {
        var value = param['enum'][id];
        var isDefault = (value === param.default || value+'' === param.default);

        param.allowableValues.values.push(value);
        // Always have string for descriptive values....
        param.allowableValues.descriptiveValues.push({value : value+'', isDefault: isDefault});
      }
    }

    if (param.type === 'array') {
      innerType = [innerType];

      if (typeof param.allowableValues === 'undefined') {
        // can't show as a list if no values to select from
        delete param.isList;
        delete param.allowMultiple;
      }
    }

    param.signature = this.getModelSignature(innerType, this.models).toString();
    param.sampleJSON = this.getModelSampleJSON(innerType, this.models);
    param.responseClassSignature = param.signature;
  }

  var defaultResponseCode, response, responses = this.responses;

  if (responses['200']) {
    response = responses['200'];
    defaultResponseCode = '200';
  } else if (responses['201']) {
    response = responses['201'];
    defaultResponseCode = '201';
  } else if (responses['202']) {
    response = responses['202'];
    defaultResponseCode = '202';
  } else if (responses['203']) {
    response = responses['203'];
    defaultResponseCode = '203';
  } else if (responses['204']) {
    response = responses['204'];
    defaultResponseCode = '204';
  } else if (responses['205']) {
    response = responses['205'];
    defaultResponseCode = '205';
  } else if (responses['206']) {
    response = responses['206'];
    defaultResponseCode = '206';
  } else if (responses['default']) {
    response = responses['default'];
    defaultResponseCode = 'default';
  }

  if (response && response.schema) {
    var resolvedModel = this.resolveModel(response.schema, definitions);
    var successResponse;

    delete responses[defaultResponseCode];

    if (resolvedModel) {
      this.successResponse = {};
      successResponse = this.successResponse[defaultResponseCode] = resolvedModel;
    } else if (!response.schema.type || response.schema.type === 'object' || response.schema.type === 'array') {
      // Inline model
      this.successResponse = {};
      successResponse = this.successResponse[defaultResponseCode] = new Model(undefined, response.schema || {}, this.models, parent.modelPropertyMacro);
    } else {
      // Primitive
      this.successResponse = {};
      successResponse = this.successResponse[defaultResponseCode] = response.schema;
    }

    if (successResponse) {
      // Attach response properties
      if (response.description) {
        successResponse.description = response.description;
      }

      if (response.examples) {
        successResponse.examples = response.examples;
      }

      if (response.headers) {
        successResponse.headers = response.headers;
      }
    }

    this.type = response;
  }

  if (errors.length > 0) {
    if (this.resource && this.resource.api && this.resource.api.fail) {
      this.resource.api.fail(errors);
    }
  }

  return this;
};

Operation.prototype.isDefaultArrayItemValue = function(value, param) {
  if (param.default && Array.isArray(param.default)) {
    return param.default.indexOf(value) !== -1;
  }
  return value === param.default;
};

Operation.prototype.getType = function (param) {
  var type = param.type;
  var format = param.format;
  var isArray = false;
  var str;

  if (type === 'integer' && format === 'int32') {
    str = 'integer';
  } else if (type === 'integer' && format === 'int64') {
    str = 'long';
  } else if (type === 'integer') {
    str = 'integer';
  } else if (type === 'string') {
    if (format === 'date-time') {
      str = 'date-time';
    } else if (format === 'date') {
      str = 'date';
    } else {
      str = 'string';
    }
  } else if (type === 'number' && format === 'float') {
    str = 'float';
  } else if (type === 'number' && format === 'double') {
    str = 'double';
  } else if (type === 'number') {
    str = 'double';
  } else if (type === 'boolean') {
    str = 'boolean';
  } else if (type === 'array') {
    isArray = true;

    if (param.items) {
      str = this.getType(param.items);
    }
  }

  if (param.$ref) {
    str = helpers.simpleRef(param.$ref);
  }

  var schema = param.schema;

  if (schema) {
    var ref = schema.$ref;

    if (ref) {
      ref = helpers.simpleRef(ref);

      if (isArray) {
        return [ ref ];
      } else {
        return ref;
      }
    } else {
      // If inline schema, we add it our interal hash -> which gives us it's ID (int)
      if(schema.type === 'object') {
        return this.addInlineModel(schema);
      }
      return this.getType(schema);
    }
  }
  if (isArray) {
    return [ str ];
  } else {
    return str;
  }
};

/**
 * adds an inline schema (model) to a hash, where we can ref it later
 * @param {object} schema a schema
 * @return {number} the ID of the schema being added, or null
 **/
Operation.prototype.addInlineModel = function (schema) {
  var len = this.inlineModels.length;
  var model = this.resolveModel(schema, {});
  if(model) {
    this.inlineModels.push(model);
    return 'Inline Model '+len; // return string ref of the inline model (used with #getInlineModel)
  }
  return null; // report errors?
};

/**
 * gets the internal ref to an inline model
 * @param {string} inline_str a string reference to an inline model
 * @return {Model} the model being referenced. Or null
 **/
Operation.prototype.getInlineModel = function(inlineStr) {
  if(/^Inline Model \d+$/.test(inlineStr)) {
    var id = parseInt(inlineStr.substr('Inline Model'.length).trim(),10); //
    var model = this.inlineModels[id];
    return model;
  }
  // I'm returning null here, should I rather throw an error?
  return null;
};

Operation.prototype.resolveModel = function (schema, definitions) {
  if (typeof schema.$ref !== 'undefined') {
    var ref = schema.$ref;

    if (ref.indexOf('#/definitions/') === 0) {
      ref = ref.substring('#/definitions/'.length);
    }

    if (definitions[ref]) {
      return new Model(ref, definitions[ref], this.models, this.parent.modelPropertyMacro);
    }
  // schema must at least be an object to get resolved to an inline Model
  } else if (schema && typeof schema === 'object' &&
            (schema.type === 'object' || _.isUndefined(schema.type))) {
    return new Model(undefined, schema, this.models, this.parent.modelPropertyMacro);
  }

  return null;
};

Operation.prototype.help = function (dontPrint) {
  var out = this.nickname + ': ' + this.summary + '\n';

  for (var i = 0; i < this.parameters.length; i++) {
    var param = this.parameters[i];
    var typeInfo = param.signature;

    out += '\n  * ' + param.name + ' (' + typeInfo + '): ' + param.description;
  }

  if (typeof dontPrint === 'undefined') {
    helpers.log(out);
  }

  return out;
};

Operation.prototype.getModelSignature = function (type, definitions) {
  var isPrimitive, listType;

  if (type instanceof Array) {
    listType = true;
    type = type[0];
  }

  // Convert undefined to string of 'undefined'
  if (typeof type === 'undefined') {
    type = 'undefined';
    isPrimitive = true;

  } else if (definitions[type]){
    // a model def exists?
    type = definitions[type]; /* Model */
    isPrimitive = false;

  } else if (this.getInlineModel(type)) {
    type = this.getInlineModel(type); /* Model */
    isPrimitive = false;

  } else {
    // We default to primitive
    isPrimitive = true;
  }

  if (isPrimitive) {
    if (listType) {
      return 'Array[' + type + ']';
    } else {
      return type.toString();
    }
  } else {
    if (listType) {
      return 'Array[' + type.getMockSignature() + ']';
    } else {
      return type.getMockSignature();
    }
  }
};

Operation.prototype.supportHeaderParams = function () {
  return true;
};

Operation.prototype.supportedSubmitMethods = function () {
  return this.parent.supportedSubmitMethods;
};

Operation.prototype.getHeaderParams = function (args) {
  var headers = this.setContentTypes(args, {});

  for (var i = 0; i < this.parameters.length; i++) {
    var param = this.parameters[i];

    if (typeof args[param.name] !== 'undefined') {
      if (param.in === 'header') {
        var value = args[param.name];

        if (Array.isArray(value)) {
          value = value.toString();
        }

        headers[param.name] = value;
      }
    }
  }

  return headers;
};

Operation.prototype.urlify = function (args) {
  var formParams = {};
  var requestUrl = this.path;
  var querystring = ''; // grab params from the args, build the querystring along the way

  for (var i = 0; i < this.parameters.length; i++) {
    var param = this.parameters[i];

    if (typeof args[param.name] !== 'undefined') {
      if (param.in === 'path') {
        var reg = new RegExp('\{' + param.name + '\}', 'gi');
        var value = args[param.name];

        if (Array.isArray(value)) {
          value = this.encodePathCollection(param.collectionFormat, param.name, value);
        } else {
          value = this.encodePathParam(value);
        }

        requestUrl = requestUrl.replace(reg, value);
      } else if (param.in === 'query' && typeof args[param.name] !== 'undefined') {
        if (querystring === '') {
          querystring += '?';
        } else {
          querystring += '&';
        }

        if (typeof param.collectionFormat !== 'undefined') {
          var qp = args[param.name];

          if (Array.isArray(qp)) {
            querystring += this.encodeQueryCollection(param.collectionFormat, param.name, qp);
          } else {
            querystring += this.encodeQueryParam(param.name) + '=' + this.encodeQueryParam(args[param.name]);
          }
        } else {
          querystring += this.encodeQueryParam(param.name) + '=' + this.encodeQueryParam(args[param.name]);
        }
      } else if (param.in === 'formData') {
        formParams[param.name] = args[param.name];
      }
    }
  }
  var url = this.scheme + '://' + this.host;

  if (this.basePath !== '/') {
    url += this.basePath;
  }
  return url + requestUrl + querystring;
};

Operation.prototype.getMissingParams = function (args) {
  var missingParams = []; // check required params, track the ones that are missing
  var i;

  for (i = 0; i < this.parameters.length; i++) {
    var param = this.parameters[i];

    if (param.required === true) {
      if (typeof args[param.name] === 'undefined') {
        missingParams = param.name;
      }
    }
  }

  return missingParams;
};

Operation.prototype.getBody = function (headers, args, opts) {
  var formParams = {}, body, key, value, hasBody = false;

  for (var i = 0; i < this.parameters.length; i++) {
    var param = this.parameters[i];

    if (typeof args[param.name] !== 'undefined') {
      if (param.in === 'body') {
        body = args[param.name];
      } else if (param.in === 'formData') {
        formParams[param.name] = args[param.name];
      }
    }
    else {
      if(param.in === 'body') {
        hasBody = true;
      }
    }
  }

  // if body is null and hasBody is true, AND a JSON body is requested, send empty {}
  if(hasBody && typeof body === 'undefined') {
    var contentType = headers['Content-Type'];
    if(contentType && contentType.indexOf('application/json') === 0) {
      body = '{}';
    }
  }

  // handle form params
  if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
    var encoded = '';

    for (key in formParams) {
      value = formParams[key];

      if (typeof value !== 'undefined') {
        if (encoded !== '') {
          encoded += '&';
        }

        encoded += encodeURIComponent(key) + '=' + encodeURIComponent(value);
      }
    }

    body = encoded;
  } else if (headers['Content-Type'] && headers['Content-Type'].indexOf('multipart/form-data') >= 0) {
    if (opts.useJQuery) {
      var bodyParam = new FormData();

      bodyParam.type = 'formData';

      for (key in formParams) {
        value = args[key];

        if (typeof value !== 'undefined') {
          // required for jquery file upload
          if (value.type === 'file' && value.value) {
            delete headers['Content-Type'];

            bodyParam.append(key, value.value);
          } else {
            bodyParam.append(key, value);
          }
        }
      }

      body = bodyParam;
    }
  }

  return body;
};

/**
 * gets sample response for a single operation
 **/
Operation.prototype.getModelSampleJSON = function (type, models) {
  var listType, sampleJson, innerType;
  models = models || {};

  listType = (type instanceof Array);
  innerType = listType ? type[0] : type;

  if(models[innerType]) {
    sampleJson = models[innerType].createJSONSample();
  } else if (this.getInlineModel(innerType)){
    sampleJson = this.getInlineModel(innerType).createJSONSample(); // may return null, if type isn't correct
  }


  if (sampleJson) {
    sampleJson = listType ? [sampleJson] : sampleJson;

    if (typeof sampleJson === 'string') {
      return sampleJson;
    } else if (typeof sampleJson === 'object') {
      var t = sampleJson;

      if (sampleJson instanceof Array && sampleJson.length > 0) {
        t = sampleJson[0];
      }

      if (t.nodeName) {
        var xmlString = new XMLSerializer().serializeToString(t);

        return this.formatXml(xmlString);
      } else {
        return JSON.stringify(sampleJson, null, 2);
      }
    } else {
      return sampleJson;
    }
  }
};

/**
 * legacy binding
 **/
Operation.prototype.do = function (args, opts, callback, error, parent) {
  return this.execute(args, opts, callback, error, parent);
};

/**
 * executes an operation
 **/
Operation.prototype.execute = function (arg1, arg2, arg3, arg4, parent) {
  var args = arg1 || {};
  var opts = {}, success, error;

  if (typeof arg2 === 'object') {
    opts = arg2;
    success = arg3;
    error = arg4;
  }

  if(this.client) {
    opts.client = this.client;
  }
  if(this.responseInterceptor) {
    opts.responseInterceptor = this.responseInterceptor;
  }


  if (typeof arg2 === 'function') {
    success = arg2;
    error = arg3;
  }

  success = (success || this.parent.defaultSuccessCallback || helpers.log);
  error = (error || this.parent.defaultErrorCallback || helpers.log);


  if (typeof opts.useJQuery === 'undefined') {
    opts.useJQuery = this.useJQuery;
  }
  var missingParams = this.getMissingParams(args);

  if (missingParams.length > 0) {
    var message = 'missing required params: ' + missingParams;

    helpers.fail(message);
    error(message);

    return;
  }

  var allHeaders = this.getHeaderParams(args);
  var contentTypeHeaders = this.setContentTypes(args, opts);
  var headers = {}, attrname;

  for (attrname in allHeaders) { headers[attrname] = allHeaders[attrname]; }
  for (attrname in contentTypeHeaders) { headers[attrname] = contentTypeHeaders[attrname]; }

  var body = this.getBody(contentTypeHeaders, args, opts);
  var url = this.urlify(args);

  if(url.indexOf('.{format}') > 0) {
    if(headers) {
      var format = headers.Accept || headers.accept;
      if(format && format.indexOf('json') > 0) {
        url = url.replace('.{format}', '.json');
      }
      else if(format && format.indexOf('xml') > 0) {
        url = url.replace('.{format}', '.xml');
      }
    }
  }

  var obj = {
    url: url,
    method: this.method.toUpperCase(),
    body: body,
    useJQuery: opts.useJQuery,
    headers: headers,
    on: {
      response: function (response) {
        return success(response, parent);
      },
      error: function (response) {
        return error(response, parent);
      }
    }
  };

  this.clientAuthorizations.apply(obj, this.operation.security);
  if (opts.mock === true) {
    return obj;
  } else {
    new SwaggerHttp().execute(obj, opts);
  }
};

function itemByPriority(col, itemPriority) {

  // No priorities? return first...
  if(_.isEmpty(itemPriority)) {
    return col[0];
  }

  for (var i = 0, len = itemPriority.length; i < len; i++) {
    if(col.indexOf(itemPriority[i]) > -1) {
      return itemPriority[i];
    }
  }

  // Otherwise return first
  return col[0];
}

Operation.prototype.setContentTypes = function (args, opts) {
  // default type
  var allDefinedParams = this.parameters;
  var body;
  var consumes = args.parameterContentType || itemByPriority(this.consumes, ['application/json']);
  var accepts = opts.responseContentType || itemByPriority(this.produces, ['application/json']);
  var definedFileParams = [];
  var definedFormParams = [];
  var headers = {};
  var i;

  // get params from the operation and set them in definedFileParams, definedFormParams, headers
  for (i = 0; i < allDefinedParams.length; i++) {
    var param = allDefinedParams[i];

    if (param.in === 'formData') {
      if (param.type === 'file') {
        definedFileParams.push(param);
      } else {
        definedFormParams.push(param);
      }
    } else if (param.in === 'header' && opts) {
      var key = param.name;
      var headerValue = opts[param.name];

      if (typeof opts[param.name] !== 'undefined') {
        headers[key] = headerValue;
      }
    } else if (param.in === 'body' && typeof args[param.name] !== 'undefined') {
      body = args[param.name];
    }
  }

  // if there's a body, need to set the consumes header via requestContentType
  if (this.method === 'post' || this.method === 'put' || this.method === 'patch') {
    if (opts.requestContentType) {
      consumes = opts.requestContentType;
    }
    // if any form params, content type must be set
    if (definedFormParams.length > 0) {
      if (opts.requestContentType) {             // override if set
        consumes = opts.requestContentType;
      } else if (definedFileParams.length > 0) { // if a file, must be multipart/form-data
        consumes = 'multipart/form-data';
      } else {                                   // default to x-www-from-urlencoded
        consumes = 'application/x-www-form-urlencoded';
      }
    }
  }
  else {
    consumes = null;
  }

  if (consumes && this.consumes) {
    if (this.consumes.indexOf(consumes) === -1) {
      helpers.log('server doesn\'t consume ' + consumes + ', try ' + JSON.stringify(this.consumes));
    }
  }

  if (!this.matchesAccept(accepts)) {
    helpers.log('server can\'t produce ' + accepts);
  }

  if ((consumes && body !== '') || (consumes === 'application/x-www-form-urlencoded')) {
    headers['Content-Type'] = consumes;
  }

  if (accepts) {
    headers.Accept = accepts;
  }

  return headers;
};

/**
 * Returns true if the request accepts header matches anything in this.produces.
 *  If this.produces contains * / *, ignore the accept header. 
 * @param {string=} accepts The client request accept header.
 * @return {boolean}
 */
Operation.prototype.matchesAccept = function(accepts) {
  // no accepts or produces, no problem!
  if (!accepts || !this.produces) {
    return true;
  }
  return this.produces.indexOf(accepts) !== -1 || this.produces.indexOf('*/*') !== -1;
};

Operation.prototype.asCurl = function (args) {
  var obj = this.execute(args, {mock: true});

  this.clientAuthorizations.apply(obj);

  var results = [];

  results.push('-X ' + this.method.toUpperCase());

  if (obj.headers) {
    var key;

    for (key in obj.headers) {
      results.push('--header "' + key + ': ' + obj.headers[key] + '"');
    }
  }

  if (obj.body) {
    var body;

    if (typeof obj.body === 'object') {
      body = JSON.stringify(obj.body);
    } else {
      body = obj.body;
    }

    results.push('-d "' + body.replace(/"/g, '\\"') + '"');
  }

  return 'curl ' + (results.join(' ')) + ' "' + obj.url + '"';
};

Operation.prototype.encodePathCollection = function (type, name, value) {
  var encoded = '';
  var i;
  var separator = '';

  if (type === 'ssv') {
    separator = '%20';
  } else if (type === 'tsv') {
    separator = '\\t';
  } else if (type === 'pipes') {
    separator = '|';
  } else {
    separator = ',';
  }

  for (i = 0; i < value.length; i++) {
    if (i === 0) {
      encoded = this.encodeQueryParam(value[i]);
    } else {
      encoded += separator + this.encodeQueryParam(value[i]);
    }
  }

  return encoded;
};

Operation.prototype.encodeQueryCollection = function (type, name, value) {
  var encoded = '';
  var i;

  if (type === 'default' || type === 'multi') {
    for (i = 0; i < value.length; i++) {
      if (i > 0) {encoded += '&';}

      encoded += this.encodeQueryParam(name) + '=' + this.encodeQueryParam(value[i]);
    }
  } else {
    var separator = '';

    if (type === 'csv') {
      separator = ',';
    } else if (type === 'ssv') {
      separator = '%20';
    } else if (type === 'tsv') {
      separator = '\\t';
    } else if (type === 'pipes') {
      separator = '|';
    } else if (type === 'brackets') {
      for (i = 0; i < value.length; i++) {
        if (i !== 0) {
          encoded += '&';
        }

        encoded += this.encodeQueryParam(name) + '[]=' + this.encodeQueryParam(value[i]);
      }
    }

    if (separator !== '') {
      for (i = 0; i < value.length; i++) {
        if (i === 0) {
          encoded = this.encodeQueryParam(name) + '=' + this.encodeQueryParam(value[i]);
        } else {
          encoded += separator + this.encodeQueryParam(value[i]);
        }
      }
    }
  }

  return encoded;
};

Operation.prototype.encodeQueryParam = function (arg) {
  return encodeURIComponent(arg);
};

/**
 * TODO revisit, might not want to leave '/'
 **/
Operation.prototype.encodePathParam = function (pathParam) {
  return encodeURIComponent(pathParam);
};

},{"../helpers":4,"../http":5,"./model":8,"lodash-compat/lang/cloneDeep":102,"lodash-compat/lang/isEmpty":105,"lodash-compat/lang/isUndefined":112}],10:[function(require,module,exports){
'use strict';

var OperationGroup = module.exports = function (tag, description, externalDocs, operation) {
  this.description = description;
  this.externalDocs = externalDocs;
  this.name = tag;
  this.operation = operation;
  this.operationsArray = [];
  this.path = tag;
  this.tag = tag;
};

OperationGroup.prototype.sort = function () {

};


},{}],11:[function(require,module,exports){
var baseIndexOf = require('../internal/baseIndexOf'),
    binaryIndex = require('../internal/binaryIndex');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Gets the index at which the first occurrence of `value` is found in `array`
 * using [`SameValueZero`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-samevaluezero)
 * for equality comparisons. If `fromIndex` is negative, it is used as the offset
 * from the end of `array`. If `array` is sorted providing `true` for `fromIndex`
 * performs a faster binary search.
 *
 * @static
 * @memberOf _
 * @category Array
 * @param {Array} array The array to search.
 * @param {*} value The value to search for.
 * @param {boolean|number} [fromIndex=0] The index to search from or `true`
 *  to perform a binary search on a sorted array.
 * @returns {number} Returns the index of the matched value, else `-1`.
 * @example
 *
 * _.indexOf([1, 2, 1, 2], 2);
 * // => 1
 *
 * // using `fromIndex`
 * _.indexOf([1, 2, 1, 2], 2, 2);
 * // => 3
 *
 * // performing a binary search
 * _.indexOf([1, 1, 2, 2], 2, true);
 * // => 2
 */
function indexOf(array, value, fromIndex) {
  var length = array ? array.length : 0;
  if (!length) {
    return -1;
  }
  if (typeof fromIndex == 'number') {
    fromIndex = fromIndex < 0 ? nativeMax(length + fromIndex, 0) : fromIndex;
  } else if (fromIndex) {
    var index = binaryIndex(array, value),
        other = array[index];

    if (value === value ? (value === other) : (other !== other)) {
      return index;
    }
    return -1;
  }
  return baseIndexOf(array, value, fromIndex || 0);
}

module.exports = indexOf;

},{"../internal/baseIndexOf":40,"../internal/binaryIndex":55}],12:[function(require,module,exports){
/**
 * Gets the last element of `array`.
 *
 * @static
 * @memberOf _
 * @category Array
 * @param {Array} array The array to query.
 * @returns {*} Returns the last element of `array`.
 * @example
 *
 * _.last([1, 2, 3]);
 * // => 3
 */
function last(array) {
  var length = array ? array.length : 0;
  return length ? array[length - 1] : undefined;
}

module.exports = last;

},{}],13:[function(require,module,exports){
var LazyWrapper = require('../internal/LazyWrapper'),
    LodashWrapper = require('../internal/LodashWrapper'),
    baseLodash = require('../internal/baseLodash'),
    isArray = require('../lang/isArray'),
    isObjectLike = require('../internal/isObjectLike'),
    wrapperClone = require('../internal/wrapperClone');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Creates a `lodash` object which wraps `value` to enable implicit chaining.
 * Methods that operate on and return arrays, collections, and functions can
 * be chained together. Methods that return a boolean or single value will
 * automatically end the chain returning the unwrapped value. Explicit chaining
 * may be enabled using `_.chain`. The execution of chained methods is lazy,
 * that is, execution is deferred until `_#value` is implicitly or explicitly
 * called.
 *
 * Lazy evaluation allows several methods to support shortcut fusion. Shortcut
 * fusion is an optimization that merges iteratees to avoid creating intermediate
 * arrays and reduce the number of iteratee executions.
 *
 * Chaining is supported in custom builds as long as the `_#value` method is
 * directly or indirectly included in the build.
 *
 * In addition to lodash methods, wrappers have `Array` and `String` methods.
 *
 * The wrapper `Array` methods are:
 * `concat`, `join`, `pop`, `push`, `reverse`, `shift`, `slice`, `sort`,
 * `splice`, and `unshift`
 *
 * The wrapper `String` methods are:
 * `replace` and `split`
 *
 * The wrapper methods that support shortcut fusion are:
 * `compact`, `drop`, `dropRight`, `dropRightWhile`, `dropWhile`, `filter`,
 * `first`, `initial`, `last`, `map`, `pluck`, `reject`, `rest`, `reverse`,
 * `slice`, `take`, `takeRight`, `takeRightWhile`, `takeWhile`, `toArray`,
 * and `where`
 *
 * The chainable wrapper methods are:
 * `after`, `ary`, `assign`, `at`, `before`, `bind`, `bindAll`, `bindKey`,
 * `callback`, `chain`, `chunk`, `commit`, `compact`, `concat`, `constant`,
 * `countBy`, `create`, `curry`, `debounce`, `defaults`, `defer`, `delay`,
 * `difference`, `drop`, `dropRight`, `dropRightWhile`, `dropWhile`, `fill`,
 * `filter`, `flatten`, `flattenDeep`, `flow`, `flowRight`, `forEach`,
 * `forEachRight`, `forIn`, `forInRight`, `forOwn`, `forOwnRight`, `functions`,
 * `groupBy`, `indexBy`, `initial`, `intersection`, `invert`, `invoke`, `keys`,
 * `keysIn`, `map`, `mapKeys`, `mapValues`, `matches`, `matchesProperty`,
 * `memoize`, `merge`, `method`, `methodOf`, `mixin`, `negate`, `omit`, `once`,
 * `pairs`, `partial`, `partialRight`, `partition`, `pick`, `plant`, `pluck`,
 * `property`, `propertyOf`, `pull`, `pullAt`, `push`, `range`, `rearg`,
 * `reject`, `remove`, `rest`, `restParam`, `reverse`, `set`, `shuffle`,
 * `slice`, `sort`, `sortBy`, `sortByAll`, `sortByOrder`, `splice`, `spread`,
 * `take`, `takeRight`, `takeRightWhile`, `takeWhile`, `tap`, `throttle`,
 * `thru`, `times`, `toArray`, `toPlainObject`, `transform`, `union`, `uniq`,
 * `unshift`, `unzip`, `unzipWith`, `values`, `valuesIn`, `where`, `without`,
 * `wrap`, `xor`, `zip`, `zipObject`, `zipWith`
 *
 * The wrapper methods that are **not** chainable by default are:
 * `add`, `attempt`, `camelCase`, `capitalize`, `clone`, `cloneDeep`, `deburr`,
 * `endsWith`, `escape`, `escapeRegExp`, `every`, `find`, `findIndex`, `findKey`,
 * `findLast`, `findLastIndex`, `findLastKey`, `findWhere`, `first`, `get`,
 * `gt`, `gte`, `has`, `identity`, `includes`, `indexOf`, `inRange`, `isArguments`,
 * `isArray`, `isBoolean`, `isDate`, `isElement`, `isEmpty`, `isEqual`, `isError`,
 * `isFinite` `isFunction`, `isMatch`, `isNative`, `isNaN`, `isNull`, `isNumber`,
 * `isObject`, `isPlainObject`, `isRegExp`, `isString`, `isUndefined`,
 * `isTypedArray`, `join`, `kebabCase`, `last`, `lastIndexOf`, `lt`, `lte`,
 * `max`, `min`, `noConflict`, `noop`, `now`, `pad`, `padLeft`, `padRight`,
 * `parseInt`, `pop`, `random`, `reduce`, `reduceRight`, `repeat`, `result`,
 * `runInContext`, `shift`, `size`, `snakeCase`, `some`, `sortedIndex`,
 * `sortedLastIndex`, `startCase`, `startsWith`, `sum`, `template`, `trim`,
 * `trimLeft`, `trimRight`, `trunc`, `unescape`, `uniqueId`, `value`, and `words`
 *
 * The wrapper method `sample` will return a wrapped value when `n` is provided,
 * otherwise an unwrapped value is returned.
 *
 * @name _
 * @constructor
 * @category Chain
 * @param {*} value The value to wrap in a `lodash` instance.
 * @returns {Object} Returns the new `lodash` wrapper instance.
 * @example
 *
 * var wrapped = _([1, 2, 3]);
 *
 * // returns an unwrapped value
 * wrapped.reduce(function(total, n) {
 *   return total + n;
 * });
 * // => 6
 *
 * // returns a wrapped value
 * var squares = wrapped.map(function(n) {
 *   return n * n;
 * });
 *
 * _.isArray(squares);
 * // => false
 *
 * _.isArray(squares.value());
 * // => true
 */
function lodash(value) {
  if (isObjectLike(value) && !isArray(value) && !(value instanceof LazyWrapper)) {
    if (value instanceof LodashWrapper) {
      return value;
    }
    if (hasOwnProperty.call(value, '__chain__') && hasOwnProperty.call(value, '__wrapped__')) {
      return wrapperClone(value);
    }
  }
  return new LodashWrapper(value);
}

// Ensure wrappers are instances of `baseLodash`.
lodash.prototype = baseLodash.prototype;

module.exports = lodash;

},{"../internal/LazyWrapper":22,"../internal/LodashWrapper":23,"../internal/baseLodash":45,"../internal/isObjectLike":89,"../internal/wrapperClone":101,"../lang/isArray":104}],14:[function(require,module,exports){
module.exports = require('./forEach');

},{"./forEach":16}],15:[function(require,module,exports){
var baseEach = require('../internal/baseEach'),
    createFind = require('../internal/createFind');

/**
 * Iterates over elements of `collection`, returning the first element
 * `predicate` returns truthy for. The predicate is bound to `thisArg` and
 * invoked with three arguments: (value, index|key, collection).
 *
 * If a property name is provided for `predicate` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `predicate` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @alias detect
 * @category Collection
 * @param {Array|Object|string} collection The collection to search.
 * @param {Function|Object|string} [predicate=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `predicate`.
 * @returns {*} Returns the matched element, else `undefined`.
 * @example
 *
 * var users = [
 *   { 'user': 'barney',  'age': 36, 'active': true },
 *   { 'user': 'fred',    'age': 40, 'active': false },
 *   { 'user': 'pebbles', 'age': 1,  'active': true }
 * ];
 *
 * _.result(_.find(users, function(chr) {
 *   return chr.age < 40;
 * }), 'user');
 * // => 'barney'
 *
 * // using the `_.matches` callback shorthand
 * _.result(_.find(users, { 'age': 1, 'active': true }), 'user');
 * // => 'pebbles'
 *
 * // using the `_.matchesProperty` callback shorthand
 * _.result(_.find(users, 'active', false), 'user');
 * // => 'fred'
 *
 * // using the `_.property` callback shorthand
 * _.result(_.find(users, 'active'), 'user');
 * // => 'barney'
 */
var find = createFind(baseEach);

module.exports = find;

},{"../internal/baseEach":33,"../internal/createFind":65}],16:[function(require,module,exports){
var arrayEach = require('../internal/arrayEach'),
    baseEach = require('../internal/baseEach'),
    createForEach = require('../internal/createForEach');

/**
 * Iterates over elements of `collection` invoking `iteratee` for each element.
 * The `iteratee` is bound to `thisArg` and invoked with three arguments:
 * (value, index|key, collection). Iteratee functions may exit iteration early
 * by explicitly returning `false`.
 *
 * **Note:** As with other "Collections" methods, objects with a "length" property
 * are iterated like arrays. To avoid this behavior `_.forIn` or `_.forOwn`
 * may be used for object iteration.
 *
 * @static
 * @memberOf _
 * @alias each
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Array|Object|string} Returns `collection`.
 * @example
 *
 * _([1, 2]).forEach(function(n) {
 *   console.log(n);
 * }).value();
 * // => logs each value from left to right and returns the array
 *
 * _.forEach({ 'a': 1, 'b': 2 }, function(n, key) {
 *   console.log(n, key);
 * });
 * // => logs each value-key pair and returns the object (iteration order is not guaranteed)
 */
var forEach = createForEach(arrayEach, baseEach);

module.exports = forEach;

},{"../internal/arrayEach":25,"../internal/baseEach":33,"../internal/createForEach":66}],17:[function(require,module,exports){
var baseIndexOf = require('../internal/baseIndexOf'),
    getLength = require('../internal/getLength'),
    isArray = require('../lang/isArray'),
    isIterateeCall = require('../internal/isIterateeCall'),
    isLength = require('../internal/isLength'),
    isString = require('../lang/isString'),
    values = require('../object/values');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Checks if `value` is in `collection` using
 * [`SameValueZero`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-samevaluezero)
 * for equality comparisons. If `fromIndex` is negative, it is used as the offset
 * from the end of `collection`.
 *
 * @static
 * @memberOf _
 * @alias contains, include
 * @category Collection
 * @param {Array|Object|string} collection The collection to search.
 * @param {*} target The value to search for.
 * @param {number} [fromIndex=0] The index to search from.
 * @param- {Object} [guard] Enables use as a callback for functions like `_.reduce`.
 * @returns {boolean} Returns `true` if a matching element is found, else `false`.
 * @example
 *
 * _.includes([1, 2, 3], 1);
 * // => true
 *
 * _.includes([1, 2, 3], 1, 2);
 * // => false
 *
 * _.includes({ 'user': 'fred', 'age': 40 }, 'fred');
 * // => true
 *
 * _.includes('pebbles', 'eb');
 * // => true
 */
function includes(collection, target, fromIndex, guard) {
  var length = collection ? getLength(collection) : 0;
  if (!isLength(length)) {
    collection = values(collection);
    length = collection.length;
  }
  if (!length) {
    return false;
  }
  if (typeof fromIndex != 'number' || (guard && isIterateeCall(target, fromIndex, guard))) {
    fromIndex = 0;
  } else {
    fromIndex = fromIndex < 0 ? nativeMax(length + fromIndex, 0) : (fromIndex || 0);
  }
  return (typeof collection == 'string' || !isArray(collection) && isString(collection))
    ? (fromIndex < length && collection.indexOf(target, fromIndex) > -1)
    : (baseIndexOf(collection, target, fromIndex) > -1);
}

module.exports = includes;

},{"../internal/baseIndexOf":40,"../internal/getLength":75,"../internal/isIterateeCall":85,"../internal/isLength":88,"../lang/isArray":104,"../lang/isString":110,"../object/values":116}],18:[function(require,module,exports){
var arrayMap = require('../internal/arrayMap'),
    baseCallback = require('../internal/baseCallback'),
    baseMap = require('../internal/baseMap'),
    isArray = require('../lang/isArray');

/**
 * Creates an array of values by running each element in `collection` through
 * `iteratee`. The `iteratee` is bound to `thisArg` and invoked with three
 * arguments: (value, index|key, collection).
 *
 * If a property name is provided for `iteratee` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `iteratee` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * Many lodash methods are guarded to work as iteratees for methods like
 * `_.every`, `_.filter`, `_.map`, `_.mapValues`, `_.reject`, and `_.some`.
 *
 * The guarded methods are:
 * `ary`, `callback`, `chunk`, `clone`, `create`, `curry`, `curryRight`,
 * `drop`, `dropRight`, `every`, `fill`, `flatten`, `invert`, `max`, `min`,
 * `parseInt`, `slice`, `sortBy`, `take`, `takeRight`, `template`, `trim`,
 * `trimLeft`, `trimRight`, `trunc`, `random`, `range`, `sample`, `some`,
 * `sum`, `uniq`, and `words`
 *
 * @static
 * @memberOf _
 * @alias collect
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [iteratee=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Array} Returns the new mapped array.
 * @example
 *
 * function timesThree(n) {
 *   return n * 3;
 * }
 *
 * _.map([1, 2], timesThree);
 * // => [3, 6]
 *
 * _.map({ 'a': 1, 'b': 2 }, timesThree);
 * // => [3, 6] (iteration order is not guaranteed)
 *
 * var users = [
 *   { 'user': 'barney' },
 *   { 'user': 'fred' }
 * ];
 *
 * // using the `_.property` callback shorthand
 * _.map(users, 'user');
 * // => ['barney', 'fred']
 */
function map(collection, iteratee, thisArg) {
  var func = isArray(collection) ? arrayMap : baseMap;
  iteratee = baseCallback(iteratee, thisArg, 3);
  return func(collection, iteratee);
}

module.exports = map;

},{"../internal/arrayMap":26,"../internal/baseCallback":29,"../internal/baseMap":46,"../lang/isArray":104}],19:[function(require,module,exports){
var getNative = require('../internal/getNative');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeNow = getNative(Date, 'now');

/**
 * Gets the number of milliseconds that have elapsed since the Unix epoch
 * (1 January 1970 00:00:00 UTC).
 *
 * @static
 * @memberOf _
 * @category Date
 * @example
 *
 * _.defer(function(stamp) {
 *   console.log(_.now() - stamp);
 * }, _.now());
 * // => logs the number of milliseconds it took for the deferred function to be invoked
 */
var now = nativeNow || function() {
  return new Date().getTime();
};

module.exports = now;

},{"../internal/getNative":77}],20:[function(require,module,exports){
var createWrapper = require('../internal/createWrapper'),
    replaceHolders = require('../internal/replaceHolders'),
    restParam = require('./restParam');

/** Used to compose bitmasks for wrapper metadata. */
var BIND_FLAG = 1,
    PARTIAL_FLAG = 32;

/**
 * Creates a function that invokes `func` with the `this` binding of `thisArg`
 * and prepends any additional `_.bind` arguments to those provided to the
 * bound function.
 *
 * The `_.bind.placeholder` value, which defaults to `_` in monolithic builds,
 * may be used as a placeholder for partially applied arguments.
 *
 * **Note:** Unlike native `Function#bind` this method does not set the "length"
 * property of bound functions.
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to bind.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {...*} [partials] The arguments to be partially applied.
 * @returns {Function} Returns the new bound function.
 * @example
 *
 * var greet = function(greeting, punctuation) {
 *   return greeting + ' ' + this.user + punctuation;
 * };
 *
 * var object = { 'user': 'fred' };
 *
 * var bound = _.bind(greet, object, 'hi');
 * bound('!');
 * // => 'hi fred!'
 *
 * // using placeholders
 * var bound = _.bind(greet, object, _, '!');
 * bound('hi');
 * // => 'hi fred!'
 */
var bind = restParam(function(func, thisArg, partials) {
  var bitmask = BIND_FLAG;
  if (partials.length) {
    var holders = replaceHolders(partials, bind.placeholder);
    bitmask |= PARTIAL_FLAG;
  }
  return createWrapper(func, bitmask, thisArg, partials, holders);
});

// Assign default placeholders.
bind.placeholder = {};

module.exports = bind;

},{"../internal/createWrapper":69,"../internal/replaceHolders":95,"./restParam":21}],21:[function(require,module,exports){
/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates a function that invokes `func` with the `this` binding of the
 * created function and arguments from `start` and beyond provided as an array.
 *
 * **Note:** This method is based on the [rest parameter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/rest_parameters).
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to apply a rest parameter to.
 * @param {number} [start=func.length-1] The start position of the rest parameter.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var say = _.restParam(function(what, names) {
 *   return what + ' ' + _.initial(names).join(', ') +
 *     (_.size(names) > 1 ? ', & ' : '') + _.last(names);
 * });
 *
 * say('hello', 'fred', 'barney', 'pebbles');
 * // => 'hello fred, barney, & pebbles'
 */
function restParam(func, start) {
  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  start = nativeMax(start === undefined ? (func.length - 1) : (+start || 0), 0);
  return function() {
    var args = arguments,
        index = -1,
        length = nativeMax(args.length - start, 0),
        rest = Array(length);

    while (++index < length) {
      rest[index] = args[start + index];
    }
    switch (start) {
      case 0: return func.call(this, rest);
      case 1: return func.call(this, args[0], rest);
      case 2: return func.call(this, args[0], args[1], rest);
    }
    var otherArgs = Array(start + 1);
    index = -1;
    while (++index < start) {
      otherArgs[index] = args[index];
    }
    otherArgs[start] = rest;
    return func.apply(this, otherArgs);
  };
}

module.exports = restParam;

},{}],22:[function(require,module,exports){
var baseCreate = require('./baseCreate'),
    baseLodash = require('./baseLodash');

/** Used as references for `-Infinity` and `Infinity`. */
var POSITIVE_INFINITY = Number.POSITIVE_INFINITY;

/**
 * Creates a lazy wrapper object which wraps `value` to enable lazy evaluation.
 *
 * @private
 * @param {*} value The value to wrap.
 */
function LazyWrapper(value) {
  this.__wrapped__ = value;
  this.__actions__ = null;
  this.__dir__ = 1;
  this.__dropCount__ = 0;
  this.__filtered__ = false;
  this.__iteratees__ = null;
  this.__takeCount__ = POSITIVE_INFINITY;
  this.__views__ = null;
}

LazyWrapper.prototype = baseCreate(baseLodash.prototype);
LazyWrapper.prototype.constructor = LazyWrapper;

module.exports = LazyWrapper;

},{"./baseCreate":32,"./baseLodash":45}],23:[function(require,module,exports){
var baseCreate = require('./baseCreate'),
    baseLodash = require('./baseLodash');

/**
 * The base constructor for creating `lodash` wrapper objects.
 *
 * @private
 * @param {*} value The value to wrap.
 * @param {boolean} [chainAll] Enable chaining for all wrapper methods.
 * @param {Array} [actions=[]] Actions to peform to resolve the unwrapped value.
 */
function LodashWrapper(value, chainAll, actions) {
  this.__wrapped__ = value;
  this.__actions__ = actions || [];
  this.__chain__ = !!chainAll;
}

LodashWrapper.prototype = baseCreate(baseLodash.prototype);
LodashWrapper.prototype.constructor = LodashWrapper;

module.exports = LodashWrapper;

},{"./baseCreate":32,"./baseLodash":45}],24:[function(require,module,exports){
/**
 * Copies the values of `source` to `array`.
 *
 * @private
 * @param {Array} source The array to copy values from.
 * @param {Array} [array=[]] The array to copy values to.
 * @returns {Array} Returns `array`.
 */
function arrayCopy(source, array) {
  var index = -1,
      length = source.length;

  array || (array = Array(length));
  while (++index < length) {
    array[index] = source[index];
  }
  return array;
}

module.exports = arrayCopy;

},{}],25:[function(require,module,exports){
/**
 * A specialized version of `_.forEach` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns `array`.
 */
function arrayEach(array, iteratee) {
  var index = -1,
      length = array.length;

  while (++index < length) {
    if (iteratee(array[index], index, array) === false) {
      break;
    }
  }
  return array;
}

module.exports = arrayEach;

},{}],26:[function(require,module,exports){
/**
 * A specialized version of `_.map` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function arrayMap(array, iteratee) {
  var index = -1,
      length = array.length,
      result = Array(length);

  while (++index < length) {
    result[index] = iteratee(array[index], index, array);
  }
  return result;
}

module.exports = arrayMap;

},{}],27:[function(require,module,exports){
/**
 * A specialized version of `_.some` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {boolean} Returns `true` if any element passes the predicate check,
 *  else `false`.
 */
function arraySome(array, predicate) {
  var index = -1,
      length = array.length;

  while (++index < length) {
    if (predicate(array[index], index, array)) {
      return true;
    }
  }
  return false;
}

module.exports = arraySome;

},{}],28:[function(require,module,exports){
var baseCopy = require('./baseCopy'),
    keys = require('../object/keys');

/**
 * The base implementation of `_.assign` without support for argument juggling,
 * multiple sources, and `customizer` functions.
 *
 * @private
 * @param {Object} object The destination object.
 * @param {Object} source The source object.
 * @returns {Object} Returns `object`.
 */
function baseAssign(object, source) {
  return source == null
    ? object
    : baseCopy(source, keys(source), object);
}

module.exports = baseAssign;

},{"../object/keys":113,"./baseCopy":31}],29:[function(require,module,exports){
var baseMatches = require('./baseMatches'),
    baseMatchesProperty = require('./baseMatchesProperty'),
    bindCallback = require('./bindCallback'),
    identity = require('../utility/identity'),
    property = require('../utility/property');

/**
 * The base implementation of `_.callback` which supports specifying the
 * number of arguments to provide to `func`.
 *
 * @private
 * @param {*} [func=_.identity] The value to convert to a callback.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {number} [argCount] The number of arguments to provide to `func`.
 * @returns {Function} Returns the callback.
 */
function baseCallback(func, thisArg, argCount) {
  var type = typeof func;
  if (type == 'function') {
    return thisArg === undefined
      ? func
      : bindCallback(func, thisArg, argCount);
  }
  if (func == null) {
    return identity;
  }
  if (type == 'object') {
    return baseMatches(func);
  }
  return thisArg === undefined
    ? property(func)
    : baseMatchesProperty(func, thisArg);
}

module.exports = baseCallback;

},{"../utility/identity":120,"../utility/property":122,"./baseMatches":47,"./baseMatchesProperty":48,"./bindCallback":57}],30:[function(require,module,exports){
var arrayCopy = require('./arrayCopy'),
    arrayEach = require('./arrayEach'),
    baseAssign = require('./baseAssign'),
    baseForOwn = require('./baseForOwn'),
    initCloneArray = require('./initCloneArray'),
    initCloneByTag = require('./initCloneByTag'),
    initCloneObject = require('./initCloneObject'),
    isArray = require('../lang/isArray'),
    isHostObject = require('./isHostObject'),
    isObject = require('../lang/isObject');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values supported by `_.clone`. */
var cloneableTags = {};
cloneableTags[argsTag] = cloneableTags[arrayTag] =
cloneableTags[arrayBufferTag] = cloneableTags[boolTag] =
cloneableTags[dateTag] = cloneableTags[float32Tag] =
cloneableTags[float64Tag] = cloneableTags[int8Tag] =
cloneableTags[int16Tag] = cloneableTags[int32Tag] =
cloneableTags[numberTag] = cloneableTags[objectTag] =
cloneableTags[regexpTag] = cloneableTags[stringTag] =
cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] =
cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
cloneableTags[errorTag] = cloneableTags[funcTag] =
cloneableTags[mapTag] = cloneableTags[setTag] =
cloneableTags[weakMapTag] = false;

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * The base implementation of `_.clone` without support for argument juggling
 * and `this` binding `customizer` functions.
 *
 * @private
 * @param {*} value The value to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @param {Function} [customizer] The function to customize cloning values.
 * @param {string} [key] The key of `value`.
 * @param {Object} [object] The object `value` belongs to.
 * @param {Array} [stackA=[]] Tracks traversed source objects.
 * @param {Array} [stackB=[]] Associates clones with source counterparts.
 * @returns {*} Returns the cloned value.
 */
function baseClone(value, isDeep, customizer, key, object, stackA, stackB) {
  var result;
  if (customizer) {
    result = object ? customizer(value, key, object) : customizer(value);
  }
  if (result !== undefined) {
    return result;
  }
  if (!isObject(value)) {
    return value;
  }
  var isArr = isArray(value);
  if (isArr) {
    result = initCloneArray(value);
    if (!isDeep) {
      return arrayCopy(value, result);
    }
  } else {
    var tag = objToString.call(value),
        isFunc = tag == funcTag;

    if (tag == objectTag || tag == argsTag || (isFunc && !object)) {
      if (isHostObject(value)) {
        return object ? value : {};
      }
      result = initCloneObject(isFunc ? {} : value);
      if (!isDeep) {
        return baseAssign(result, value);
      }
    } else {
      return cloneableTags[tag]
        ? initCloneByTag(value, tag, isDeep)
        : (object ? value : {});
    }
  }
  // Check for circular references and return corresponding clone.
  stackA || (stackA = []);
  stackB || (stackB = []);

  var length = stackA.length;
  while (length--) {
    if (stackA[length] == value) {
      return stackB[length];
    }
  }
  // Add the source value to the stack of traversed objects and associate it with its clone.
  stackA.push(value);
  stackB.push(result);

  // Recursively populate clone (susceptible to call stack limits).
  (isArr ? arrayEach : baseForOwn)(value, function(subValue, key) {
    result[key] = baseClone(subValue, isDeep, customizer, key, value, stackA, stackB);
  });
  return result;
}

module.exports = baseClone;

},{"../lang/isArray":104,"../lang/isObject":108,"./arrayCopy":24,"./arrayEach":25,"./baseAssign":28,"./baseForOwn":38,"./initCloneArray":79,"./initCloneByTag":80,"./initCloneObject":81,"./isHostObject":83}],31:[function(require,module,exports){
/**
 * Copies properties of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy properties from.
 * @param {Array} props The property names to copy.
 * @param {Object} [object={}] The object to copy properties to.
 * @returns {Object} Returns `object`.
 */
function baseCopy(source, props, object) {
  object || (object = {});

  var index = -1,
      length = props.length;

  while (++index < length) {
    var key = props[index];
    object[key] = source[key];
  }
  return object;
}

module.exports = baseCopy;

},{}],32:[function(require,module,exports){
var isObject = require('../lang/isObject');

/**
 * The base implementation of `_.create` without support for assigning
 * properties to the created object.
 *
 * @private
 * @param {Object} prototype The object to inherit from.
 * @returns {Object} Returns the new object.
 */
var baseCreate = (function() {
  function object() {}
  return function(prototype) {
    if (isObject(prototype)) {
      object.prototype = prototype;
      var result = new object;
      object.prototype = null;
    }
    return result || {};
  };
}());

module.exports = baseCreate;

},{"../lang/isObject":108}],33:[function(require,module,exports){
var baseForOwn = require('./baseForOwn'),
    createBaseEach = require('./createBaseEach');

/**
 * The base implementation of `_.forEach` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array|Object|string} Returns `collection`.
 */
var baseEach = createBaseEach(baseForOwn);

module.exports = baseEach;

},{"./baseForOwn":38,"./createBaseEach":61}],34:[function(require,module,exports){
/**
 * The base implementation of `_.find`, `_.findLast`, `_.findKey`, and `_.findLastKey`,
 * without support for callback shorthands and `this` binding, which iterates
 * over `collection` using the provided `eachFunc`.
 *
 * @private
 * @param {Array|Object|string} collection The collection to search.
 * @param {Function} predicate The function invoked per iteration.
 * @param {Function} eachFunc The function to iterate over `collection`.
 * @param {boolean} [retKey] Specify returning the key of the found element
 *  instead of the element itself.
 * @returns {*} Returns the found element or its key, else `undefined`.
 */
function baseFind(collection, predicate, eachFunc, retKey) {
  var result;
  eachFunc(collection, function(value, key, collection) {
    if (predicate(value, key, collection)) {
      result = retKey ? key : value;
      return false;
    }
  });
  return result;
}

module.exports = baseFind;

},{}],35:[function(require,module,exports){
/**
 * The base implementation of `_.findIndex` and `_.findLastIndex` without
 * support for callback shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {Function} predicate The function invoked per iteration.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseFindIndex(array, predicate, fromRight) {
  var length = array.length,
      index = fromRight ? length : -1;

  while ((fromRight ? index-- : ++index < length)) {
    if (predicate(array[index], index, array)) {
      return index;
    }
  }
  return -1;
}

module.exports = baseFindIndex;

},{}],36:[function(require,module,exports){
var createBaseFor = require('./createBaseFor');

/**
 * The base implementation of `baseForIn` and `baseForOwn` which iterates
 * over `object` properties returned by `keysFunc` invoking `iteratee` for
 * each property. Iteratee functions may exit iteration early by explicitly
 * returning `false`.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @returns {Object} Returns `object`.
 */
var baseFor = createBaseFor();

module.exports = baseFor;

},{"./createBaseFor":62}],37:[function(require,module,exports){
var baseFor = require('./baseFor'),
    keysIn = require('../object/keysIn');

/**
 * The base implementation of `_.forIn` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Object} Returns `object`.
 */
function baseForIn(object, iteratee) {
  return baseFor(object, iteratee, keysIn);
}

module.exports = baseForIn;

},{"../object/keysIn":114,"./baseFor":36}],38:[function(require,module,exports){
var baseFor = require('./baseFor'),
    keys = require('../object/keys');

/**
 * The base implementation of `_.forOwn` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Object} Returns `object`.
 */
function baseForOwn(object, iteratee) {
  return baseFor(object, iteratee, keys);
}

module.exports = baseForOwn;

},{"../object/keys":113,"./baseFor":36}],39:[function(require,module,exports){
var toObject = require('./toObject');

/**
 * The base implementation of `get` without support for string paths
 * and default values.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array} path The path of the property to get.
 * @param {string} [pathKey] The key representation of path.
 * @returns {*} Returns the resolved value.
 */
function baseGet(object, path, pathKey) {
  if (object == null) {
    return;
  }
  object = toObject(object);
  if (pathKey !== undefined && pathKey in object) {
    path = [pathKey];
  }
  var index = 0,
      length = path.length;

  while (object != null && index < length) {
    object = toObject(object)[path[index++]];
  }
  return (index && index == length) ? object : undefined;
}

module.exports = baseGet;

},{"./toObject":99}],40:[function(require,module,exports){
var indexOfNaN = require('./indexOfNaN');

/**
 * The base implementation of `_.indexOf` without support for binary searches.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {*} value The value to search for.
 * @param {number} fromIndex The index to search from.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseIndexOf(array, value, fromIndex) {
  if (value !== value) {
    return indexOfNaN(array, fromIndex);
  }
  var index = fromIndex - 1,
      length = array.length;

  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}

module.exports = baseIndexOf;

},{"./indexOfNaN":78}],41:[function(require,module,exports){
var baseIsEqualDeep = require('./baseIsEqualDeep'),
    isObject = require('../lang/isObject'),
    isObjectLike = require('./isObjectLike');

/**
 * The base implementation of `_.isEqual` without support for `this` binding
 * `customizer` functions.
 *
 * @private
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @param {Function} [customizer] The function to customize comparing values.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 */
function baseIsEqual(value, other, customizer, isLoose, stackA, stackB) {
  if (value === other) {
    return true;
  }
  if (value == null || other == null || (!isObject(value) && !isObjectLike(other))) {
    return value !== value && other !== other;
  }
  return baseIsEqualDeep(value, other, baseIsEqual, customizer, isLoose, stackA, stackB);
}

module.exports = baseIsEqual;

},{"../lang/isObject":108,"./baseIsEqualDeep":42,"./isObjectLike":89}],42:[function(require,module,exports){
var equalArrays = require('./equalArrays'),
    equalByTag = require('./equalByTag'),
    equalObjects = require('./equalObjects'),
    isArray = require('../lang/isArray'),
    isHostObject = require('./isHostObject'),
    isTypedArray = require('../lang/isTypedArray');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    objectTag = '[object Object]';

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * A specialized version of `baseIsEqual` for arrays and objects which performs
 * deep comparisons and tracks traversed objects enabling objects with circular
 * references to be compared.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing objects.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA=[]] Tracks traversed `value` objects.
 * @param {Array} [stackB=[]] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function baseIsEqualDeep(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var objIsArr = isArray(object),
      othIsArr = isArray(other),
      objTag = arrayTag,
      othTag = arrayTag;

  if (!objIsArr) {
    objTag = objToString.call(object);
    if (objTag == argsTag) {
      objTag = objectTag;
    } else if (objTag != objectTag) {
      objIsArr = isTypedArray(object);
    }
  }
  if (!othIsArr) {
    othTag = objToString.call(other);
    if (othTag == argsTag) {
      othTag = objectTag;
    } else if (othTag != objectTag) {
      othIsArr = isTypedArray(other);
    }
  }
  var objIsObj = objTag == objectTag && !isHostObject(object),
      othIsObj = othTag == objectTag && !isHostObject(other),
      isSameTag = objTag == othTag;

  if (isSameTag && !(objIsArr || objIsObj)) {
    return equalByTag(object, other, objTag);
  }
  if (!isLoose) {
    var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
        othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');

    if (objIsWrapped || othIsWrapped) {
      return equalFunc(objIsWrapped ? object.value() : object, othIsWrapped ? other.value() : other, customizer, isLoose, stackA, stackB);
    }
  }
  if (!isSameTag) {
    return false;
  }
  // Assume cyclic values are equal.
  // For more information on detecting circular references see https://es5.github.io/#JO.
  stackA || (stackA = []);
  stackB || (stackB = []);

  var length = stackA.length;
  while (length--) {
    if (stackA[length] == object) {
      return stackB[length] == other;
    }
  }
  // Add `object` and `other` to the stack of traversed objects.
  stackA.push(object);
  stackB.push(other);

  var result = (objIsArr ? equalArrays : equalObjects)(object, other, equalFunc, customizer, isLoose, stackA, stackB);

  stackA.pop();
  stackB.pop();

  return result;
}

module.exports = baseIsEqualDeep;

},{"../lang/isArray":104,"../lang/isTypedArray":111,"./equalArrays":70,"./equalByTag":71,"./equalObjects":72,"./isHostObject":83}],43:[function(require,module,exports){
/**
 * The base implementation of `_.isFunction` without support for environments
 * with incorrect `typeof` results.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 */
function baseIsFunction(value) {
  // Avoid a Chakra JIT bug in compatibility modes of IE 11.
  // See https://github.com/jashkenas/underscore/issues/1621 for more details.
  return typeof value == 'function' || false;
}

module.exports = baseIsFunction;

},{}],44:[function(require,module,exports){
var baseIsEqual = require('./baseIsEqual'),
    toObject = require('./toObject');

/**
 * The base implementation of `_.isMatch` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to inspect.
 * @param {Array} matchData The propery names, values, and compare flags to match.
 * @param {Function} [customizer] The function to customize comparing objects.
 * @returns {boolean} Returns `true` if `object` is a match, else `false`.
 */
function baseIsMatch(object, matchData, customizer) {
  var index = matchData.length,
      length = index,
      noCustomizer = !customizer;

  if (object == null) {
    return !length;
  }
  object = toObject(object);
  while (index--) {
    var data = matchData[index];
    if ((noCustomizer && data[2])
          ? data[1] !== object[data[0]]
          : !(data[0] in object)
        ) {
      return false;
    }
  }
  while (++index < length) {
    data = matchData[index];
    var key = data[0],
        objValue = object[key],
        srcValue = data[1];

    if (noCustomizer && data[2]) {
      if (objValue === undefined && !(key in object)) {
        return false;
      }
    } else {
      var result = customizer ? customizer(objValue, srcValue, key) : undefined;
      if (!(result === undefined ? baseIsEqual(srcValue, objValue, customizer, true) : result)) {
        return false;
      }
    }
  }
  return true;
}

module.exports = baseIsMatch;

},{"./baseIsEqual":41,"./toObject":99}],45:[function(require,module,exports){
/**
 * The function whose prototype all chaining wrappers inherit from.
 *
 * @private
 */
function baseLodash() {
  // No operation performed.
}

module.exports = baseLodash;

},{}],46:[function(require,module,exports){
var baseEach = require('./baseEach'),
    isArrayLike = require('./isArrayLike');

/**
 * The base implementation of `_.map` without support for callback shorthands
 * and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function baseMap(collection, iteratee) {
  var index = -1,
      result = isArrayLike(collection) ? Array(collection.length) : [];

  baseEach(collection, function(value, key, collection) {
    result[++index] = iteratee(value, key, collection);
  });
  return result;
}

module.exports = baseMap;

},{"./baseEach":33,"./isArrayLike":82}],47:[function(require,module,exports){
var baseIsMatch = require('./baseIsMatch'),
    getMatchData = require('./getMatchData'),
    toObject = require('./toObject');

/**
 * The base implementation of `_.matches` which does not clone `source`.
 *
 * @private
 * @param {Object} source The object of property values to match.
 * @returns {Function} Returns the new function.
 */
function baseMatches(source) {
  var matchData = getMatchData(source);
  if (matchData.length == 1 && matchData[0][2]) {
    var key = matchData[0][0],
        value = matchData[0][1];

    return function(object) {
      if (object == null) {
        return false;
      }
      object = toObject(object);
      return object[key] === value && (value !== undefined || (key in object));
    };
  }
  return function(object) {
    return baseIsMatch(object, matchData);
  };
}

module.exports = baseMatches;

},{"./baseIsMatch":44,"./getMatchData":76,"./toObject":99}],48:[function(require,module,exports){
var baseGet = require('./baseGet'),
    baseIsEqual = require('./baseIsEqual'),
    baseSlice = require('./baseSlice'),
    isArray = require('../lang/isArray'),
    isKey = require('./isKey'),
    isStrictComparable = require('./isStrictComparable'),
    last = require('../array/last'),
    toObject = require('./toObject'),
    toPath = require('./toPath');

/**
 * The base implementation of `_.matchesProperty` which does not clone `srcValue`.
 *
 * @private
 * @param {string} path The path of the property to get.
 * @param {*} srcValue The value to compare.
 * @returns {Function} Returns the new function.
 */
function baseMatchesProperty(path, srcValue) {
  var isArr = isArray(path),
      isCommon = isKey(path) && isStrictComparable(srcValue),
      pathKey = (path + '');

  path = toPath(path);
  return function(object) {
    if (object == null) {
      return false;
    }
    var key = pathKey;
    object = toObject(object);
    if ((isArr || !isCommon) && !(key in object)) {
      object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
      if (object == null) {
        return false;
      }
      key = last(path);
      object = toObject(object);
    }
    return object[key] === srcValue
      ? (srcValue !== undefined || (key in object))
      : baseIsEqual(srcValue, object[key], undefined, true);
  };
}

module.exports = baseMatchesProperty;

},{"../array/last":12,"../lang/isArray":104,"./baseGet":39,"./baseIsEqual":41,"./baseSlice":52,"./isKey":86,"./isStrictComparable":90,"./toObject":99,"./toPath":100}],49:[function(require,module,exports){
var toObject = require('./toObject');

/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new function.
 */
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : toObject(object)[key];
  };
}

module.exports = baseProperty;

},{"./toObject":99}],50:[function(require,module,exports){
var baseGet = require('./baseGet'),
    toPath = require('./toPath');

/**
 * A specialized version of `baseProperty` which supports deep paths.
 *
 * @private
 * @param {Array|string} path The path of the property to get.
 * @returns {Function} Returns the new function.
 */
function basePropertyDeep(path) {
  var pathKey = (path + '');
  path = toPath(path);
  return function(object) {
    return baseGet(object, path, pathKey);
  };
}

module.exports = basePropertyDeep;

},{"./baseGet":39,"./toPath":100}],51:[function(require,module,exports){
var identity = require('../utility/identity'),
    metaMap = require('./metaMap');

/**
 * The base implementation of `setData` without support for hot loop detection.
 *
 * @private
 * @param {Function} func The function to associate metadata with.
 * @param {*} data The metadata.
 * @returns {Function} Returns `func`.
 */
var baseSetData = !metaMap ? identity : function(func, data) {
  metaMap.set(func, data);
  return func;
};

module.exports = baseSetData;

},{"../utility/identity":120,"./metaMap":92}],52:[function(require,module,exports){
/**
 * The base implementation of `_.slice` without an iteratee call guard.
 *
 * @private
 * @param {Array} array The array to slice.
 * @param {number} [start=0] The start position.
 * @param {number} [end=array.length] The end position.
 * @returns {Array} Returns the slice of `array`.
 */
function baseSlice(array, start, end) {
  var index = -1,
      length = array.length;

  start = start == null ? 0 : (+start || 0);
  if (start < 0) {
    start = -start > length ? 0 : (length + start);
  }
  end = (end === undefined || end > length) ? length : (+end || 0);
  if (end < 0) {
    end += length;
  }
  length = start > end ? 0 : ((end - start) >>> 0);
  start >>>= 0;

  var result = Array(length);
  while (++index < length) {
    result[index] = array[index + start];
  }
  return result;
}

module.exports = baseSlice;

},{}],53:[function(require,module,exports){
/**
 * Converts `value` to a string if it's not one. An empty string is returned
 * for `null` or `undefined` values.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  if (typeof value == 'string') {
    return value;
  }
  return value == null ? '' : (value + '');
}

module.exports = baseToString;

},{}],54:[function(require,module,exports){
/**
 * The base implementation of `_.values` and `_.valuesIn` which creates an
 * array of `object` property values corresponding to the property names
 * of `props`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array} props The property names to get values for.
 * @returns {Object} Returns the array of property values.
 */
function baseValues(object, props) {
  var index = -1,
      length = props.length,
      result = Array(length);

  while (++index < length) {
    result[index] = object[props[index]];
  }
  return result;
}

module.exports = baseValues;

},{}],55:[function(require,module,exports){
var binaryIndexBy = require('./binaryIndexBy'),
    identity = require('../utility/identity');

/** Used as references for the maximum length and index of an array. */
var MAX_ARRAY_LENGTH = 4294967295,
    HALF_MAX_ARRAY_LENGTH = MAX_ARRAY_LENGTH >>> 1;

/**
 * Performs a binary search of `array` to determine the index at which `value`
 * should be inserted into `array` in order to maintain its sort order.
 *
 * @private
 * @param {Array} array The sorted array to inspect.
 * @param {*} value The value to evaluate.
 * @param {boolean} [retHighest] Specify returning the highest qualified index.
 * @returns {number} Returns the index at which `value` should be inserted
 *  into `array`.
 */
function binaryIndex(array, value, retHighest) {
  var low = 0,
      high = array ? array.length : low;

  if (typeof value == 'number' && value === value && high <= HALF_MAX_ARRAY_LENGTH) {
    while (low < high) {
      var mid = (low + high) >>> 1,
          computed = array[mid];

      if ((retHighest ? (computed <= value) : (computed < value)) && computed !== null) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return high;
  }
  return binaryIndexBy(array, value, identity, retHighest);
}

module.exports = binaryIndex;

},{"../utility/identity":120,"./binaryIndexBy":56}],56:[function(require,module,exports){
/** Native method references. */
var floor = Math.floor;

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMin = Math.min;

/** Used as references for the maximum length and index of an array. */
var MAX_ARRAY_LENGTH = 4294967295,
    MAX_ARRAY_INDEX = MAX_ARRAY_LENGTH - 1;

/**
 * This function is like `binaryIndex` except that it invokes `iteratee` for
 * `value` and each element of `array` to compute their sort ranking. The
 * iteratee is invoked with one argument; (value).
 *
 * @private
 * @param {Array} array The sorted array to inspect.
 * @param {*} value The value to evaluate.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {boolean} [retHighest] Specify returning the highest qualified index.
 * @returns {number} Returns the index at which `value` should be inserted
 *  into `array`.
 */
function binaryIndexBy(array, value, iteratee, retHighest) {
  value = iteratee(value);

  var low = 0,
      high = array ? array.length : 0,
      valIsNaN = value !== value,
      valIsNull = value === null,
      valIsUndef = value === undefined;

  while (low < high) {
    var mid = floor((low + high) / 2),
        computed = iteratee(array[mid]),
        isDef = computed !== undefined,
        isReflexive = computed === computed;

    if (valIsNaN) {
      var setLow = isReflexive || retHighest;
    } else if (valIsNull) {
      setLow = isReflexive && isDef && (retHighest || computed != null);
    } else if (valIsUndef) {
      setLow = isReflexive && (retHighest || isDef);
    } else if (computed == null) {
      setLow = false;
    } else {
      setLow = retHighest ? (computed <= value) : (computed < value);
    }
    if (setLow) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return nativeMin(high, MAX_ARRAY_INDEX);
}

module.exports = binaryIndexBy;

},{}],57:[function(require,module,exports){
var identity = require('../utility/identity');

/**
 * A specialized version of `baseCallback` which only supports `this` binding
 * and specifying the number of arguments to provide to `func`.
 *
 * @private
 * @param {Function} func The function to bind.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {number} [argCount] The number of arguments to provide to `func`.
 * @returns {Function} Returns the callback.
 */
function bindCallback(func, thisArg, argCount) {
  if (typeof func != 'function') {
    return identity;
  }
  if (thisArg === undefined) {
    return func;
  }
  switch (argCount) {
    case 1: return function(value) {
      return func.call(thisArg, value);
    };
    case 3: return function(value, index, collection) {
      return func.call(thisArg, value, index, collection);
    };
    case 4: return function(accumulator, value, index, collection) {
      return func.call(thisArg, accumulator, value, index, collection);
    };
    case 5: return function(value, other, key, object, source) {
      return func.call(thisArg, value, other, key, object, source);
    };
  }
  return function() {
    return func.apply(thisArg, arguments);
  };
}

module.exports = bindCallback;

},{"../utility/identity":120}],58:[function(require,module,exports){
(function (global){
var constant = require('../utility/constant'),
    getNative = require('./getNative');

/** Native method references. */
var ArrayBuffer = getNative(global, 'ArrayBuffer'),
    bufferSlice = getNative(ArrayBuffer && new ArrayBuffer(0), 'slice'),
    floor = Math.floor,
    Uint8Array = getNative(global, 'Uint8Array');

/** Used to clone array buffers. */
var Float64Array = (function() {
  // Safari 5 errors when using an array buffer to initialize a typed array
  // where the array buffer's `byteLength` is not a multiple of the typed
  // array's `BYTES_PER_ELEMENT`.
  try {
    var func = getNative(global, 'Float64Array'),
        result = new func(new ArrayBuffer(10), 0, 1) && func;
  } catch(e) {}
  return result || null;
}());

/** Used as the size, in bytes, of each `Float64Array` element. */
var FLOAT64_BYTES_PER_ELEMENT = Float64Array ? Float64Array.BYTES_PER_ELEMENT : 0;

/**
 * Creates a clone of the given array buffer.
 *
 * @private
 * @param {ArrayBuffer} buffer The array buffer to clone.
 * @returns {ArrayBuffer} Returns the cloned array buffer.
 */
function bufferClone(buffer) {
  return bufferSlice.call(buffer, 0);
}
if (!bufferSlice) {
  // PhantomJS has `ArrayBuffer` and `Uint8Array` but not `Float64Array`.
  bufferClone = !(ArrayBuffer && Uint8Array) ? constant(null) : function(buffer) {
    var byteLength = buffer.byteLength,
        floatLength = Float64Array ? floor(byteLength / FLOAT64_BYTES_PER_ELEMENT) : 0,
        offset = floatLength * FLOAT64_BYTES_PER_ELEMENT,
        result = new ArrayBuffer(byteLength);

    if (floatLength) {
      var view = new Float64Array(result, 0, floatLength);
      view.set(new Float64Array(buffer, 0, floatLength));
    }
    if (byteLength != offset) {
      view = new Uint8Array(result, offset);
      view.set(new Uint8Array(buffer, offset));
    }
    return result;
  };
}

module.exports = bufferClone;

}).call(this,require("--global--"))
},{"--global--":123,"../utility/constant":119,"./getNative":77}],59:[function(require,module,exports){
/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates an array that is the composition of partially applied arguments,
 * placeholders, and provided arguments into a single array of arguments.
 *
 * @private
 * @param {Array|Object} args The provided arguments.
 * @param {Array} partials The arguments to prepend to those provided.
 * @param {Array} holders The `partials` placeholder indexes.
 * @returns {Array} Returns the new array of composed arguments.
 */
function composeArgs(args, partials, holders) {
  var holdersLength = holders.length,
      argsIndex = -1,
      argsLength = nativeMax(args.length - holdersLength, 0),
      leftIndex = -1,
      leftLength = partials.length,
      result = Array(argsLength + leftLength);

  while (++leftIndex < leftLength) {
    result[leftIndex] = partials[leftIndex];
  }
  while (++argsIndex < holdersLength) {
    result[holders[argsIndex]] = args[argsIndex];
  }
  while (argsLength--) {
    result[leftIndex++] = args[argsIndex++];
  }
  return result;
}

module.exports = composeArgs;

},{}],60:[function(require,module,exports){
/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * This function is like `composeArgs` except that the arguments composition
 * is tailored for `_.partialRight`.
 *
 * @private
 * @param {Array|Object} args The provided arguments.
 * @param {Array} partials The arguments to append to those provided.
 * @param {Array} holders The `partials` placeholder indexes.
 * @returns {Array} Returns the new array of composed arguments.
 */
function composeArgsRight(args, partials, holders) {
  var holdersIndex = -1,
      holdersLength = holders.length,
      argsIndex = -1,
      argsLength = nativeMax(args.length - holdersLength, 0),
      rightIndex = -1,
      rightLength = partials.length,
      result = Array(argsLength + rightLength);

  while (++argsIndex < argsLength) {
    result[argsIndex] = args[argsIndex];
  }
  var offset = argsIndex;
  while (++rightIndex < rightLength) {
    result[offset + rightIndex] = partials[rightIndex];
  }
  while (++holdersIndex < holdersLength) {
    result[offset + holders[holdersIndex]] = args[argsIndex++];
  }
  return result;
}

module.exports = composeArgsRight;

},{}],61:[function(require,module,exports){
var getLength = require('./getLength'),
    isLength = require('./isLength'),
    toObject = require('./toObject');

/**
 * Creates a `baseEach` or `baseEachRight` function.
 *
 * @private
 * @param {Function} eachFunc The function to iterate over a collection.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new base function.
 */
function createBaseEach(eachFunc, fromRight) {
  return function(collection, iteratee) {
    var length = collection ? getLength(collection) : 0;
    if (!isLength(length)) {
      return eachFunc(collection, iteratee);
    }
    var index = fromRight ? length : -1,
        iterable = toObject(collection);

    while ((fromRight ? index-- : ++index < length)) {
      if (iteratee(iterable[index], index, iterable) === false) {
        break;
      }
    }
    return collection;
  };
}

module.exports = createBaseEach;

},{"./getLength":75,"./isLength":88,"./toObject":99}],62:[function(require,module,exports){
var toObject = require('./toObject');

/**
 * Creates a base function for `_.forIn` or `_.forInRight`.
 *
 * @private
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new base function.
 */
function createBaseFor(fromRight) {
  return function(object, iteratee, keysFunc) {
    var iterable = toObject(object),
        props = keysFunc(object),
        length = props.length,
        index = fromRight ? length : -1;

    while ((fromRight ? index-- : ++index < length)) {
      var key = props[index];
      if (iteratee(iterable[key], key, iterable) === false) {
        break;
      }
    }
    return object;
  };
}

module.exports = createBaseFor;

},{"./toObject":99}],63:[function(require,module,exports){
(function (global){
var createCtorWrapper = require('./createCtorWrapper');

/**
 * Creates a function that wraps `func` and invokes it with the `this`
 * binding of `thisArg`.
 *
 * @private
 * @param {Function} func The function to bind.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @returns {Function} Returns the new bound function.
 */
function createBindWrapper(func, thisArg) {
  var Ctor = createCtorWrapper(func);

  function wrapper() {
    var fn = (this && this !== global && this instanceof wrapper) ? Ctor : func;
    return fn.apply(thisArg, arguments);
  }
  return wrapper;
}

module.exports = createBindWrapper;

}).call(this,require("--global--"))
},{"--global--":123,"./createCtorWrapper":64}],64:[function(require,module,exports){
var baseCreate = require('./baseCreate'),
    isObject = require('../lang/isObject');

/**
 * Creates a function that produces an instance of `Ctor` regardless of
 * whether it was invoked as part of a `new` expression or by `call` or `apply`.
 *
 * @private
 * @param {Function} Ctor The constructor to wrap.
 * @returns {Function} Returns the new wrapped function.
 */
function createCtorWrapper(Ctor) {
  return function() {
    // Use a `switch` statement to work with class constructors.
    // See https://people.mozilla.org/~jorendorff/es6-draft.html#sec-ecmascript-function-objects-call-thisargument-argumentslist
    // for more details.
    var args = arguments;
    switch (args.length) {
      case 0: return new Ctor;
      case 1: return new Ctor(args[0]);
      case 2: return new Ctor(args[0], args[1]);
      case 3: return new Ctor(args[0], args[1], args[2]);
      case 4: return new Ctor(args[0], args[1], args[2], args[3]);
      case 5: return new Ctor(args[0], args[1], args[2], args[3], args[4]);
    }
    var thisBinding = baseCreate(Ctor.prototype),
        result = Ctor.apply(thisBinding, args);

    // Mimic the constructor's `return` behavior.
    // See https://es5.github.io/#x13.2.2 for more details.
    return isObject(result) ? result : thisBinding;
  };
}

module.exports = createCtorWrapper;

},{"../lang/isObject":108,"./baseCreate":32}],65:[function(require,module,exports){
var baseCallback = require('./baseCallback'),
    baseFind = require('./baseFind'),
    baseFindIndex = require('./baseFindIndex'),
    isArray = require('../lang/isArray');

/**
 * Creates a `_.find` or `_.findLast` function.
 *
 * @private
 * @param {Function} eachFunc The function to iterate over a collection.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new find function.
 */
function createFind(eachFunc, fromRight) {
  return function(collection, predicate, thisArg) {
    predicate = baseCallback(predicate, thisArg, 3);
    if (isArray(collection)) {
      var index = baseFindIndex(collection, predicate, fromRight);
      return index > -1 ? collection[index] : undefined;
    }
    return baseFind(collection, predicate, eachFunc);
  };
}

module.exports = createFind;

},{"../lang/isArray":104,"./baseCallback":29,"./baseFind":34,"./baseFindIndex":35}],66:[function(require,module,exports){
var bindCallback = require('./bindCallback'),
    isArray = require('../lang/isArray');

/**
 * Creates a function for `_.forEach` or `_.forEachRight`.
 *
 * @private
 * @param {Function} arrayFunc The function to iterate over an array.
 * @param {Function} eachFunc The function to iterate over a collection.
 * @returns {Function} Returns the new each function.
 */
function createForEach(arrayFunc, eachFunc) {
  return function(collection, iteratee, thisArg) {
    return (typeof iteratee == 'function' && thisArg === undefined && isArray(collection))
      ? arrayFunc(collection, iteratee)
      : eachFunc(collection, bindCallback(iteratee, thisArg, 3));
  };
}

module.exports = createForEach;

},{"../lang/isArray":104,"./bindCallback":57}],67:[function(require,module,exports){
(function (global){
var arrayCopy = require('./arrayCopy'),
    composeArgs = require('./composeArgs'),
    composeArgsRight = require('./composeArgsRight'),
    createCtorWrapper = require('./createCtorWrapper'),
    isLaziable = require('./isLaziable'),
    reorder = require('./reorder'),
    replaceHolders = require('./replaceHolders'),
    setData = require('./setData');

/** Used to compose bitmasks for wrapper metadata. */
var BIND_FLAG = 1,
    BIND_KEY_FLAG = 2,
    CURRY_BOUND_FLAG = 4,
    CURRY_FLAG = 8,
    CURRY_RIGHT_FLAG = 16,
    PARTIAL_FLAG = 32,
    PARTIAL_RIGHT_FLAG = 64,
    ARY_FLAG = 128;

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates a function that wraps `func` and invokes it with optional `this`
 * binding of, partial application, and currying.
 *
 * @private
 * @param {Function|string} func The function or method name to reference.
 * @param {number} bitmask The bitmask of flags. See `createWrapper` for more details.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {Array} [partials] The arguments to prepend to those provided to the new function.
 * @param {Array} [holders] The `partials` placeholder indexes.
 * @param {Array} [partialsRight] The arguments to append to those provided to the new function.
 * @param {Array} [holdersRight] The `partialsRight` placeholder indexes.
 * @param {Array} [argPos] The argument positions of the new function.
 * @param {number} [ary] The arity cap of `func`.
 * @param {number} [arity] The arity of `func`.
 * @returns {Function} Returns the new wrapped function.
 */
function createHybridWrapper(func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity) {
  var isAry = bitmask & ARY_FLAG,
      isBind = bitmask & BIND_FLAG,
      isBindKey = bitmask & BIND_KEY_FLAG,
      isCurry = bitmask & CURRY_FLAG,
      isCurryBound = bitmask & CURRY_BOUND_FLAG,
      isCurryRight = bitmask & CURRY_RIGHT_FLAG,
      Ctor = isBindKey ? null : createCtorWrapper(func);

  function wrapper() {
    // Avoid `arguments` object use disqualifying optimizations by
    // converting it to an array before providing it to other functions.
    var length = arguments.length,
        index = length,
        args = Array(length);

    while (index--) {
      args[index] = arguments[index];
    }
    if (partials) {
      args = composeArgs(args, partials, holders);
    }
    if (partialsRight) {
      args = composeArgsRight(args, partialsRight, holdersRight);
    }
    if (isCurry || isCurryRight) {
      var placeholder = wrapper.placeholder,
          argsHolders = replaceHolders(args, placeholder);

      length -= argsHolders.length;
      if (length < arity) {
        var newArgPos = argPos ? arrayCopy(argPos) : null,
            newArity = nativeMax(arity - length, 0),
            newsHolders = isCurry ? argsHolders : null,
            newHoldersRight = isCurry ? null : argsHolders,
            newPartials = isCurry ? args : null,
            newPartialsRight = isCurry ? null : args;

        bitmask |= (isCurry ? PARTIAL_FLAG : PARTIAL_RIGHT_FLAG);
        bitmask &= ~(isCurry ? PARTIAL_RIGHT_FLAG : PARTIAL_FLAG);

        if (!isCurryBound) {
          bitmask &= ~(BIND_FLAG | BIND_KEY_FLAG);
        }
        var newData = [func, bitmask, thisArg, newPartials, newsHolders, newPartialsRight, newHoldersRight, newArgPos, ary, newArity],
            result = createHybridWrapper.apply(undefined, newData);

        if (isLaziable(func)) {
          setData(result, newData);
        }
        result.placeholder = placeholder;
        return result;
      }
    }
    var thisBinding = isBind ? thisArg : this,
        fn = isBindKey ? thisBinding[func] : func;

    if (argPos) {
      args = reorder(args, argPos);
    }
    if (isAry && ary < args.length) {
      args.length = ary;
    }
    if (this && this !== global && this instanceof wrapper) {
      fn = Ctor || createCtorWrapper(func);
    }
    return fn.apply(thisBinding, args);
  }
  return wrapper;
}

module.exports = createHybridWrapper;

}).call(this,require("--global--"))
},{"--global--":123,"./arrayCopy":24,"./composeArgs":59,"./composeArgsRight":60,"./createCtorWrapper":64,"./isLaziable":87,"./reorder":94,"./replaceHolders":95,"./setData":96}],68:[function(require,module,exports){
(function (global){
var createCtorWrapper = require('./createCtorWrapper');

/** Used to compose bitmasks for wrapper metadata. */
var BIND_FLAG = 1;

/**
 * Creates a function that wraps `func` and invokes it with the optional `this`
 * binding of `thisArg` and the `partials` prepended to those provided to
 * the wrapper.
 *
 * @private
 * @param {Function} func The function to partially apply arguments to.
 * @param {number} bitmask The bitmask of flags. See `createWrapper` for more details.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {Array} partials The arguments to prepend to those provided to the new function.
 * @returns {Function} Returns the new bound function.
 */
function createPartialWrapper(func, bitmask, thisArg, partials) {
  var isBind = bitmask & BIND_FLAG,
      Ctor = createCtorWrapper(func);

  function wrapper() {
    // Avoid `arguments` object use disqualifying optimizations by
    // converting it to an array before providing it `func`.
    var argsIndex = -1,
        argsLength = arguments.length,
        leftIndex = -1,
        leftLength = partials.length,
        args = Array(argsLength + leftLength);

    while (++leftIndex < leftLength) {
      args[leftIndex] = partials[leftIndex];
    }
    while (argsLength--) {
      args[leftIndex++] = arguments[++argsIndex];
    }
    var fn = (this && this !== global && this instanceof wrapper) ? Ctor : func;
    return fn.apply(isBind ? thisArg : this, args);
  }
  return wrapper;
}

module.exports = createPartialWrapper;

}).call(this,require("--global--"))
},{"--global--":123,"./createCtorWrapper":64}],69:[function(require,module,exports){
var baseSetData = require('./baseSetData'),
    createBindWrapper = require('./createBindWrapper'),
    createHybridWrapper = require('./createHybridWrapper'),
    createPartialWrapper = require('./createPartialWrapper'),
    getData = require('./getData'),
    mergeData = require('./mergeData'),
    setData = require('./setData');

/** Used to compose bitmasks for wrapper metadata. */
var BIND_FLAG = 1,
    BIND_KEY_FLAG = 2,
    PARTIAL_FLAG = 32,
    PARTIAL_RIGHT_FLAG = 64;

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates a function that either curries or invokes `func` with optional
 * `this` binding and partially applied arguments.
 *
 * @private
 * @param {Function|string} func The function or method name to reference.
 * @param {number} bitmask The bitmask of flags.
 *  The bitmask may be composed of the following flags:
 *     1 - `_.bind`
 *     2 - `_.bindKey`
 *     4 - `_.curry` or `_.curryRight` of a bound function
 *     8 - `_.curry`
 *    16 - `_.curryRight`
 *    32 - `_.partial`
 *    64 - `_.partialRight`
 *   128 - `_.rearg`
 *   256 - `_.ary`
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {Array} [partials] The arguments to be partially applied.
 * @param {Array} [holders] The `partials` placeholder indexes.
 * @param {Array} [argPos] The argument positions of the new function.
 * @param {number} [ary] The arity cap of `func`.
 * @param {number} [arity] The arity of `func`.
 * @returns {Function} Returns the new wrapped function.
 */
function createWrapper(func, bitmask, thisArg, partials, holders, argPos, ary, arity) {
  var isBindKey = bitmask & BIND_KEY_FLAG;
  if (!isBindKey && typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var length = partials ? partials.length : 0;
  if (!length) {
    bitmask &= ~(PARTIAL_FLAG | PARTIAL_RIGHT_FLAG);
    partials = holders = null;
  }
  length -= (holders ? holders.length : 0);
  if (bitmask & PARTIAL_RIGHT_FLAG) {
    var partialsRight = partials,
        holdersRight = holders;

    partials = holders = null;
  }
  var data = isBindKey ? null : getData(func),
      newData = [func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity];

  if (data) {
    mergeData(newData, data);
    bitmask = newData[1];
    arity = newData[9];
  }
  newData[9] = arity == null
    ? (isBindKey ? 0 : func.length)
    : (nativeMax(arity - length, 0) || 0);

  if (bitmask == BIND_FLAG) {
    var result = createBindWrapper(newData[0], newData[2]);
  } else if ((bitmask == PARTIAL_FLAG || bitmask == (BIND_FLAG | PARTIAL_FLAG)) && !newData[4].length) {
    result = createPartialWrapper.apply(undefined, newData);
  } else {
    result = createHybridWrapper.apply(undefined, newData);
  }
  var setter = data ? baseSetData : setData;
  return setter(result, newData);
}

module.exports = createWrapper;

},{"./baseSetData":51,"./createBindWrapper":63,"./createHybridWrapper":67,"./createPartialWrapper":68,"./getData":73,"./mergeData":91,"./setData":96}],70:[function(require,module,exports){
var arraySome = require('./arraySome');

/**
 * A specialized version of `baseIsEqualDeep` for arrays with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Array} array The array to compare.
 * @param {Array} other The other array to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing arrays.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
 */
function equalArrays(array, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var index = -1,
      arrLength = array.length,
      othLength = other.length;

  if (arrLength != othLength && !(isLoose && othLength > arrLength)) {
    return false;
  }
  // Ignore non-index properties.
  while (++index < arrLength) {
    var arrValue = array[index],
        othValue = other[index],
        result = customizer ? customizer(isLoose ? othValue : arrValue, isLoose ? arrValue : othValue, index) : undefined;

    if (result !== undefined) {
      if (result) {
        continue;
      }
      return false;
    }
    // Recursively compare arrays (susceptible to call stack limits).
    if (isLoose) {
      if (!arraySome(other, function(othValue) {
            return arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB);
          })) {
        return false;
      }
    } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB))) {
      return false;
    }
  }
  return true;
}

module.exports = equalArrays;

},{"./arraySome":27}],71:[function(require,module,exports){
/** `Object#toString` result references. */
var boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    numberTag = '[object Number]',
    regexpTag = '[object RegExp]',
    stringTag = '[object String]';

/**
 * A specialized version of `baseIsEqualDeep` for comparing objects of
 * the same `toStringTag`.
 *
 * **Note:** This function only supports comparing values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 * @private
 * @param {Object} value The object to compare.
 * @param {Object} other The other object to compare.
 * @param {string} tag The `toStringTag` of the objects to compare.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalByTag(object, other, tag) {
  switch (tag) {
    case boolTag:
    case dateTag:
      // Coerce dates and booleans to numbers, dates to milliseconds and booleans
      // to `1` or `0` treating invalid dates coerced to `NaN` as not equal.
      return +object == +other;

    case errorTag:
      return object.name == other.name && object.message == other.message;

    case numberTag:
      // Treat `NaN` vs. `NaN` as equal.
      return (object != +object)
        ? other != +other
        : object == +other;

    case regexpTag:
    case stringTag:
      // Coerce regexes to strings and treat strings primitives and string
      // objects as equal. See https://es5.github.io/#x15.10.6.4 for more details.
      return object == (other + '');
  }
  return false;
}

module.exports = equalByTag;

},{}],72:[function(require,module,exports){
var keys = require('../object/keys');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A specialized version of `baseIsEqualDeep` for objects with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing values.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalObjects(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var objProps = keys(object),
      objLength = objProps.length,
      othProps = keys(other),
      othLength = othProps.length;

  if (objLength != othLength && !isLoose) {
    return false;
  }
  var index = objLength;
  while (index--) {
    var key = objProps[index];
    if (!(isLoose ? key in other : hasOwnProperty.call(other, key))) {
      return false;
    }
  }
  var skipCtor = isLoose;
  while (++index < objLength) {
    key = objProps[index];
    var objValue = object[key],
        othValue = other[key],
        result = customizer ? customizer(isLoose ? othValue : objValue, isLoose? objValue : othValue, key) : undefined;

    // Recursively compare objects (susceptible to call stack limits).
    if (!(result === undefined ? equalFunc(objValue, othValue, customizer, isLoose, stackA, stackB) : result)) {
      return false;
    }
    skipCtor || (skipCtor = key == 'constructor');
  }
  if (!skipCtor) {
    var objCtor = object.constructor,
        othCtor = other.constructor;

    // Non `Object` object instances with different constructors are not equal.
    if (objCtor != othCtor &&
        ('constructor' in object && 'constructor' in other) &&
        !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
          typeof othCtor == 'function' && othCtor instanceof othCtor)) {
      return false;
    }
  }
  return true;
}

module.exports = equalObjects;

},{"../object/keys":113}],73:[function(require,module,exports){
var metaMap = require('./metaMap'),
    noop = require('../utility/noop');

/**
 * Gets metadata for `func`.
 *
 * @private
 * @param {Function} func The function to query.
 * @returns {*} Returns the metadata for `func`.
 */
var getData = !metaMap ? noop : function(func) {
  return metaMap.get(func);
};

module.exports = getData;

},{"../utility/noop":121,"./metaMap":92}],74:[function(require,module,exports){
var realNames = require('./realNames');

/**
 * Gets the name of `func`.
 *
 * @private
 * @param {Function} func The function to query.
 * @returns {string} Returns the function name.
 */
function getFuncName(func) {
  var result = func.name,
      array = realNames[result],
      length = array ? array.length : 0;

  while (length--) {
    var data = array[length],
        otherFunc = data.func;
    if (otherFunc == null || otherFunc == func) {
      return data.name;
    }
  }
  return result;
}

module.exports = getFuncName;

},{"./realNames":93}],75:[function(require,module,exports){
var baseProperty = require('./baseProperty');

/**
 * Gets the "length" property value of `object`.
 *
 * **Note:** This function is used to avoid a [JIT bug](https://bugs.webkit.org/show_bug.cgi?id=142792)
 * that affects Safari on at least iOS 8.1-8.3 ARM64.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {*} Returns the "length" value.
 */
var getLength = baseProperty('length');

module.exports = getLength;

},{"./baseProperty":49}],76:[function(require,module,exports){
var isStrictComparable = require('./isStrictComparable'),
    pairs = require('../object/pairs');

/**
 * Gets the propery names, values, and compare flags of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the match data of `object`.
 */
function getMatchData(object) {
  var result = pairs(object),
      length = result.length;

  while (length--) {
    result[length][2] = isStrictComparable(result[length][1]);
  }
  return result;
}

module.exports = getMatchData;

},{"../object/pairs":115,"./isStrictComparable":90}],77:[function(require,module,exports){
var isNative = require('../lang/isNative');

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = object == null ? undefined : object[key];
  return isNative(value) ? value : undefined;
}

module.exports = getNative;

},{"../lang/isNative":107}],78:[function(require,module,exports){
/**
 * Gets the index at which the first occurrence of `NaN` is found in `array`.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {number} fromIndex The index to search from.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {number} Returns the index of the matched `NaN`, else `-1`.
 */
function indexOfNaN(array, fromIndex, fromRight) {
  var length = array.length,
      index = fromIndex + (fromRight ? 0 : -1);

  while ((fromRight ? index-- : ++index < length)) {
    var other = array[index];
    if (other !== other) {
      return index;
    }
  }
  return -1;
}

module.exports = indexOfNaN;

},{}],79:[function(require,module,exports){
/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Initializes an array clone.
 *
 * @private
 * @param {Array} array The array to clone.
 * @returns {Array} Returns the initialized clone.
 */
function initCloneArray(array) {
  var length = array.length,
      result = new array.constructor(length);

  // Add array properties assigned by `RegExp#exec`.
  if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
    result.index = array.index;
    result.input = array.input;
  }
  return result;
}

module.exports = initCloneArray;

},{}],80:[function(require,module,exports){
(function (global){
var bufferClone = require('./bufferClone');

/** `Object#toString` result references. */
var boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    numberTag = '[object Number]',
    regexpTag = '[object RegExp]',
    stringTag = '[object String]';

var arrayBufferTag = '[object ArrayBuffer]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to match `RegExp` flags from their coerced string values. */
var reFlags = /\w*$/;

/** Used to lookup a type array constructors by `toStringTag`. */
var ctorByTag = {};
ctorByTag[float32Tag] = global.Float32Array;
ctorByTag[float64Tag] = global.Float64Array;
ctorByTag[int8Tag] = global.Int8Array;
ctorByTag[int16Tag] = global.Int16Array;
ctorByTag[int32Tag] = global.Int32Array;
ctorByTag[uint8Tag] = global.Uint8Array;
ctorByTag[uint8ClampedTag] = global.Uint8ClampedArray;
ctorByTag[uint16Tag] = global.Uint16Array;
ctorByTag[uint32Tag] = global.Uint32Array;

/**
 * Initializes an object clone based on its `toStringTag`.
 *
 * **Note:** This function only supports cloning values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 * @private
 * @param {Object} object The object to clone.
 * @param {string} tag The `toStringTag` of the object to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the initialized clone.
 */
function initCloneByTag(object, tag, isDeep) {
  var Ctor = object.constructor;
  switch (tag) {
    case arrayBufferTag:
      return bufferClone(object);

    case boolTag:
    case dateTag:
      return new Ctor(+object);

    case float32Tag: case float64Tag:
    case int8Tag: case int16Tag: case int32Tag:
    case uint8Tag: case uint8ClampedTag: case uint16Tag: case uint32Tag:
      // Safari 5 mobile incorrectly has `Object` as the constructor of typed arrays.
      if (Ctor instanceof Ctor) {
        Ctor = ctorByTag[tag];
      }
      var buffer = object.buffer;
      return new Ctor(isDeep ? bufferClone(buffer) : buffer, object.byteOffset, object.length);

    case numberTag:
    case stringTag:
      return new Ctor(object);

    case regexpTag:
      var result = new Ctor(object.source, reFlags.exec(object));
      result.lastIndex = object.lastIndex;
  }
  return result;
}

module.exports = initCloneByTag;

}).call(this,require("--global--"))
},{"--global--":123,"./bufferClone":58}],81:[function(require,module,exports){
/**
 * Initializes an object clone.
 *
 * @private
 * @param {Object} object The object to clone.
 * @returns {Object} Returns the initialized clone.
 */
function initCloneObject(object) {
  var Ctor = object.constructor;
  if (!(typeof Ctor == 'function' && Ctor instanceof Ctor)) {
    Ctor = Object;
  }
  return new Ctor;
}

module.exports = initCloneObject;

},{}],82:[function(require,module,exports){
var getLength = require('./getLength'),
    isLength = require('./isLength');

/**
 * Checks if `value` is array-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 */
function isArrayLike(value) {
  return value != null && isLength(getLength(value));
}

module.exports = isArrayLike;

},{"./getLength":75,"./isLength":88}],83:[function(require,module,exports){
/**
 * Checks if `value` is a host object in IE < 9.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
 */
var isHostObject = (function() {
  try {
    Object({ 'toString': 0 } + '');
  } catch(e) {
    return function() { return false; };
  }
  return function(value) {
    // IE < 9 presents many host objects as `Object` objects that can coerce
    // to strings despite having improperly defined `toString` methods.
    return typeof value.toString != 'function' && typeof (value + '') == 'string';
  };
}());

module.exports = isHostObject;

},{}],84:[function(require,module,exports){
/** Used to detect unsigned integer values. */
var reIsUint = /^\d+$/;

/**
 * Used as the [maximum length](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  value = (typeof value == 'number' || reIsUint.test(value)) ? +value : -1;
  length = length == null ? MAX_SAFE_INTEGER : length;
  return value > -1 && value % 1 == 0 && value < length;
}

module.exports = isIndex;

},{}],85:[function(require,module,exports){
var isArrayLike = require('./isArrayLike'),
    isIndex = require('./isIndex'),
    isObject = require('../lang/isObject');

/**
 * Checks if the provided arguments are from an iteratee call.
 *
 * @private
 * @param {*} value The potential iteratee value argument.
 * @param {*} index The potential iteratee index or key argument.
 * @param {*} object The potential iteratee object argument.
 * @returns {boolean} Returns `true` if the arguments are from an iteratee call, else `false`.
 */
function isIterateeCall(value, index, object) {
  if (!isObject(object)) {
    return false;
  }
  var type = typeof index;
  if (type == 'number'
      ? (isArrayLike(object) && isIndex(index, object.length))
      : (type == 'string' && index in object)) {
    var other = object[index];
    return value === value ? (value === other) : (other !== other);
  }
  return false;
}

module.exports = isIterateeCall;

},{"../lang/isObject":108,"./isArrayLike":82,"./isIndex":84}],86:[function(require,module,exports){
var isArray = require('../lang/isArray'),
    toObject = require('./toObject');

/** Used to match property names within property paths. */
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\n\\]|\\.)*?\1)\]/,
    reIsPlainProp = /^\w*$/;

/**
 * Checks if `value` is a property name and not a property path.
 *
 * @private
 * @param {*} value The value to check.
 * @param {Object} [object] The object to query keys on.
 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
 */
function isKey(value, object) {
  var type = typeof value;
  if ((type == 'string' && reIsPlainProp.test(value)) || type == 'number') {
    return true;
  }
  if (isArray(value)) {
    return false;
  }
  var result = !reIsDeepProp.test(value);
  return result || (object != null && value in toObject(object));
}

module.exports = isKey;

},{"../lang/isArray":104,"./toObject":99}],87:[function(require,module,exports){
var LazyWrapper = require('./LazyWrapper'),
    getData = require('./getData'),
    getFuncName = require('./getFuncName'),
    lodash = require('../chain/lodash');

/**
 * Checks if `func` has a lazy counterpart.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` has a lazy counterpart, else `false`.
 */
function isLaziable(func) {
  var funcName = getFuncName(func);
  if (!(funcName in LazyWrapper.prototype)) {
    return false;
  }
  var other = lodash[funcName];
  if (func === other) {
    return true;
  }
  var data = getData(other);
  return !!data && func === data[0];
}

module.exports = isLaziable;

},{"../chain/lodash":13,"./LazyWrapper":22,"./getData":73,"./getFuncName":74}],88:[function(require,module,exports){
/**
 * Used as the [maximum length](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

module.exports = isLength;

},{}],89:[function(require,module,exports){
/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

module.exports = isObjectLike;

},{}],90:[function(require,module,exports){
var isObject = require('../lang/isObject');

/**
 * Checks if `value` is suitable for strict equality comparisons, i.e. `===`.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` if suitable for strict
 *  equality comparisons, else `false`.
 */
function isStrictComparable(value) {
  return value === value && !isObject(value);
}

module.exports = isStrictComparable;

},{"../lang/isObject":108}],91:[function(require,module,exports){
var arrayCopy = require('./arrayCopy'),
    composeArgs = require('./composeArgs'),
    composeArgsRight = require('./composeArgsRight'),
    replaceHolders = require('./replaceHolders');

/** Used to compose bitmasks for wrapper metadata. */
var BIND_FLAG = 1,
    CURRY_BOUND_FLAG = 4,
    CURRY_FLAG = 8,
    ARY_FLAG = 128,
    REARG_FLAG = 256;

/** Used as the internal argument placeholder. */
var PLACEHOLDER = '__lodash_placeholder__';

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMin = Math.min;

/**
 * Merges the function metadata of `source` into `data`.
 *
 * Merging metadata reduces the number of wrappers required to invoke a function.
 * This is possible because methods like `_.bind`, `_.curry`, and `_.partial`
 * may be applied regardless of execution order. Methods like `_.ary` and `_.rearg`
 * augment function arguments, making the order in which they are executed important,
 * preventing the merging of metadata. However, we make an exception for a safe
 * common case where curried functions have `_.ary` and or `_.rearg` applied.
 *
 * @private
 * @param {Array} data The destination metadata.
 * @param {Array} source The source metadata.
 * @returns {Array} Returns `data`.
 */
function mergeData(data, source) {
  var bitmask = data[1],
      srcBitmask = source[1],
      newBitmask = bitmask | srcBitmask,
      isCommon = newBitmask < ARY_FLAG;

  var isCombo =
    (srcBitmask == ARY_FLAG && bitmask == CURRY_FLAG) ||
    (srcBitmask == ARY_FLAG && bitmask == REARG_FLAG && data[7].length <= source[8]) ||
    (srcBitmask == (ARY_FLAG | REARG_FLAG) && bitmask == CURRY_FLAG);

  // Exit early if metadata can't be merged.
  if (!(isCommon || isCombo)) {
    return data;
  }
  // Use source `thisArg` if available.
  if (srcBitmask & BIND_FLAG) {
    data[2] = source[2];
    // Set when currying a bound function.
    newBitmask |= (bitmask & BIND_FLAG) ? 0 : CURRY_BOUND_FLAG;
  }
  // Compose partial arguments.
  var value = source[3];
  if (value) {
    var partials = data[3];
    data[3] = partials ? composeArgs(partials, value, source[4]) : arrayCopy(value);
    data[4] = partials ? replaceHolders(data[3], PLACEHOLDER) : arrayCopy(source[4]);
  }
  // Compose partial right arguments.
  value = source[5];
  if (value) {
    partials = data[5];
    data[5] = partials ? composeArgsRight(partials, value, source[6]) : arrayCopy(value);
    data[6] = partials ? replaceHolders(data[5], PLACEHOLDER) : arrayCopy(source[6]);
  }
  // Use source `argPos` if available.
  value = source[7];
  if (value) {
    data[7] = arrayCopy(value);
  }
  // Use source `ary` if it's smaller.
  if (srcBitmask & ARY_FLAG) {
    data[8] = data[8] == null ? source[8] : nativeMin(data[8], source[8]);
  }
  // Use source `arity` if one is not provided.
  if (data[9] == null) {
    data[9] = source[9];
  }
  // Use source `func` and merge bitmasks.
  data[0] = source[0];
  data[1] = newBitmask;

  return data;
}

module.exports = mergeData;

},{"./arrayCopy":24,"./composeArgs":59,"./composeArgsRight":60,"./replaceHolders":95}],92:[function(require,module,exports){
(function (global){
var getNative = require('./getNative');

/** Native method references. */
var WeakMap = getNative(global, 'WeakMap');

/** Used to store function metadata. */
var metaMap = WeakMap && new WeakMap;

module.exports = metaMap;

}).call(this,require("--global--"))
},{"--global--":123,"./getNative":77}],93:[function(require,module,exports){
/** Used to lookup unminified function names. */
var realNames = {};

module.exports = realNames;

},{}],94:[function(require,module,exports){
var arrayCopy = require('./arrayCopy'),
    isIndex = require('./isIndex');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMin = Math.min;

/**
 * Reorder `array` according to the specified indexes where the element at
 * the first index is assigned as the first element, the element at
 * the second index is assigned as the second element, and so on.
 *
 * @private
 * @param {Array} array The array to reorder.
 * @param {Array} indexes The arranged array indexes.
 * @returns {Array} Returns `array`.
 */
function reorder(array, indexes) {
  var arrLength = array.length,
      length = nativeMin(indexes.length, arrLength),
      oldArray = arrayCopy(array);

  while (length--) {
    var index = indexes[length];
    array[length] = isIndex(index, arrLength) ? oldArray[index] : undefined;
  }
  return array;
}

module.exports = reorder;

},{"./arrayCopy":24,"./isIndex":84}],95:[function(require,module,exports){
/** Used as the internal argument placeholder. */
var PLACEHOLDER = '__lodash_placeholder__';

/**
 * Replaces all `placeholder` elements in `array` with an internal placeholder
 * and returns an array of their indexes.
 *
 * @private
 * @param {Array} array The array to modify.
 * @param {*} placeholder The placeholder to replace.
 * @returns {Array} Returns the new array of placeholder indexes.
 */
function replaceHolders(array, placeholder) {
  var index = -1,
      length = array.length,
      resIndex = -1,
      result = [];

  while (++index < length) {
    if (array[index] === placeholder) {
      array[index] = PLACEHOLDER;
      result[++resIndex] = index;
    }
  }
  return result;
}

module.exports = replaceHolders;

},{}],96:[function(require,module,exports){
var baseSetData = require('./baseSetData'),
    now = require('../date/now');

/** Used to detect when a function becomes hot. */
var HOT_COUNT = 150,
    HOT_SPAN = 16;

/**
 * Sets metadata for `func`.
 *
 * **Note:** If this function becomes hot, i.e. is invoked a lot in a short
 * period of time, it will trip its breaker and transition to an identity function
 * to avoid garbage collection pauses in V8. See [V8 issue 2070](https://code.google.com/p/v8/issues/detail?id=2070)
 * for more details.
 *
 * @private
 * @param {Function} func The function to associate metadata with.
 * @param {*} data The metadata.
 * @returns {Function} Returns `func`.
 */
var setData = (function() {
  var count = 0,
      lastCalled = 0;

  return function(key, value) {
    var stamp = now(),
        remaining = HOT_SPAN - (stamp - lastCalled);

    lastCalled = stamp;
    if (remaining > 0) {
      if (++count >= HOT_COUNT) {
        return key;
      }
    } else {
      count = 0;
    }
    return baseSetData(key, value);
  };
}());

module.exports = setData;

},{"../date/now":19,"./baseSetData":51}],97:[function(require,module,exports){
var baseForIn = require('./baseForIn'),
    isArguments = require('../lang/isArguments'),
    isHostObject = require('./isHostObject'),
    isObjectLike = require('./isObjectLike'),
    support = require('../support');

/** `Object#toString` result references. */
var objectTag = '[object Object]';

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * A fallback implementation of `_.isPlainObject` which checks if `value`
 * is an object created by the `Object` constructor or has a `[[Prototype]]`
 * of `null`.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
 */
function shimIsPlainObject(value) {
  var Ctor;

  // Exit early for non `Object` objects.
  if (!(isObjectLike(value) && objToString.call(value) == objectTag && !isHostObject(value)) ||
      (!hasOwnProperty.call(value, 'constructor') &&
        (Ctor = value.constructor, typeof Ctor == 'function' && !(Ctor instanceof Ctor))) ||
      (!support.argsTag && isArguments(value))) {
    return false;
  }
  // IE < 9 iterates inherited properties before own properties. If the first
  // iterated property is an object's own property then there are no inherited
  // enumerable properties.
  var result;
  if (support.ownLast) {
    baseForIn(value, function(subValue, key, object) {
      result = hasOwnProperty.call(object, key);
      return false;
    });
    return result !== false;
  }
  // In most environments an object's own properties are iterated before
  // its inherited properties. If the last iterated property is an object's
  // own property then there are no inherited enumerable properties.
  baseForIn(value, function(subValue, key) {
    result = key;
  });
  return result === undefined || hasOwnProperty.call(value, result);
}

module.exports = shimIsPlainObject;

},{"../lang/isArguments":103,"../support":118,"./baseForIn":37,"./isHostObject":83,"./isObjectLike":89}],98:[function(require,module,exports){
var isArguments = require('../lang/isArguments'),
    isArray = require('../lang/isArray'),
    isIndex = require('./isIndex'),
    isLength = require('./isLength'),
    isString = require('../lang/isString'),
    keysIn = require('../object/keysIn');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A fallback implementation of `Object.keys` which creates an array of the
 * own enumerable property names of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function shimKeys(object) {
  var props = keysIn(object),
      propsLength = props.length,
      length = propsLength && object.length;

  var allowIndexes = !!length && isLength(length) &&
    (isArray(object) || isArguments(object) || isString(object));

  var index = -1,
      result = [];

  while (++index < propsLength) {
    var key = props[index];
    if ((allowIndexes && isIndex(key, length)) || hasOwnProperty.call(object, key)) {
      result.push(key);
    }
  }
  return result;
}

module.exports = shimKeys;

},{"../lang/isArguments":103,"../lang/isArray":104,"../lang/isString":110,"../object/keysIn":114,"./isIndex":84,"./isLength":88}],99:[function(require,module,exports){
var isObject = require('../lang/isObject'),
    isString = require('../lang/isString'),
    support = require('../support');

/**
 * Converts `value` to an object if it's not one.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {Object} Returns the object.
 */
function toObject(value) {
  if (support.unindexedChars && isString(value)) {
    var index = -1,
        length = value.length,
        result = Object(value);

    while (++index < length) {
      result[index] = value.charAt(index);
    }
    return result;
  }
  return isObject(value) ? value : Object(value);
}

module.exports = toObject;

},{"../lang/isObject":108,"../lang/isString":110,"../support":118}],100:[function(require,module,exports){
var baseToString = require('./baseToString'),
    isArray = require('../lang/isArray');

/** Used to match property names within property paths. */
var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\n\\]|\\.)*?)\2)\]/g;

/** Used to match backslashes in property paths. */
var reEscapeChar = /\\(\\)?/g;

/**
 * Converts `value` to property path array if it's not one.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {Array} Returns the property path array.
 */
function toPath(value) {
  if (isArray(value)) {
    return value;
  }
  var result = [];
  baseToString(value).replace(rePropName, function(match, number, quote, string) {
    result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
  });
  return result;
}

module.exports = toPath;

},{"../lang/isArray":104,"./baseToString":53}],101:[function(require,module,exports){
var LazyWrapper = require('./LazyWrapper'),
    LodashWrapper = require('./LodashWrapper'),
    arrayCopy = require('./arrayCopy');

/**
 * Creates a clone of `wrapper`.
 *
 * @private
 * @param {Object} wrapper The wrapper to clone.
 * @returns {Object} Returns the cloned wrapper.
 */
function wrapperClone(wrapper) {
  return wrapper instanceof LazyWrapper
    ? wrapper.clone()
    : new LodashWrapper(wrapper.__wrapped__, wrapper.__chain__, arrayCopy(wrapper.__actions__));
}

module.exports = wrapperClone;

},{"./LazyWrapper":22,"./LodashWrapper":23,"./arrayCopy":24}],102:[function(require,module,exports){
var baseClone = require('../internal/baseClone'),
    bindCallback = require('../internal/bindCallback');

/**
 * Creates a deep clone of `value`. If `customizer` is provided it is invoked
 * to produce the cloned values. If `customizer` returns `undefined` cloning
 * is handled by the method instead. The `customizer` is bound to `thisArg`
 * and invoked with two argument; (value [, index|key, object]).
 *
 * **Note:** This method is loosely based on the
 * [structured clone algorithm](http://www.w3.org/TR/html5/infrastructure.html#internal-structured-cloning-algorithm).
 * The enumerable properties of `arguments` objects and objects created by
 * constructors other than `Object` are cloned to plain `Object` objects. An
 * empty object is returned for uncloneable values such as functions, DOM nodes,
 * Maps, Sets, and WeakMaps.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to deep clone.
 * @param {Function} [customizer] The function to customize cloning values.
 * @param {*} [thisArg] The `this` binding of `customizer`.
 * @returns {*} Returns the deep cloned value.
 * @example
 *
 * var users = [
 *   { 'user': 'barney' },
 *   { 'user': 'fred' }
 * ];
 *
 * var deep = _.cloneDeep(users);
 * deep[0] === users[0];
 * // => false
 *
 * // using a customizer callback
 * var el = _.cloneDeep(document.body, function(value) {
 *   if (_.isElement(value)) {
 *     return value.cloneNode(true);
 *   }
 * });
 *
 * el === document.body
 * // => false
 * el.nodeName
 * // => BODY
 * el.childNodes.length;
 * // => 20
 */
function cloneDeep(value, customizer, thisArg) {
  return typeof customizer == 'function'
    ? baseClone(value, true, bindCallback(customizer, thisArg, 1))
    : baseClone(value, true);
}

module.exports = cloneDeep;

},{"../internal/baseClone":30,"../internal/bindCallback":57}],103:[function(require,module,exports){
var isArrayLike = require('../internal/isArrayLike'),
    isObjectLike = require('../internal/isObjectLike'),
    support = require('../support');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]';

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Native method references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/**
 * Checks if `value` is classified as an `arguments` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  return isObjectLike(value) && isArrayLike(value) && objToString.call(value) == argsTag;
}
// Fallback for environments without a `toStringTag` for `arguments` objects.
if (!support.argsTag) {
  isArguments = function(value) {
    return isObjectLike(value) && isArrayLike(value) &&
      hasOwnProperty.call(value, 'callee') && !propertyIsEnumerable.call(value, 'callee');
  };
}

module.exports = isArguments;

},{"../internal/isArrayLike":82,"../internal/isObjectLike":89,"../support":118}],104:[function(require,module,exports){
var getNative = require('../internal/getNative'),
    isLength = require('../internal/isLength'),
    isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var arrayTag = '[object Array]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/* Native method references for those with the same name as other `lodash` methods. */
var nativeIsArray = getNative(Array, 'isArray');

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(function() { return arguments; }());
 * // => false
 */
var isArray = nativeIsArray || function(value) {
  return isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag;
};

module.exports = isArray;

},{"../internal/getNative":77,"../internal/isLength":88,"../internal/isObjectLike":89}],105:[function(require,module,exports){
var isArguments = require('./isArguments'),
    isArray = require('./isArray'),
    isArrayLike = require('../internal/isArrayLike'),
    isFunction = require('./isFunction'),
    isObjectLike = require('../internal/isObjectLike'),
    isString = require('./isString'),
    keys = require('../object/keys');

/**
 * Checks if `value` is empty. A value is considered empty unless it is an
 * `arguments` object, array, string, or jQuery-like collection with a length
 * greater than `0` or an object with own enumerable properties.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {Array|Object|string} value The value to inspect.
 * @returns {boolean} Returns `true` if `value` is empty, else `false`.
 * @example
 *
 * _.isEmpty(null);
 * // => true
 *
 * _.isEmpty(true);
 * // => true
 *
 * _.isEmpty(1);
 * // => true
 *
 * _.isEmpty([1, 2, 3]);
 * // => false
 *
 * _.isEmpty({ 'a': 1 });
 * // => false
 */
function isEmpty(value) {
  if (value == null) {
    return true;
  }
  if (isArrayLike(value) && (isArray(value) || isString(value) || isArguments(value) ||
      (isObjectLike(value) && isFunction(value.splice)))) {
    return !value.length;
  }
  return !keys(value).length;
}

module.exports = isEmpty;

},{"../internal/isArrayLike":82,"../internal/isObjectLike":89,"../object/keys":113,"./isArguments":103,"./isArray":104,"./isFunction":106,"./isString":110}],106:[function(require,module,exports){
(function (global){
var baseIsFunction = require('../internal/baseIsFunction'),
    getNative = require('../internal/getNative');

/** `Object#toString` result references. */
var funcTag = '[object Function]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Native method references. */
var Uint8Array = getNative(global, 'Uint8Array');

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
var isFunction = !(baseIsFunction(/x/) || (Uint8Array && !baseIsFunction(Uint8Array))) ? baseIsFunction : function(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in older versions of Chrome and Safari which return 'function' for regexes
  // and Safari 8 equivalents which return 'object' for typed array constructors.
  return objToString.call(value) == funcTag;
};

module.exports = isFunction;

}).call(this,require("--global--"))
},{"--global--":123,"../internal/baseIsFunction":43,"../internal/getNative":77}],107:[function(require,module,exports){
var escapeRegExp = require('../string/escapeRegExp'),
    isHostObject = require('../internal/isHostObject'),
    isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var funcTag = '[object Function]';

/** Used to detect host constructors (Safari > 5). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var fnToString = Function.prototype.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  escapeRegExp(fnToString.call(hasOwnProperty))
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/**
 * Checks if `value` is a native function.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function, else `false`.
 * @example
 *
 * _.isNative(Array.prototype.push);
 * // => true
 *
 * _.isNative(_);
 * // => false
 */
function isNative(value) {
  if (value == null) {
    return false;
  }
  if (objToString.call(value) == funcTag) {
    return reIsNative.test(fnToString.call(value));
  }
  return isObjectLike(value) && (isHostObject(value) ? reIsNative : reIsHostCtor).test(value);
}

module.exports = isNative;

},{"../internal/isHostObject":83,"../internal/isObjectLike":89,"../string/escapeRegExp":117}],108:[function(require,module,exports){
/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

module.exports = isObject;

},{}],109:[function(require,module,exports){
var getNative = require('../internal/getNative'),
    isArguments = require('./isArguments'),
    shimIsPlainObject = require('../internal/shimIsPlainObject'),
    support = require('../support');

/** `Object#toString` result references. */
var objectTag = '[object Object]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Native method references. */
var getPrototypeOf = getNative(Object, 'getPrototypeOf');

/**
 * Checks if `value` is a plain object, that is, an object created by the
 * `Object` constructor or one with a `[[Prototype]]` of `null`.
 *
 * **Note:** This method assumes objects created by the `Object` constructor
 * have no inherited enumerable properties.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 * }
 *
 * _.isPlainObject(new Foo);
 * // => false
 *
 * _.isPlainObject([1, 2, 3]);
 * // => false
 *
 * _.isPlainObject({ 'x': 0, 'y': 0 });
 * // => true
 *
 * _.isPlainObject(Object.create(null));
 * // => true
 */
var isPlainObject = !getPrototypeOf ? shimIsPlainObject : function(value) {
  if (!(value && objToString.call(value) == objectTag) || (!support.argsTag && isArguments(value))) {
    return false;
  }
  var valueOf = getNative(value, 'valueOf'),
      objProto = valueOf && (objProto = getPrototypeOf(valueOf)) && getPrototypeOf(objProto);

  return objProto
    ? (value == objProto || getPrototypeOf(value) == objProto)
    : shimIsPlainObject(value);
};

module.exports = isPlainObject;

},{"../internal/getNative":77,"../internal/shimIsPlainObject":97,"../support":118,"./isArguments":103}],110:[function(require,module,exports){
var isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var stringTag = '[object String]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a `String` primitive or object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isString('abc');
 * // => true
 *
 * _.isString(1);
 * // => false
 */
function isString(value) {
  return typeof value == 'string' || (isObjectLike(value) && objToString.call(value) == stringTag);
}

module.exports = isString;

},{"../internal/isObjectLike":89}],111:[function(require,module,exports){
var isLength = require('../internal/isLength'),
    isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values of typed arrays. */
var typedArrayTags = {};
typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
typedArrayTags[uint32Tag] = true;
typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
typedArrayTags[dateTag] = typedArrayTags[errorTag] =
typedArrayTags[funcTag] = typedArrayTags[mapTag] =
typedArrayTags[numberTag] = typedArrayTags[objectTag] =
typedArrayTags[regexpTag] = typedArrayTags[setTag] =
typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a typed array.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isTypedArray(new Uint8Array);
 * // => true
 *
 * _.isTypedArray([]);
 * // => false
 */
function isTypedArray(value) {
  return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[objToString.call(value)];
}

module.exports = isTypedArray;

},{"../internal/isLength":88,"../internal/isObjectLike":89}],112:[function(require,module,exports){
/**
 * Checks if `value` is `undefined`.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is `undefined`, else `false`.
 * @example
 *
 * _.isUndefined(void 0);
 * // => true
 *
 * _.isUndefined(null);
 * // => false
 */
function isUndefined(value) {
  return value === undefined;
}

module.exports = isUndefined;

},{}],113:[function(require,module,exports){
var getNative = require('../internal/getNative'),
    isArrayLike = require('../internal/isArrayLike'),
    isObject = require('../lang/isObject'),
    shimKeys = require('../internal/shimKeys'),
    support = require('../support');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeKeys = getNative(Object, 'keys');

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.keys)
 * for more details.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
var keys = !nativeKeys ? shimKeys : function(object) {
  var Ctor = object == null ? null : object.constructor;
  if ((typeof Ctor == 'function' && Ctor.prototype === object) ||
      (typeof object == 'function' ? support.enumPrototypes : isArrayLike(object))) {
    return shimKeys(object);
  }
  return isObject(object) ? nativeKeys(object) : [];
};

module.exports = keys;

},{"../internal/getNative":77,"../internal/isArrayLike":82,"../internal/shimKeys":98,"../lang/isObject":108,"../support":118}],114:[function(require,module,exports){
var arrayEach = require('../internal/arrayEach'),
    isArguments = require('../lang/isArguments'),
    isArray = require('../lang/isArray'),
    isFunction = require('../lang/isFunction'),
    isIndex = require('../internal/isIndex'),
    isLength = require('../internal/isLength'),
    isObject = require('../lang/isObject'),
    isString = require('../lang/isString'),
    support = require('../support');

/** `Object#toString` result references. */
var arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    stringTag = '[object String]';

/** Used to fix the JScript `[[DontEnum]]` bug. */
var shadowProps = [
  'constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
  'toLocaleString', 'toString', 'valueOf'
];

/** Used for native method references. */
var errorProto = Error.prototype,
    objectProto = Object.prototype,
    stringProto = String.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Used to avoid iterating over non-enumerable properties in IE < 9. */
var nonEnumProps = {};
nonEnumProps[arrayTag] = nonEnumProps[dateTag] = nonEnumProps[numberTag] = { 'constructor': true, 'toLocaleString': true, 'toString': true, 'valueOf': true };
nonEnumProps[boolTag] = nonEnumProps[stringTag] = { 'constructor': true, 'toString': true, 'valueOf': true };
nonEnumProps[errorTag] = nonEnumProps[funcTag] = nonEnumProps[regexpTag] = { 'constructor': true, 'toString': true };
nonEnumProps[objectTag] = { 'constructor': true };

arrayEach(shadowProps, function(key) {
  for (var tag in nonEnumProps) {
    if (hasOwnProperty.call(nonEnumProps, tag)) {
      var props = nonEnumProps[tag];
      props[key] = hasOwnProperty.call(props, key);
    }
  }
});

/**
 * Creates an array of the own and inherited enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keysIn(new Foo);
 * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
 */
function keysIn(object) {
  if (object == null) {
    return [];
  }
  if (!isObject(object)) {
    object = Object(object);
  }
  var length = object.length;

  length = (length && isLength(length) &&
    (isArray(object) || isArguments(object) || isString(object)) && length) || 0;

  var Ctor = object.constructor,
      index = -1,
      proto = (isFunction(Ctor) && Ctor.prototype) || objectProto,
      isProto = proto === object,
      result = Array(length),
      skipIndexes = length > 0,
      skipErrorProps = support.enumErrorProps && (object === errorProto || object instanceof Error),
      skipProto = support.enumPrototypes && isFunction(object);

  while (++index < length) {
    result[index] = (index + '');
  }
  // lodash skips the `constructor` property when it infers it is iterating
  // over a `prototype` object because IE < 9 can't set the `[[Enumerable]]`
  // attribute of an existing property and the `constructor` property of a
  // prototype defaults to non-enumerable.
  for (var key in object) {
    if (!(skipProto && key == 'prototype') &&
        !(skipErrorProps && (key == 'message' || key == 'name')) &&
        !(skipIndexes && isIndex(key, length)) &&
        !(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
      result.push(key);
    }
  }
  if (support.nonEnumShadows && object !== objectProto) {
    var tag = object === stringProto ? stringTag : (object === errorProto ? errorTag : objToString.call(object)),
        nonEnums = nonEnumProps[tag] || nonEnumProps[objectTag];

    if (tag == objectTag) {
      proto = objectProto;
    }
    length = shadowProps.length;
    while (length--) {
      key = shadowProps[length];
      var nonEnum = nonEnums[key];
      if (!(isProto && nonEnum) &&
          (nonEnum ? hasOwnProperty.call(object, key) : object[key] !== proto[key])) {
        result.push(key);
      }
    }
  }
  return result;
}

module.exports = keysIn;

},{"../internal/arrayEach":25,"../internal/isIndex":84,"../internal/isLength":88,"../lang/isArguments":103,"../lang/isArray":104,"../lang/isFunction":106,"../lang/isObject":108,"../lang/isString":110,"../support":118}],115:[function(require,module,exports){
var keys = require('./keys'),
    toObject = require('../internal/toObject');

/**
 * Creates a two dimensional array of the key-value pairs for `object`,
 * e.g. `[[key1, value1], [key2, value2]]`.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the new array of key-value pairs.
 * @example
 *
 * _.pairs({ 'barney': 36, 'fred': 40 });
 * // => [['barney', 36], ['fred', 40]] (iteration order is not guaranteed)
 */
function pairs(object) {
  object = toObject(object);

  var index = -1,
      props = keys(object),
      length = props.length,
      result = Array(length);

  while (++index < length) {
    var key = props[index];
    result[index] = [key, object[key]];
  }
  return result;
}

module.exports = pairs;

},{"../internal/toObject":99,"./keys":113}],116:[function(require,module,exports){
var baseValues = require('../internal/baseValues'),
    keys = require('./keys');

/**
 * Creates an array of the own enumerable property values of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property values.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.values(new Foo);
 * // => [1, 2] (iteration order is not guaranteed)
 *
 * _.values('hi');
 * // => ['h', 'i']
 */
function values(object) {
  return baseValues(object, keys(object));
}

module.exports = values;

},{"../internal/baseValues":54,"./keys":113}],117:[function(require,module,exports){
var baseToString = require('../internal/baseToString');

/**
 * Used to match `RegExp` [special characters](http://www.regular-expressions.info/characters.html#special).
 * In addition to special characters the forward slash is escaped to allow for
 * easier `eval` use and `Function` compilation.
 */
var reRegExpChars = /[.*+?^${}()|[\]\/\\]/g,
    reHasRegExpChars = RegExp(reRegExpChars.source);

/**
 * Escapes the `RegExp` special characters "\", "/", "^", "$", ".", "|", "?",
 * "*", "+", "(", ")", "[", "]", "{" and "}" in `string`.
 *
 * @static
 * @memberOf _
 * @category String
 * @param {string} [string=''] The string to escape.
 * @returns {string} Returns the escaped string.
 * @example
 *
 * _.escapeRegExp('[lodash](https://lodash.com/)');
 * // => '\[lodash\]\(https:\/\/lodash\.com\/\)'
 */
function escapeRegExp(string) {
  string = baseToString(string);
  return (string && reHasRegExpChars.test(string))
    ? string.replace(reRegExpChars, '\\$&')
    : string;
}

module.exports = escapeRegExp;

},{"../internal/baseToString":53}],118:[function(require,module,exports){
(function (global){
/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    objectTag = '[object Object]';

/** Used for native method references. */
var arrayProto = Array.prototype,
    errorProto = Error.prototype,
    objectProto = Object.prototype;

/** Used to detect DOM support. */
var document = (document = global.window) ? document.document : null;

/**
 * Used to resolve the [`toStringTag`](https://people.mozilla.org/~jorendorff/es6-draft.html#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Native method references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable,
    splice = arrayProto.splice;

/**
 * An object environment feature flags.
 *
 * @static
 * @memberOf _
 * @type Object
 */
var support = {};

(function(x) {
  var Ctor = function() { this.x = x; },
      object = { '0': x, 'length': x },
      props = [];

  Ctor.prototype = { 'valueOf': x, 'y': x };
  for (var key in new Ctor) { props.push(key); }

  /**
   * Detect if the `toStringTag` of `arguments` objects is resolvable
   * (all but Firefox < 4, IE < 9).
   *
   * @memberOf _.support
   * @type boolean
   */
  support.argsTag = objToString.call(arguments) == argsTag;

  /**
   * Detect if `name` or `message` properties of `Error.prototype` are
   * enumerable by default (IE < 9, Safari < 5.1).
   *
   * @memberOf _.support
   * @type boolean
   */
  support.enumErrorProps = propertyIsEnumerable.call(errorProto, 'message') ||
    propertyIsEnumerable.call(errorProto, 'name');

  /**
   * Detect if `prototype` properties are enumerable by default.
   *
   * Firefox < 3.6, Opera > 9.50 - Opera < 11.60, and Safari < 5.1
   * (if the prototype or a property on the prototype has been set)
   * incorrectly set the `[[Enumerable]]` value of a function's `prototype`
   * property to `true`.
   *
   * @memberOf _.support
   * @type boolean
   */
  support.enumPrototypes = propertyIsEnumerable.call(Ctor, 'prototype');

  /**
   * Detect if the `toStringTag` of DOM nodes is resolvable (all but IE < 9).
   *
   * @memberOf _.support
   * @type boolean
   */
  support.nodeTag = objToString.call(document) != objectTag;

  /**
   * Detect if properties shadowing those on `Object.prototype` are non-enumerable.
   *
   * In IE < 9 an object's own properties, shadowing non-enumerable ones,
   * are made non-enumerable as well (a.k.a the JScript `[[DontEnum]]` bug).
   *
   * @memberOf _.support
   * @type boolean
   */
  support.nonEnumShadows = !/valueOf/.test(props);

  /**
   * Detect if own properties are iterated after inherited properties (IE < 9).
   *
   * @memberOf _.support
   * @type boolean
   */
  support.ownLast = props[0] != 'x';

  /**
   * Detect if `Array#shift` and `Array#splice` augment array-like objects
   * correctly.
   *
   * Firefox < 10, compatibility modes of IE 8, and IE < 9 have buggy Array
   * `shift()` and `splice()` functions that fail to remove the last element,
   * `value[0]`, of array-like objects even though the "length" property is
   * set to `0`. The `shift()` method is buggy in compatibility modes of IE 8,
   * while `splice()` is buggy regardless of mode in IE < 9.
   *
   * @memberOf _.support
   * @type boolean
   */
  support.spliceObjects = (splice.call(object, 0, 1), !object[0]);

  /**
   * Detect lack of support for accessing string characters by index.
   *
   * IE < 8 can't access characters by index. IE 8 can only access characters
   * by index on string literals, not string objects.
   *
   * @memberOf _.support
   * @type boolean
   */
  support.unindexedChars = ('x'[0] + Object('x')[0]) != 'xx';

  /**
   * Detect if the DOM is supported.
   *
   * @memberOf _.support
   * @type boolean
   */
  try {
    support.dom = document.createDocumentFragment().nodeType === 11;
  } catch(e) {
    support.dom = false;
  }
}(1, 0));

module.exports = support;

}).call(this,require("--global--"))
},{"--global--":123}],119:[function(require,module,exports){
/**
 * Creates a function that returns `value`.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {*} value The value to return from the new function.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var object = { 'user': 'fred' };
 * var getter = _.constant(object);
 *
 * getter() === object;
 * // => true
 */
function constant(value) {
  return function() {
    return value;
  };
}

module.exports = constant;

},{}],120:[function(require,module,exports){
/**
 * This method returns the first argument provided to it.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {*} value Any value.
 * @returns {*} Returns `value`.
 * @example
 *
 * var object = { 'user': 'fred' };
 *
 * _.identity(object) === object;
 * // => true
 */
function identity(value) {
  return value;
}

module.exports = identity;

},{}],121:[function(require,module,exports){
/**
 * A no-operation function that returns `undefined` regardless of the
 * arguments it receives.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @example
 *
 * var object = { 'user': 'fred' };
 *
 * _.noop(object) === undefined;
 * // => true
 */
function noop() {
  // No operation performed.
}

module.exports = noop;

},{}],122:[function(require,module,exports){
var baseProperty = require('../internal/baseProperty'),
    basePropertyDeep = require('../internal/basePropertyDeep'),
    isKey = require('../internal/isKey');

/**
 * Creates a function that returns the property value at `path` on a
 * given object.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {Array|string} path The path of the property to get.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var objects = [
 *   { 'a': { 'b': { 'c': 2 } } },
 *   { 'a': { 'b': { 'c': 1 } } }
 * ];
 *
 * _.map(objects, _.property('a.b.c'));
 * // => [2, 1]
 *
 * _.pluck(_.sortBy(objects, _.property(['a', 'b', 'c'])), 'a.b.c');
 * // => [1, 2]
 */
function property(path) {
  return isKey(path) ? baseProperty(path) : basePropertyDeep(path);
}

module.exports = property;

},{"../internal/baseProperty":49,"../internal/basePropertyDeep":50,"../internal/isKey":86}],123:[function(require,module,exports){

module.exports = (function () { return this; })();

module.exports.location = {};

},{}],124:[function(require,module,exports){
(function (setTimeout){
/* global Ti:true, Titanium:true */

var process = module.exports = {};

process.nextTick = function nextTick(fn) {
  setTimeout(fn, 0);
};

process.title = 'titanium';
process.titanium = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
  throw new Error('process.binding is not supported');
};

process.cwd = function () {
  return '/';
};

process.chdir = function (dir) {
  throw new Error('process.chdir is not supported');
};

process.stdout = {};
process.stderr = {};

process.stdout.write = function (msg) {
  Ti.API.info(msg);
};

process.stderr.write = function (msg) {
  Ti.API.error(msg);
};

'addEventListener removeEventListener removeListener hasEventListener fireEvent emit on off'.split(' ').forEach(function (name) {
  process[ name ] = noop;
});

function noop() {}

}).call(this,require("--timers--").setTimeout)
},{"--timers--":125}],125:[function(require,module,exports){
(function (global){

module.exports.clearInterval = clearInterval;
module.exports.clearTimeout = clearTimeout;
module.exports.setInterval = setInterval;
module.exports.setTimeout = setTimeout;

// See https://html.spec.whatwg.org/multipage/webappapis.html#dom-windowtimers-cleartimeout

function clearInterval(intervalId) {
  try {
    return global.clearInterval(intervalId);
  }
  catch (e) {
    // Do nothing
    return undefined;
  }
}

function clearTimeout(timeoutId) {
  try {
    return global.clearTimeout(timeoutId);
  }
  catch (e) {
    // Do nothing
    return undefined;
  }
}

function setInterval(func, delay) {
  var args = [];
  for (var i = 2, l = arguments.length; i < l; ++i) {
    args[ i - 2 ] = arguments[ i ];
  }

  return global.setInterval(function () {
    func.apply(this, args);
  }, +delay);
}

function setTimeout(func, delay) {
  var args = [];
  for (var i = 2, l = arguments.length; i < l; ++i) {
    args[ i - 2 ] = arguments[ i ];
  }

  return global.setTimeout(function () {
    func.apply(this, args);
  }, +delay);
}

}).call(this,require("--global--"))
},{"--global--":123}],126:[function(require,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = require('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && !isFinite(value)) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  // if one is a primitive, the other must be same
  if (util.isPrimitive(a) || util.isPrimitive(b)) {
    return a === b;
  }
  var aIsArgs = isArguments(a),
      bIsArgs = isArguments(b);
  if ((aIsArgs && !bIsArgs) || (!aIsArgs && bIsArgs))
    return false;
  if (aIsArgs) {
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  var ka = objectKeys(a),
      kb = objectKeys(b),
      key, i;
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":129}],127:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],128:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],129:[function(require,module,exports){
(function (process,global,console){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("--process--"),require("--global--"),require("--console--"))
},{"--console--":131,"--global--":123,"--process--":124,"./support/isBuffer":128,"inherits":127}],130:[function(require,module,exports){
module.exports = now

function now() {
    return new Date().getTime()
}

},{}],131:[function(require,module,exports){
var util = require("util");
var now = require("date-now");

var _console = {};
var times = {};

var functions = [
	['log','info'],
	['info','info'],
	['warn','warn'],
	['error','error']
];

functions.forEach(function(tuple) {
	_console[tuple[0]] = function() {
		Ti.API[tuple[1]](util.format.apply(util, arguments));
	};
});

_console.time = function(label) {
	times[label] = now();
};

_console.timeEnd = function(label) {
	var time = times[label];
	if (!time) {
		throw new Error("No such label: " + label);
	}

	var duration = now() - time;
	_console.log(label + ": " + duration + "ms");
};

_console.trace = function() {
	var err = new Error();
	err.name = "Trace";
	err.message = util.format.apply(null, arguments);
	_console.error(err.stack);
};

_console.dir = function(object) {
	_console.log(util.inspect(object) + "\n");
};

_console.assert = function(expression) {
	if (!expression) {
		var arr = Array.prototype.slice.call(arguments, 1);
		require("assert").ok(false, util.format.apply(null, arr));
	}
};

module.exports = _console;

},{"assert":126,"date-now":130,"util":129}]},{},[1])(1)
});
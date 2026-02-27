'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// Mock the vscode module before requiring configuration.js,
// since getConfiguration() uses vscode.workspace.getConfiguration.
const _originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'vscode') {
    return 'vscode';
  }
  return _originalResolve.call(this, request, parent, isMain, options);
};

const mockConfigStore = {};
require.cache['vscode'] = {
  id: 'vscode',
  filename: 'vscode',
  loaded: true,
  exports: {
    workspace: {
      getConfiguration: () => ({
        get: (key, defaultValue) =>
          Object.prototype.hasOwnProperty.call(mockConfigStore, key)
            ? mockConfigStore[key]
            : defaultValue,
      }),
    },
  },
};

const {
  validateConfiguration,
  getConfiguration,
} = require('../dist/configuration.js');

describe('validateConfiguration', () => {
  it('returns an error for missing endpoint', () => {
    const errors = validateConfiguration({
      endpoint: '',
      apiKey: 'my-key',
      model: 'gpt-4.1',
      wireApi: 'completions',
      cliPath: '',
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].field, 'enclave.copilot.endpoint');
  });

  it('returns an error for missing apiKey', () => {
    const errors = validateConfiguration({
      endpoint: 'https://my-endpoint.com',
      apiKey: '',
      model: 'gpt-4.1',
      wireApi: 'completions',
      cliPath: '',
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].field, 'enclave.copilot.apiKey');
  });

  it('returns errors for both missing required fields', () => {
    const errors = validateConfiguration({
      endpoint: '',
      apiKey: '',
      model: 'gpt-4.1',
      wireApi: 'completions',
      cliPath: '',
    });
    assert.equal(errors.length, 2);
    assert.equal(errors[0].field, 'enclave.copilot.endpoint');
    assert.equal(errors[1].field, 'enclave.copilot.apiKey');
  });

  it('returns no errors when all required fields are provided', () => {
    const errors = validateConfiguration({
      endpoint: 'https://my-endpoint.com',
      apiKey: 'my-key',
      model: 'gpt-4.1',
      wireApi: 'completions',
      cliPath: '',
    });
    assert.equal(errors.length, 0);
  });
});

describe('getConfiguration', () => {
  it('applies default value for model', () => {
    const config = getConfiguration();
    assert.equal(config.model, 'gpt-4.1');
  });

  it('applies default value for wireApi', () => {
    const config = getConfiguration();
    assert.equal(config.wireApi, 'completions');
  });

  it('reads a configured value from settings', () => {
    mockConfigStore['model'] = 'gpt-4o';
    const config = getConfiguration();
    assert.equal(config.model, 'gpt-4o');
    delete mockConfigStore['model'];
  });

  it('returns empty string defaults for endpoint, apiKey, and cliPath', () => {
    const config = getConfiguration();
    assert.equal(config.endpoint, '');
    assert.equal(config.apiKey, '');
    assert.equal(config.cliPath, '');
  });
});

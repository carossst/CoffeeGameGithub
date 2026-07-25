"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

class MemoryStorage {
  constructor() {
    this._map = new Map();
  }

  getItem(key) {
    return this._map.has(key) ? this._map.get(key) : null;
  }

  setItem(key, value) {
    this._map.set(String(key), String(value));
  }

  removeItem(key) {
    this._map.delete(String(key));
  }

  clear() {
    this._map.clear();
  }
}

class CustomEventShim {
  constructor(type, options) {
    this.type = String(type || "");
    this.detail =
      options && Object.prototype.hasOwnProperty.call(options, "detail")
        ? options.detail
        : undefined;
  }
}

function createWindowLike(overrides) {
  const listeners = new Map();
  const localStorage = new MemoryStorage();

  const windowLike = {
    localStorage,
    console,
    navigator: { language: "en-US", onLine: true },
    location: { hostname: "localhost", href: "", pathname: "/", search: "" },
    matchMedia: () => ({ matches: false }),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    crypto: webcrypto,
    addEventListener(type, handler) {
      const key = String(type || "");
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(handler);
    },
    removeEventListener(type, handler) {
      const key = String(type || "");
      if (!listeners.has(key)) return;
      listeners.get(key).delete(handler);
    },
    dispatchEvent(event) {
      const key = String((event && event.type) || "");
      const handlers = listeners.get(key);
      if (!handlers) return true;
      for (const fn of handlers) {
        fn.call(windowLike, event);
      }
      return true;
    }
  };

  return Object.assign(windowLike, overrides || {});
}

function createDocumentLike(overrides) {
  return Object.assign(
    {
      readyState: "complete",
      addEventListener() {},
      removeEventListener() {},
      documentElement: {
        setAttribute() {},
        getAttribute() {
          return "";
        }
      },
      getElementById() {
        return null;
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      }
    },
    overrides || {}
  );
}

function loadBrowserScript(scriptRelativePath, options) {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const scriptPath = path.resolve(repoRoot, scriptRelativePath);
  const code = fs.readFileSync(scriptPath, "utf8");
  const windowLike =
    options && options.window ? options.window : createWindowLike();
  const documentLike =
    options && options.document ? options.document : createDocumentLike();

  const context = {
    window: windowLike,
    document: documentLike,
    console,
    fetch: windowLike.fetch,
    navigator: windowLike.navigator,
    structuredClone,
    crypto: webcrypto,
    CustomEvent: CustomEventShim,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    RegExp,
    Array,
    Object,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    Promise,
    URL,
    URLSearchParams
  };

  context.globalThis = context;
  context.window.window = context.window;
  context.window.document = context.document;
  context.window.CustomEvent = CustomEventShim;

  vm.createContext(context);
  vm.runInContext(code, context, { filename: scriptPath });
  return context;
}

module.exports = {
  MemoryStorage,
  createDocumentLike,
  createWindowLike,
  loadBrowserScript
};

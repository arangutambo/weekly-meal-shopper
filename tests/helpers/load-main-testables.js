const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeHTMLElement {
  constructor(tagName = "div", textContent = "") {
    this.tagName = String(tagName || "div").toUpperCase();
    this.textContent = String(textContent || "");
    this.children = [];
    this.dataset = {};
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  querySelectorAll(selector) {
    if (selector === "h1, h2, h3, h4, h5, h6") {
      return this.children.filter((node) => /^H[1-6]$/.test(String(node?.tagName || "")));
    }
    return [];
  }

  addEventListener() {}

  getAttribute() {
    return "";
  }
}

function createObsidianStub() {
  class Plugin {
    registerMarkdownPostProcessor() {}
  }
  class Modal {}
  class PluginSettingTab {}
  class Setting {}
  class TFile {}
  class TFolder {}
  class MarkdownView {}

  return {
    Plugin,
    Notice: function Notice() {},
    Modal,
    PluginSettingTab,
    Setting,
    TFile,
    TFolder,
    MarkdownView,
    MarkdownRenderer: { render: async () => {} },
    requestUrl: async () => {
      throw new Error("requestUrl not available in tests");
    },
    normalizePath: (v) => String(v || ""),
  };
}

function loadMainContext() {
  const mainPath = path.resolve(__dirname, "..", "..", "main.js");
  const source = fs.readFileSync(mainPath, "utf8");

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    Buffer,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    Promise,
    URLSearchParams,
    HTMLElement: FakeHTMLElement,
    require: (id) => {
      if (id === "obsidian") return createObsidianStub();
      throw new Error(`Unexpected module request in test harness: ${id}`);
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: mainPath });
  return sandbox;
}

module.exports = {
  loadMainContext,
  FakeHTMLElement,
};

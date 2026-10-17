"use strict";

const Module = require("module");
const path = require("path");

const functionsNm = path.resolve(__dirname, "../../../functions/node_modules");
const rootNm = path.resolve(__dirname, "../../../node_modules");
const extra = [functionsNm, rootNm].join(path.delimiter);
process.env.NODE_PATH = process.env.NODE_PATH
  ? `${extra}${path.delimiter}${process.env.NODE_PATH}`
  : extra;
Module._initPaths();

module.exports = require("./lib/index.js");

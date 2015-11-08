"use strict"

var EE = require("events").EventEmitter;

class CorrelationManager extends EE {
  constructor(parent){
    super();
    this.parent = parent;
    this.correlations = {};

    this.on("add-correlation", (id, handlerOrReference) => {
      this.addCorrelation(id, handlerOrReference);
    });
    this.on("get-correlation", (id, handler) => {
      this.getCorrelation(id, handler);
    });
  }

  addCorrelation(id, handlerOrReference){
    if(typeof(handlerOrReference) === "string"){
      this.correlations[id] = {$ref:handlerOrReference}
    } else {
      this.correlations[id] = {handler:handlerOrReference}
    }
  }

  getCorrelation(id, handler){
    var correl = this.correlations[id];
    delete this.correlations[id];
    if(correl){
      handler(null, correl);
    } else {
      handler(new Error("Correlation not found"));
    }
  }
}

module.exports = CorrelationManager;

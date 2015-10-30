"use strict"
var ApplicationManager = require("basic-distributed-computation").ApplicationManager;

class BasicManager extends ApplicationManager{
  constructor(parent){
    super({}, parent);
  }

  checkStatus(req){
    if(req.currentIdx >= req.paths.length || req.statusCode !== 0){
      this.parent.emit("request-end", req);
    } else {
      req.next();
    }
  }
}

module.exports = BasicManager;

"use strict"

var Environment = require("basic-distributed-computation").Environment;
var spawn = require("child_process").spawnSync;
var Bluebird = require("bluebird");
var _path = require("path");
var CorrelationManager = require("./correlation-manager");
var request = require("request");
var winston = require("winston");
var MongoClient = require("mongodb").MongoClient;
var mongodb = require("mongodb");

class AppEnvironment extends Environment {
  constructor(config, correlationManager) {
    super(config, [_path.join(__dirname,"./application")], config.workerList || []);
    this.correlationManager = new CorrelationManager(this);
    this.generalDb = null;
    this.generalStorageInit = new Promise((resolve, reject) => {
      MongoClient.connect(this.generalStorage, (err, db) => {
        if(err){
          reject(err);
          return;
        }
        this.generalDb = db;
        resolve();
      });
    });
    this.sessionDb = null;
    this.sessionStorageInit = new Promise((resolve, reject) => {
      MongoClient.connect(this.sessionStorage, (err, db) => {
        if(err){
          reject(err);
          return;
        }
        this.sessionDb = db;
        resolve();
      });
    });
    this.removeAllListeners("request-start");
    this.on("request-start", (req, handler, local) => {
      this.requestStart(req, handler, local);
    });
    this.on("purge", () => {
      this.purge();
    });
  }

  advertise(){
    if(this.config.lb){
      var url = this.config.lb
      request.post({url:url + "/advertise", body:{url:this.config.url}, json:true}, function(err){

      });
      request.post({url:url + "/advertise", body:{url:this.config.url}, json:true}, function(err){

      });
    }
  }

  receivedAdvertisement(message){

  }

  receivedWorkRequest(req){
    this.sendToLocalWorker(req);
  }

  sendToLocalWorker(path, req){
    var worker = this.getWorker(path);

    if(worker){
      req.parent = worker;
      req.next();
    } else {
      this.downloadWorker(path)
        .then(((req) => {
          return (worker) => {
            req.parent = worker;
            req.next();
          };
        })(req))
        .catch(((req) => {
          return (err) => {
            req.choreIdx = -1;
            req.status(err).next();
          }
        })(req))
    }
  }

  sendToWorker(path, req){
    this.sendToLocalWorker(path, req);
  }

  sendToApplicationManager(origination, req){
    req.parent = this.applications[0];
    req.next();
  }

  requestEnd(req){
    this.correlationManager.emit("get-correlation", req.correlationId, (err, hObj) => {
      if(hObj){
        if(req.statusCode !== 0){
          hObj.handler(req.statusCode, [req, req.body]);
        } else {
          hObj.handler(null, [req, req.body]);
        }
      }
    });
  }

  requestStart(req, handler, local){
    if(local){
      this.correlationManager.emit("add-correlation", req.correlationId, handler);
      req.choreIdx--;
      req.parent = this.applications[0];
      req.next();
    } else {
      request.post({url:this.config.lb + "/start",
        body:JSON.parse(req.serialize()),
        json:true
      }, (err, h_req, body) => {
        handler(err, [h_req, body]);
      });
    }
  }

  getWorker(path){
    for(var i = 0; i < this._workerRoutes.length; i++){
      var route = this._workerRoutes[i];
      if(route.pathRegExp.test(path)){
        return route.worker;
      }
    }

    return null;
  }

  downloadWorker(path) {
    path = path.split("/")[0];
    var defer = Bluebird.defer();
    winston.log("info", "downloading", {worker:"edc-" + path});
    if(process.env.LOCAL_WORKERS_ONLY !== "true"){
      var proc = spawn("npm", ["install", "edc-" + path], {cwd:_path.join(__dirname, "../")});
    } else{
      var proc = {status:0};
    }

    if(proc.status === 0){
      var worker = new (require("edc-" + path))(this);

      var route = {
        originalPath:path,
        path: worker.path,
        pathRegExp: worker.pathRegExp,
        worker: worker
      };
      this._workerRoutes.push(route);
      return Bluebird.resolve(route.worker);
    } else {
      return Bluebird.reject(proc.error);
    }
  }

  purge(){
    for(var i = 0; i < this._workerRoutes.length; i++){
      var route = this._workerRoutes[i];
      var requirePath = "edc-" + route.originalPath;
      delete require.cache[requirePath];
    }
    this._workerRoutes = [];
  }

  saveToSessionStore(sessionKey, meta, data){
    return this.sessionStorageInit.then(() => {
      var sessionCollection = this.sessionDb.collection(sessionKey);
      return new Promise((resolve, reject) => {
        sessionCollection.insert({meta:meta, data:data}, (err, results) =>{
          if(err){
            reject(err);
            return;
          }
          resolve({_id:results.insertedIds[0]});
        });
      });
    })
  }

  saveToGlobalStore(data){
    return this.generalStorageInit.then(() => {
      var globalCollection = this.generalDb.collection("global");
      return new Promise((resolve, reject) => {
        globalCollection.insert(data, (err, results) =>{
          if(err){
            reject(err);
            return;
          }
          resolve(results);
        });
      });
    })
  }

  getDataFromSessionStore(sessionKey, search){
    var sClone = {};
    for(var i in search){
      sClone[i] = search[i];
    }
    if(sClone._id){
      sClone._id = mongodb.ObjectId(sClone._id);
    }

    return this.sessionStorageInit.then(() => {
      var sessionCollection = this.sessionDb.collection(sessionKey);
      return new Promise((resolve, reject) => {
        //Get all session documents if no search available
        sessionCollection.find(sClone).toArray((err, docs) => {
          if(err){
            reject(err);
            return;
          }

          resolve(docs);
        });
      });
    });
  }

  getDataFromGlobalStore(search){
    var sClone = {};
    for(var i in search){
      sClone[i] = search[i];
    }
    if(sClone._id){
      sClone._id = mongodb.ObjectId(sClone._id);
    }
    return this.generalStorageInit.then(() => {
      var globalCollection = this.generalDb.collection("global");
      return new Promise((resolve, reject) => {
        globalCollection.find(sClone).toArray((err, docs) => {
          if(err){
            reject(err);
            return;
          }
          resolve(docs);
        });
      });
    });
  }
}

module.exports = AppEnvironment;

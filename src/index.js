import { ResourceNode, ServiceEngine} from '@chip-in/resource-node';
const handler = require('serve-handler');
import http from 'http'
import webClient from 'request';

process.on('unhandledRejection', console.dir);

if (process.argv.length !== 4) {
  console.log("Usage: npm start -- " +
              "<core_node_url(e.g. 'http://test-core.chip-in.net')> "+
              "<node_class(e.g. 'rn-serve-server')> ")
  process.exit(0);
}
var coreNodeUrl = process.argv[2];
var nodeClass =  process.argv[3];

var jwtToken = process.env.ACCESS_TOKEN;
var jwtRefreshPath = process.env.TOKEN_UPDATE_PATH;

class SignalHandler {
  constructor(node) {
    this.targets = ["SIGINT", "SIGTERM"];
    this.node = node;
    this._init();
  }
  _init() {
    this.targets.map((s)=>process.on(s, ()=>{
      this.node.logger.info("Shutdown process start.");
      this._execShutdown();
    }));
  }
  _execShutdown() {
    this.node.stop()
    .then(()=>{
      this.node.logger.info("Shutdown process has completed.");
      setImmediate(function() {
				process.exit(0);
			});
    })
  }
}

class ServeServer extends ServiceEngine{
  constructor(option) {
    super(option);
    this.port = 13000;
    this.path = option.path;
    this.basePath = option.path[option.path.length - 1] !== "/" ? option.path + "/" : option.path;
    this.mode = option.mode;
    this.serveOption = option.serveOption || {}
  }
  
  start(node) {
    return Promise.resolve()
    .then(()=>this._startWebServer())
      .then(()=>node.mount(this.path, this.mode, this))
      .then((ret)=>this.mountId = ret)
      .then(()=>node.logger.info("rn-serve-server started. Try to access '" + coreNodeUrl + this.path + "'"))
      .then(()=> this.rnode = node)
  }

  stop(node) {
    return Promise.resolve()
      .then(async ()=>{
        if (this.mountId == null) {
          await node.unmount(this.mountId)
        }
        return this._stopWebServer();
      })
  }

  _startWebServer() {
    return Promise.resolve()
      .then(()=>{
        const server = http.createServer((request, response) => {
          return handler(request, response, Object.assign({}, this.serveOption, {
            "public": "public"
          }));
        })
         
        server.listen(this.port, () => {
          console.log('listening on port ' + this.port);
        });
      })
  }

  _stopWebServer() {
    return Promise.resolve()
      .then(()=>{
        this.server.close();
      })
  }

  onReceive(req, res) {
    return Promise.resolve()
      .then(() => {
        var method = req.method || "GET";
        if (method !== "GET" && method !== "POST") {
          this.rnode.logger.error("This sample support only GET|POST method.");
          return Promise.reject(new Error("This sample support only GET|POST method."));
        }
        if (req.url.indexOf(this.basePath) !== 0) {
          this.rnode.logger.error("Unexpected path is detected:" + req.url);
          return Promise.reject(new Error("Unexpected path is detected:" + req.url));
        }
        return new Promise((resolve, reject)=>{
          var cb = (e, r, b)=> {
            if (e) {
              this.rnode.logger.error("Failed to proxy backend", e);
              reject(e);
              return;
            }
            //copy properties
            var targetProps = ["headers", "statusCode" ];
            targetProps.forEach((p)=>res[p] = r[p]);
            res.end(b);
            resolve(res);
          };

          var dstPath = String(req.url).substr(this.basePath.length-1);
          var url = "http://localhost:" + this.port + dstPath;
          var option = {
            url,
            headers: Object.assign({}, req.headers),
            encoding: null
          };
          this._convertBody(option,  req.body);
          if (method === "GET") {
            webClient.get(option, cb);
          } else {
            webClient.post(option, cb);
          }
        });
      })
  }

  _convertBody(option, body) {
    if (body == null) {
      return ;
    }
    if (typeof body === "object" && Object.keys(body).length === 0) {
      return ;
    }
    if (body instanceof Buffer || typeof body === "string") {
      option.body = body;
    } else {
      option.body = JSON.stringify(body);
    }
    if (option.headers) {
      delete option.headers["content-length"];

      // Body has already been decoded by core-node.
      delete option.headers["content-encoding"];
    }
  }
  
}

var rnode = new ResourceNode(coreNodeUrl, nodeClass);
rnode.registerServiceClasses({
  ServeServer
});
if (jwtToken) {
  rnode.setJWTAuthorization(jwtToken, jwtRefreshPath);
}
rnode.start()
  .then(() => {
    new SignalHandler(rnode);
    rnode.logger.info("Succeeded to start resource-node");
  }).catch((e) => {
    rnode.logger.info("Failed to start resource-node", e);
    rnode.stop();
  })

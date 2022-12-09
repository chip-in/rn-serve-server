import { ResourceNode, ServiceEngine} from '@chip-in/resource-node';
const handler = require('serve-handler');
import http from 'http'

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
          var dstPath = String(req.url).substr(this.basePath.length-1);
          var forwardUrl = url.parse(
            "http://localhost:" + this.port + dstPath
          )
          
          var option = {
            host: forwardUrl.hostname,
            port: forwardUrl.port,
            path: forwardUrl.path,
            method: method,
            headers: req.headers,
          };
          if (option.headers) delete option.headers.host
          let responseCode
          const proxyRequest = http
            .request(option)
            .on('error', (e) => {
              console.error(e)
              responseCode = 502
              res.statusCode = 502
              res.end()
              resolve(res)
            })
  
            .on('timeout', () => {
              responseCode = 504
              res.statusCode = 504
              res.end()
              resolve(res)
            })
            .on('response', (proxyRes) => {
              responseCode = proxyRes.statusCode
              res.writeHead(proxyRes.statusCode, proxyRes.headers)
              let data = ''
              proxyRes
                .on('data', function (chunk) {
                  data += chunk
                })
                .on('end', function () {
                  res.end(data)
                  resolve(res)
                })
                .on('error', function () {
                  res.writeStatus(proxyRes.statusCode)
                  res.end()
                  resolve(res)
                })
            })
            .on('close', () => {
            })
          req.pipe(proxyRequest)
        });
      })
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

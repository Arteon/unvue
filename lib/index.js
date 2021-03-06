const path = require('path')
const url = require('url')
const EventEmitter = require('events')
const fs = require('fs-promise')
const express = require('express')
const rm = require('rimraf')
const chalk = require('chalk')
const serialize = require('serialize-javascript')
const getPort = require('get-port')
const ip = require('internal-ip')
const Router = require('./router')
const { promisify } = require('./utils')
const createConfig = require('./create-config')

function createRenderer(bundle, template) {
  return require('vue-server-renderer').createBundleRenderer(bundle, {
    template,
    cache: require('lru-cache')({
      max: 1000,
      maxAge: 1000 * 60 * 15
    })
  })
}

function renderTemplate(template, context) {
  const {
    title, link, style, script, noscript, meta
  } = context.meta.inject()

  let [start, end] = template.split('<!--unvue-app-placeholder-->')

  start = start
    .replace('<!--unvue-head-placeholder-->', `${meta.text()}
      ${title.text()}
      ${link.text()}
      ${style.text()}
      ${script.text()}
      ${noscript.text()}`)
    .replace('<!--unvue-styles-placeholder-->', context.styles || '')

  end = `<script>window.__INITIAL_STATE__=${serialize(context.state, { isJSON: true })}</script>` + end

  return {
    start,
    end
  }
}

const serveStatic = (path, cache) => express.static(path, {
  maxAge: cache ? '1d' : 0
})

class UNVUE extends EventEmitter {
  constructor(options = {}) {
    super()

    this.options = {
      cwd: options.cwd || process.cwd(),
      extendWebpack: options.extendWebpack,
      html: options.html,
      entry: options.entry
    }

    this.dev = options.dev
    process.env.NODE_ENV = this.dev ? 'development' : 'production'

    this.preFetchCache = require('lru-cache')(Object.assign({
      max: 1000,
      maxAge: 1000 * 60 * 15
    }, options.preFetchCache))

    this.webpackConfig = {}
  }

  setWebpackConfig() {
    this.webpackConfig.client = createConfig(Object.assign({}, this.options, {
      type: 'client',
      dev: this.dev,
      port: this.devServerPort,
      host: this.devServerHost
    })).toConfig()

    this.webpackConfig.server = createConfig(Object.assign({}, this.options, {
      type: 'server',
      dev: this.dev
    })).toConfig()
  }

  handleCompiled(type) {
    return payload => {
      this.stats[type] = payload.stats
      this.template = payload.template
      if (!this.renderer) {
        this.renderer = createRenderer(payload.bundle)
      }
      this.emit('ready')
    }
  }

  prepare() {
    const pipe = Promise.resolve()

    if (this.dev) {
      this.stats = {}
      this.on('compiled:server', this.handleCompiled('server'))
      this.on('compiled:client', this.handleCompiled('client'))

      return pipe.then(() => getPort())
        .then(port => {
          const host = ip.v4()
          this.devServerHost = host
          this.devServerPort = port
          this.setWebpackConfig()
          return { port, host }
        })
        .then(devServerOptions => {
          require('./setup-dev-server')(this, devServerOptions)
        })
    }

    const bundle = require(this.getCwd('./dist/vue-ssr-bundle.json'))
    this.template = fs.readFileSync(this.getCwd('./dist/index.html'), 'utf-8')
    this.renderer = createRenderer(bundle)
    return pipe.then(() => {
      this.emit('ready')
    })
  }

  getCwd(...args) {
    return path.resolve(this.options.cwd, ...args)
  }

  build() {
    this.setWebpackConfig()
    return require('./build')(this.webpackConfig).then(([clientStats, serverstats]) => {
      this.stats = {
        client: clientStats,
        server: serverstats
      }
      this.emit('ready')
    })
  }

  generate({
    routes,
    homepage = '/'
  } = {}) {
    if (!routes) return Promise.reject(new Error('missing `routes` option'))

    const handleUrl = url => {
      if (/\/$/.test(url)) return url + 'index'
      return url
    }

    const g = () => Promise.all(routes.map(url => {
      const context = { url }

      return promisify(this.renderer.renderToString)(context)
        .then(main => {
          const { start, end } = renderTemplate(this.template, context)
          return start + main + end
        })
        .then(html => {
          const file = this.getCwd('dist' + handleUrl(url) + '.html')
          return fs.ensureDir(path.dirname(file))
            .then(() => {
              return fs.writeFile(file, html, 'utf8')
            })
        })
    }))

    return this.build({ homepage })
      .then(() => this.prepare())
      .then(() => g())
      .then(() => {
        rm.sync(this.getCwd('dist', 'vue-ssr-bundle.json'))
        return this.getCwd('dist')
      })
  }

  getRequestHandler() {
    const router = new Router()

    const serverInfo = `unvue/${require('../package.json').version}`

    const routes = {
      '/dist/*': (req, res) => {
        if (this.dev) {
          return require('http-proxy').createProxyServer({
            target: `http://${this.devServerHost}:${this.devServerPort}`
          }).web(req, res)
        }
        serveStatic(this.getCwd(), !this.dev)(req, res)
      },
      '/public/*': serveStatic(this.getCwd(), !this.dev),
      '*': (req, res) => {
        if (!this.renderer) {
          return res.end('waiting for compilation... refresh in a moment.')
        }

        const s = Date.now()

        res.setHeader('Content-Type', 'text/html')
        res.setHeader('Server', serverInfo)

        const errorHandler = err => {
          if (err && err.code === 404) {
            res.statusCode = 404
            res.end('404 | Page Not Found')
          } else {
            // Render Error Page or Redirect
            res.statucCode = 500
            res.end('500 | Internal Server Error')
            console.error(`error during render : ${req.url}`)
            console.error(err)
          }
        }

        const context = { url: req.url, preFetchCache: this.preFetchCache }

        const renderStream = this.renderer.renderToStream(context)

        let splitedContent

        renderStream.once('data', () => {
          splitedContent = renderTemplate(this.template, context)
          res.write(splitedContent.start)
        })

        renderStream.on('data', chunk => {
          res.write(chunk)
        })

        renderStream.on('end', () => {
          res.end(splitedContent.end)
          console.log(`> Whole request: ${Date.now() - s}ms`)
        })

        renderStream.on('error', errorHandler)
      }
    }

    for (const method of ['GET', 'HEAD']) {
      for (const p of Object.keys(routes)) {
        router.add(method, p, routes[p])
      }
    }

    return (req, res) => {
      router.match(req, res, url.parse(req.url, true))
    }
  }
}

module.exports = function (options) {
  return new UNVUE(options)
}

module.exports.displayStats = function (stats = {}) {
  if (!stats.server && !stats.client) return

  process.stdout.write('\u001Bc')

  // If one of the compilations errors
  // print error and stop
  const anyStats = stats.server || stats.client
  if (anyStats.hasErrors() || anyStats.hasWarnings()) {
    if (anyStats.hasErrors()) {
      console.log(anyStats.toString('errors-only'))
      console.log(`\n${chalk.bgRed.black(' ERROR ')} Compiled with errors!\n`)
      process.exitCode = 1
    } else if (anyStats.hasWarnings()) {
      console.log(anyStats.toString('errors-only'))
      console.log(`\n${chalk.bgYellow.black(' WARN ')} Compiled with warning!\n`)
      process.exitCode = 0
    }
    return
  }

  // Compiled successfully
  // print client assets
  const statsOption = {
    children: false,
    chunks: false,
    modules: false,
    colors: true
  }

  if (stats.client) {
    console.log(stats.client.toString(statsOption))
    console.log(`\n${chalk.bgGreen.black(' SUCCESS ')} Compiled successfully!\n`)
  }
}

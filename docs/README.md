# unvue

[![NPM version](https://img.shields.io/npm/v/unvue.svg?style=flat)](https://npmjs.com/package/unvue) [![NPM downloads](https://img.shields.io/npm/dm/unvue.svg?style=flat)](https://npmjs.com/package/unvue) [![Build Status](https://img.shields.io/circleci/project/egoist/unvue/master.svg?style=flat)](https://circleci.com/gh/egoist/unvue) [![codecov](https://codecov.io/gh/egoist/unvue/branch/master/graph/badge.svg)](https://codecov.io/gh/egoist/unvue)
 [![donate](https://img.shields.io/badge/$-donate-ff69b4.svg?maxAge=2592000&style=flat)](https://github.com/egoist/donate)

> unopinionated, universal Vue.js app made simple

## Introduction

Server-side rendered Vue.js app should be made easy, since vue-router is well optimized for SSR, we built unvue on the top of it to make you build universal Vue.js app fast with fewer trade-offs, the only requirement is to export router instance in your entry file, which means you have full control of vue-router as well!

You can [try unvue with the online playground!](https://glitch.com/~unvue)

## Install

```bash
yarn add unvue
```

## Usage

Add npm scripts:

```js
{
  "scripts": {
    "build": "unvue build",
    "start": "unvue start",
    "dev": "unvue dev"
  }
}
```

Then populate an `src/index.js` in current working directory and it should export at least `router` instance:

```js
// your vue router instance
import router from './router'

export { router }
```

Run `npm run dev` to start development server.

To run in production server, run `npm run build && npm start`

### Root component

By default we have a [built-in root component](https://github.com/egoist/unvue/blob/master/app/App.vue), you can export a custom one as well:

```js
// src/index.js
import App from './components/App.vue'

export { App }
```

The `App` component will be used in creating Vue instance:

```js
new Vue({
  render: h => h(App)
})
```

### Vuex

You don't have to use Vuex but you can, export Vuex instance `store` in `src/index.js` to enable it:

```js
import store from './store'

export { store }
```

#### preFetch

Every router-view component can have a `preFetch` property to pre-fetch data to fill Vuex store on the server side.

```js
export default {
  preFetch({ store }) {
    return store.dispatch('asyncFetchData')
  }
}
```

If the action you want to perfom in `preFetch` method is async, it should return a Promise.

#### preFetchCache

Similar to `preFetch` but you can cache data across requests:

```js
export default {
  // component name is required
  name: 'my-view',
  preFetchCache({ store, cache }) {
    return store.dispatch('fetchUser', { cache, user: 1 })
  }
}
```

Then in your store, it can have such shape:

```js
{
  actions: {
    fetchUser({ commit }, payload) {
      // use cache if possible
      if (payload.cache) return commit('SET_USER', cache)
      return fetch('/user/' + payload.user)
        .then(res => res.json())
        .then(user => {
          commit('SET_USER', user)
          // the resolved value would be `cache` in next request
          return user
        })
    }
  }
}
```

### Modify `<head>`

`unvue` uses [vue-meta](https://github.com/declandewet/vue-meta) under the hood, so you can just set `head` property on Vue component to provide custom head tags:

```js
export default {
  head: {
    title: 'HomePage'
  }
}
```

Check out [vue-meta](https://github.com/declandewet/vue-meta) for details, its usage is the same here except that we're using `head` instead of `metaInfo` as key name.

### webpack

#### Code split

You can use `import()` or `require.ensure()` to split modules for lazy-loading.

#### JS

JS is transpiled by Babel using [babel-preset-vue-app](https://github.com/egoist/babel-preset-vue-app), which means you can use all latest ECMAScript features and stage-2 features.

#### CSS

Support all CSS preprocessors, you can install its loader to use them, for example to use `scss`

```js
yarn add sass-loader node-sass --dev
```

#### Public folder

`./dist` folder is served as static files, and files inside `./static` will be copied to `./dist` folder as well.

`./public` folder is also served as static files.

#### Development

Hot Reloading enabled

#### Production

3rd-party libraries are automatically extracted into a single `vendor` chunk.

All output files are minifies and optimized.

## FAQ

### Here's a missing feature!

**"Can you update webpack config *this way* so I can use that feature?"** If you have the same question, before we actually think this feature is necessary and add it, you can [extend webpack config](#extendwebpack) yourself to implement it. With [webpack-chain](https://github.com/mozilla-rpweb/webpack-chain) you have full control of our webpack config, check out the default [config instance](/lib/create-config.js).


## Contributing

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D


## Author

**unvue** © [egoist](https://github.com/egoist), Released under the [MIT](https://github.com/egoist/unvue/blob/master/LICENSE) License.<br>
Authored and maintained by egoist with help from contributors ([list](https://github.com/egoist/unvue/contributors)).

> [egoistian.com](https://egoistian.com) · GitHub [@egoist](https://github.com/egoist) · Twitter [@rem_rin_rin](https://twitter.com/rem_rin_rin)

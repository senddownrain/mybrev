# base

## Project setup

```
# yarn
yarn

# npm
npm install

# pnpm
pnpm install
```

### Compiles and hot-reloads for development

```
# yarn
yarn dev

# npm
npm run dev

# pnpm
pnpm dev
```

### Compiles and minifies for production

```
# yarn
yarn build

# npm
npm run build

# pnpm
pnpm build
```

### Deploy to Firebase Hosting

Build the current local version and deploy it without pushing to GitHub:

```sh
npm run deploy:hosting
```

Push the current branch to GitHub, then build and deploy it:

```sh
npm run release:hosting
```

The release command requires a clean Git working tree. It stops immediately if
there are uncommitted files or if `git push` fails, so Firebase is never deployed
after an unsuccessful push. Commit your changes before running it and make sure
the current branch has an upstream branch configured.

### Lints and fixes files

```
# yarn
yarn lint

# npm
npm run lint

# pnpm
pnpm lint
```

### Customize configuration

See [Configuration Reference](https://vitejs.dev/config/).

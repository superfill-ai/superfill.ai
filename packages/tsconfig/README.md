# @superfill/tsconfig

Shared TypeScript configurations for the Superfill.ai monorepo.

## Usage

### For React projects (extension, desktop UI)

```json
{
  "extends": "@superfill/tsconfig/react.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### For Node.js projects (desktop backend)

```json
{
  "extends": "@superfill/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "./dist"
  }
}
```

### For generic TypeScript packages

```json
{
  "extends": "@superfill/tsconfig/base.json"
}
```

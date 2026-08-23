# borth

Tiny experimental stack-based language.

Current scope: a tiny source string can run through lexer, parser, compiler, bytecode, and VM.

```sh
yarn install
yarn build
yarn borth -- "10 20 + print"
```

Expected output:

```text
30
```

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

Current words:

```text
drop  ( A -- )
dup   ( A -- A A )
swap  ( A B -- B A )

+     ( A B -- C )
-     ( A B -- C )
*     ( A B -- C )
/     ( A B -- C )
mod   ( A B -- C )

=     ( A B -- 0|1 )
<     ( A B -- 0|1 )
>     ( A B -- 0|1 )

print ( A -- )
```

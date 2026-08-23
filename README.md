# borth

Tiny experimental stack-based language.

Current scope: a tiny source string can run through lexer, parser, compiler, bytecode, and VM.

```sh
yarn install
yarn build
yarn test
yarn borth -- "10 20 + print"
yarn borth -- examples/add.borth
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
over  ( A B -- A B A )

+     ( A B -- C )
-     ( A B -- C )
*     ( A B -- C )
/     ( A B -- C )
mod   ( A B -- C )

=     ( A B -- 0|1 )
<     ( A B -- 0|1 )
>     ( A B -- 0|1 )

print ( A -- )
.s    ( -- )
```

User-defined words:

```text
: square
  dup *
;

10 square print
```

Recursive words work too:

```text
: fact
  dup 2 < if
    drop 1
  else
    dup 1 - fact *
  end
;

5 fact print
```

Use `.s` to print the current stack without changing it:

```text
10 20 .s + .s
```

Conditionals consume a flag from the top of the stack. `0` is false; any other integer is true.

```text
10 20 < if
  999 print
end

10 20 > if
  111 print
else
  222 print
end
```

Comment lines start with `#`:

```text
# Square a number.
10 dup * print
```

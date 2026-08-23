# borth

Tiny experimental stack-based language.

Current scope: tiny programs can run through lexer, parser, compiler, bytecode, and VM.

```sh
yarn install
yarn build
yarn test
yarn borth -- "10 20 + print"
yarn borth -- '"hello, borth" print'
yarn borth -- examples/add.borth
yarn borth -- examples/echo.borth
yarn borth -- examples/double-input.borth
```

Expected output:

```text
30
```

Current VM words:

```text
drop  ( A -- )
dup   ( A -- A A )
swap  ( A B -- B A )
over  ( A B -- A B A )
rot   ( A B C -- B C A )

+     ( A B -- C )
-     ( A B -- C )
*     ( A B -- C )
/     ( A B -- C )
mod   ( A B -- C )

=     ( A B -- 0|1 )
<     ( A B -- 0|1 )
>     ( A B -- 0|1 )

read-line ( -- string )
read-int  ( -- number )
print ( A -- )
.s    ( -- )
```

Prelude words:

```text
not   ( flag -- flag )
and   ( A B -- flag )
or    ( A B -- flag )
nip   ( A B -- B )
tuck  ( A B -- B A B )
```

The prelude is loaded before every program from `prelude.borth`.

Values:

```text
123
"hello"
"line one\nline two"
```

Strings can contain whitespace, but they cannot span source lines. Supported escapes are `\"`, `\\`, and `\n`.

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

`read-line` reads one line from stdin:

```sh
printf 'hello\n' | yarn borth -- examples/echo.borth
```

`read-int` reads one line from stdin and parses it as an integer:

```sh
printf '21\n' | yarn borth -- examples/double-input.borth
```

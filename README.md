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
yarn borth -- examples/introduce.borth
yarn borth -- examples/import-math.borth
yarn borth -- examples/next-token-rest.borth
yarn borth -- examples/random-print.borth
yarn borth -- examples/counter.borth
yarn borth -- examples/while-count.borth
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
roll  ( Xn ... X0 n -- Xn-1 ... X0 Xn )
-roll ( Xn ... X0 n -- X0 Xn ... X1 )

+     ( A B -- C )
-     ( A B -- C )
*     ( A B -- C )
/     ( A B -- C )
mod   ( A B -- C )

=     ( number number -- 0|1 ) or ( string string -- 0|1 )
<     ( number number -- 0|1 )
>     ( number number -- 0|1 )

str-len      ( string -- number )
str-cat      ( string string -- string )
str-slice    ( string start length -- string )
str-index-of ( string needle start -- index )
show         ( A -- string )

array-new  ( -- array )
array-push ( array A -- array )
array-len  ( array -- number )
array-get  ( array index -- A )

random ( max -- n )
@      ( addr -- A )
!      ( A addr -- )
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
2dup  ( A B -- A B A B )
random-between ( min max -- n )
```

The prelude is loaded before every program from `prelude.borth`.

Values:

```text
123
"hello"
"line one\nline two"
```

Strings can contain whitespace, but they cannot span source lines. Supported escapes are `\"`, `\\`, and `\n`.

`str-cat` concatenates two strings:

```text
"hello, " "borth" str-cat print
```

`show` converts one value into its debug string representation, useful before
concatenating debug output:

```text
"index=" 3 show str-cat print
```

String indexes are zero-based. `str-index-of` starts searching at the given
index and returns `-1` when the needle is not found.

```text
"hello" str-len print
"hello" 1 3 str-slice print
"hello" "l" 3 str-index-of print
```

Arrays are runtime values built with words rather than literal syntax:

```text
array-new
"integer" array-push
123 array-push
show print
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

Loops run at least once. `until` consumes a flag from the top of the stack. It exits when the flag is non-zero and loops when the flag is `0`.

```text
1 loop
  dup print
  1 +
  dup 6 =
until
drop
```

Pre-test loops check a condition before each body run. `while` consumes a flag
from the top of the stack. It exits when the flag is `0`; `repeat` jumps back
to the start of the loop.

```text
0

loop
  dup 5 <
while
  dup print
  1 +
repeat

drop
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

`random` returns an integer from `0` to `max - 1`; `random-between` returns an integer in the inclusive range:

```text
1 100 random-between print
```

Variables are global cells. A variable name pushes its address; `@` fetches from
an address and `!` stores into an address.

```text
variable count
0 count !
count @ print
```

Files can import definitions and variables from other Borth files. Imports are
resolved relative to the importing file, and transitive imports share the same
global word scope.

```text
import "lexer-lib.borth"

"10 20 +" lex-src
```

Imported files are library modules: they can contain imports, variables, and
word definitions, but not loose top-level executable code.

The `lib/` directory contains reusable Borth modules:

```text
import "lib/strings.borth"

"-123" str-int? print
"-123" str-to-int print
```

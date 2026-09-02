# Borth Syntax

Minimal VS Code syntax highlighting for `.borth` files.

This extension intentionally uses a shallow TextMate grammar. It highlights
comments, strings, integers, definitions, variables, imports, control words,
current VM words, and a few prelude/library words. It does not parse programs
or validate stack effects.

## Test Locally

From this repository:

```sh
code --extensionDevelopmentPath="$PWD/vscode-borth" "$PWD"
```

Open a `.borth` file in the new Extension Development Host window.

## Package and Install

To install this in normal VS Code windows, package it as a `.vsix` file:

```sh
cd vscode-borth
npx --yes @vscode/vsce package
code --install-extension borth-syntax-0.0.1.vsix
```

After reinstalling a changed `.vsix`, reload any open VS Code windows.

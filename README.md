# tldraw-cli

Headless CLI for creating and manipulating `.tldr` files.

## Install

```bash
npm install
npm run build
```

## Commands

```bash
tldraw create <file.tldr> [--name <name>]
tldraw add <shape> <file.tldr> [content] [options]
tldraw list <file.tldr> [--json | --ids]
tldraw remove <target> <file.tldr>
tldraw remove --all <file.tldr>
tldraw info <file.tldr>
```

## Add Options

```bash
--pos <x,y>
--size <WxH|s|m|l|xl>
--dimensions <WxH>
--color <name>
--fill <style>
--dash <style>
--font <style>
--label <text>
--id <shapeId>
--from <target>   # arrows only
--to <target>     # arrows only
```

`<shape>` supports: `rect`, `ellipse`, `text`, `arrow`, `frame`, `note`.

## Development

```bash
npm test
npm run build
```

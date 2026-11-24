# Zolight

A [Zotero](https://www.zotero.org) plugin that highlights words in an item's abstract, with a different color for each word and support for wildcards.

## Features

- Adds a **Highlighted Abstract** section to the item pane for the selected article.
- Wildcards: `*` matches any run of letters (`neuro*` finds *neuroscience*, *neurons*), `?` matches one letter.
- Phrases work too (`machine learning`), matching is case-insensitive and whole-word.
- One color per word: click the dot on a word's chip to change it, click × to remove it.
- Shows how many matches were found. Words and colors are remembered between sessions.

Enter words one per line or comma-separated. Lines starting with `#` are ignored.

## Install

1. Download the latest `.xpi` from the [Releases](../../releases) page.
2. In Zotero: **Tools → Plugins**, click the gear icon, **Install Plugin From File…**, and pick the `.xpi`.

Requires Zotero 9 or newer (tested on 10.0).

## License

MIT

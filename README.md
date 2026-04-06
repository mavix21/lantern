<p align="center">
  <img src="./lantern.jpg" alt="lantern" width="280" />
</p>

<h1 align="center" style="font-size: 3rem;">Lantern</h1>

<p align="center">
  <i align="center">A terminal-based presentation tool built with Node.js, Ink, Yargs, and Bun. Write your slides in Markdown, present them in the terminal. Lantern is heavily inspired by <code><a href="https://github.com/maaslalani/slides">slides</a></code>.</i>
</p>

## ⚙️ Installation

```bash
bun add lantern
```

## 📦 Technologies

- `Ink` - React for terminal UI
- `Yargs` - Command-line argument parsing
- `TypeScript` - Type-safe JavaScript
- `Bun` - Fast runtime and package manager
- `Node.js` - Runtime environment

## 🪄 Features

Here's what you can do with Lantern:

### 📝 Write slides in Markdown

Create a markdown file with your slides:

```markdown
# Slide 1

This is the **first** slide.

---

# Slide 2

This is the **second** slide.
```

Then to present your slides, run:

```bash
lantern presentation.md
```

### 🧭 Navigate with keyboard shortcuts

Go to the first slide with the following key sequence:

- `g` `g` - First slide

Go to the next slide with any of the following key sequences:

- `space`
- `enter`
- `l`
- `→`
- `n`
- `Page Down`

Go to the previous slide with any of the following key sequences:

- `backspace`
- `h`
- `←`
- `p`
- `Page Up`

Go to a specific slide with the following key sequence:

- `:` followed by a number (e.g., `:5` for slide 5). Press `Enter` to confirm.

Go to the last slide with the following key:

- `G`

### 🔎 Search

Press `/` to search for text anywhere in the presentation, and then press `Enter` to confirm.

Press `n` to navigate to the next search result. Press `N` to navigate to the previous search result.

### 🔌 Configuration with front matter

You can add configuration to your markdown file using front matter:

```md
---
author: John Doe
date: MMMM dd, YYYY
paging: Page %d of %d
---
```

- `author` - A `string` displayed on the bottom-left corner of the presentation view. Defaults to OS current user's full name. Can be empty to hide the author.
- `date` - A `string` used to format today's date in `YYYY-MM-DD` format. If the date format is not valid, the string will be displayed. Defaults to `YYYY-MM-DD`.
- `paging` - A `string` that defines the paging format (e.g., "Page %d of %d"). The first `%d` is the current slide number, and the second `%d` is the total number of slides. Displayed on the bottom-right corner. Defaults to `Slide %d / %d`.

#### Date format

Given the date August 09, 2007:

Value Translates to
YYYY 2007
YY 07
MMMM August
MMM Aug
MM 08
mm 8
DD 09
dd 9

## 📚 What I Learned

This project was built as a learning exercise to understand how command-line applications work under the hood. By building Lantern from scratch, I explored:

- How CLI tools parse arguments and handle user input
- The architecture of terminal-based UIs using React and Ink
- The role of package managers like Bun and npm
- How Markdown parsing and rendering works in a terminal environment

The goal was to gain hands-on experience with the building blocks of modern CLI tools, rather than just using existing frameworks.

## 💭 How can it be improved?

- Add support for animations and transitions between slides
- Implement a more sophisticated Markdown parser
- Add support for custom themes and styling
- Add support for embedded media (images, videos, etc.)
- Add support for speaker notes and audience view

## Contributing

Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## License

MIT

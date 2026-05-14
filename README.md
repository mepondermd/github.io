# Z-Code Interpreter App

This repository now includes a terminal app (`zcode_app.py`) for running classic Infocom-style Z-code story files with an installed Frotz interpreter.

## What it does

- Runs `.z3`, `.z5`, `.z8` (and similar) story files.
- Uses `dfrotz` (or `frotz`) from your `PATH`.
- Provides an interactive terminal session so you can play text adventures directly.

## Requirements

Install one of:

- `dfrotz`
- `frotz`

## Usage

```bash
python3 zcode_app.py /path/to/story.z5
```

Optional deterministic RNG seed:

```bash
python3 zcode_app.py /path/to/story.z5 --seed 42
```

## Notes

- If no compatible interpreter is installed, the app exits with a clear error message.
- Press `Ctrl-C` to send an interrupt to the running game process.

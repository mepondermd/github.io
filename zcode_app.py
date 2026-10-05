#!/usr/bin/env python3
"""Terminal app that runs classic Infocom Z-code games via dfrotz/frotz."""

from __future__ import annotations

import argparse
import os
import pty
import select
import shutil
import signal
import sys
import termios
import tty
from pathlib import Path


def find_interpreter() -> str | None:
    for name in ("dfrotz", "frotz"):
        path = shutil.which(name)
        if path:
            return path
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Z-code stories (.z3/.z5/.z8) through dfrotz/frotz in an interactive shell."
    )
    parser.add_argument("story", type=Path, help="Path to the Z-code story file")
    parser.add_argument(
        "--seed", type=int, default=None, help="Optional deterministic RNG seed passed to frotz"
    )
    return parser.parse_args()


def build_command(interpreter: str, args: argparse.Namespace) -> list[str]:
    cmd = [interpreter, "-m"]
    if args.seed is not None:
        cmd.extend(["-s", str(args.seed)])
    cmd.append(str(args.story))
    return cmd


def run_story(command: list[str]) -> int:
    stdin_fd = sys.stdin.fileno()
    if not sys.stdin.isatty():
        print("Interactive terminal required: stdin is not a TTY.", file=sys.stderr)
        return 4

    # Validate terminal access before forking so a failure cannot leave a child
    # interpreter running in the background.
    try:
        old_attrs = termios.tcgetattr(stdin_fd)
    except (OSError, termios.error) as exc:
        print(f"Unable to configure terminal: {exc}", file=sys.stderr)
        return 4

    pid, fd = pty.fork()
    if pid == 0:
        os.execvp(command[0], command)

    tty.setraw(stdin_fd)
    stdin_open = True

    try:
        while True:
            watched = [fd]
            if stdin_open:
                watched.append(sys.stdin)
            readable, _, _ = select.select(watched, [], [])
            if fd in readable:
                try:
                    data = os.read(fd, 4096)
                except OSError:
                    break
                if not data:
                    break
                sys.stdout.buffer.write(data)
                sys.stdout.flush()

            if stdin_open and sys.stdin in readable:
                chunk = os.read(stdin_fd, 1024)
                if not chunk:
                    # A PTY cannot be half-closed. VEOF is the terminal
                    # equivalent; stop watching stdin to avoid a select spin.
                    stdin_open = False
                    try:
                        os.write(fd, b"\x04")
                    except OSError:
                        break
                    continue
                if chunk == b"\x03":  # Ctrl-C
                    os.kill(pid, signal.SIGINT)
                    continue
                os.write(fd, chunk)
    finally:
        termios.tcsetattr(stdin_fd, termios.TCSADRAIN, old_attrs)

    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status)


def main() -> int:
    args = parse_args()
    if not args.story.exists():
        print(f"Story file not found: {args.story}", file=sys.stderr)
        return 2

    interpreter = find_interpreter()
    if interpreter is None:
        print(
            "No dfrotz/frotz interpreter found in PATH. Install one, then run this app again.",
            file=sys.stderr,
        )
        return 3

    command = build_command(interpreter, args)
    print(f"Launching: {' '.join(command)}")
    print("Press Ctrl-C to send interrupt to the game process.\n")
    return run_story(command)


if __name__ == "__main__":
    raise SystemExit(main())
